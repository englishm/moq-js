import { Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import * as MP4 from "@moq-js/media"
import * as Message from "./message"
import { asError, Deferred, SubgroupReader, ReadableStreamBuffer, getWorkerLogger, setWorkerLogLevel } from "@moq-js/transport"

const log = getWorkerLogger()

/**
 * Returns true if `e` is the benign "closing an already-errored writable"
 * TypeError that the WHATWG Streams spec throws when the readable side of a
 * TransformStream has been cancelled. The segment was processed; the stream
 * state is just an artifact of how the timeline drops slow/stale segments.
 *
 * We deliberately match on `TypeError` + message substring rather than only
 * the substring, so a different unrelated error containing the same words
 * still surfaces as a real warn.
 */
function isBenignWritableCloseError(e: unknown): boolean {
	if (!(e instanceof TypeError)) return false
	const msg = e.message
	// Chromium-style: "Cannot close a ERRORED writable stream"
	// Firefox-style:  "WritableStream is errored" / "WritableStream.close: ..."
	// Be tolerant of wording variations across engines.
	return (
		msg.includes("ERRORED writable") ||
		msg.includes("errored writable") ||
		msg.includes("WritableStream is errored") ||
		(msg.includes("WritableStream") && msg.includes("errored"))
	)
}

class Worker {
	// Timeline receives samples, buffering them and choosing the timestamp to render.
	#timeline = new Timeline()

	// A map of init tracks.
	#inits = new Map<string, Deferred<Uint8Array>>()

	// Renderer requests samples, rendering video frames and emitting audio frames.
	#audio?: Audio.Renderer
	#video?: Video.Renderer

	on(e: MessageEvent) {
		const msg = e.data as Message.ToWorker

		if (msg.logLevel !== undefined) {
			// Update the module-level worker log level so all worker loggers re-read it.
			setWorkerLogLevel(msg.logLevel)
		} else if (msg.config) {
			this.#onConfig(msg.config)
		} else if (msg.init) {
			// TODO buffer the init segment so we don't hold the stream open.
			this.#onInit(msg.init)
		} else if (msg.segment) {
			this.#onSegment(msg.segment).catch((e) => log.warn("onSegment failed", e))
		} else if (msg.play === false) {
			this.#onPause(msg.play)
		} else if (msg.play === true) {
			this.#onPlay(msg.play)
		} else {
			throw new Error(`unknown message: + ${JSON.stringify(msg)}`)
		}
	}

	#onConfig(msg: Message.Config) {
		if (msg.audio) {
			this.#audio = new Audio.Renderer(msg.audio, this.#timeline.audio)
		}

		if (msg.video) {
			this.#video = new Video.Renderer(msg.video, this.#timeline.video)
		}
	}

	#onInit(msg: Message.Init) {
		let init = this.#inits.get(msg.name)
		if (!init) {
			init = new Deferred()
			this.#inits.set(msg.name, init)
		}

		init.resolve(msg.data)
	}

	async #onSegment(msg: Message.Segment) {
		let init = this.#inits.get(msg.init)
		if (!init) {
			init = new Deferred()
			this.#inits.set(msg.init, init)
		}

		// Create a new stream that we will use to decode.
		const container = new MP4.Parser(await init.promise)

		const timeline = msg.kind === "audio" ? this.#timeline.audio : this.#timeline.video
		const reader = new SubgroupReader(msg.header, new ReadableStreamBuffer(msg.stream, msg.buffer))

		// Create a queue that will contain each MP4 frame.
		const queue = new TransformStream<MP4.Frame>({})
		const segment = queue.writable.getWriter()
		let objectCount = 0
		let frameCount = 0
		let firstVideoFrameLogged = false

		// Add the segment to the timeline
		const segments = timeline.segments.getWriter()
		await segments.write({
			sequence: msg.header.group_id,
			frames: queue.readable,
		})
		segments.releaseLock()

		// Tracks whether the per-segment writable became un-usable mid-stream.
		// The timeline can cancel the readable side of `queue` when it decides
		// this segment is too slow / stale; that errors the writable. Once
		// dropped, further writes and the final close() will throw — but that
		// is expected, non-fatal behaviour, not a pipeline failure.
		let droppedBySink = false

		// Read each chunk, decoding the MP4 frames and adding them to the queue.
		try {
			for (;;) {
				const chunk = await reader.read()
				if (!chunk) {
					break
				}

				objectCount += 1

				if (!(chunk.object_payload instanceof Uint8Array)) {
					throw new Error(`invalid payload: ${chunk.object_payload}`)
				}

				const frames = container.decode(chunk.object_payload)
				frameCount += frames.length

				if (msg.kind === "video" && !firstVideoFrameLogged && frames.length > 0) {
					const first = frames[0]
					log.debug("video segment first frame", {
						groupId: msg.header.group_id,
						subgroupId: msg.header.subgroup_id,
						objectId: chunk.object_id,
						codec: first.track.codec,
						isSync: first.sample.is_sync,
						cts: first.sample.cts,
						dts: first.sample.dts,
						duration: first.sample.duration,
						framesFromObject: frames.length,
					})

					if (!first.sample.is_sync) {
						log.warn("video segment starts without a keyframe", {
							groupId: msg.header.group_id,
							subgroupId: msg.header.subgroup_id,
							objectId: chunk.object_id,
						})
					}

					firstVideoFrameLogged = true
				}

				if (droppedBySink) {
					// Reader already errored; just drain and discard the rest of
					// the underlying segment so we don't leak the reader.
					continue
				}

				for (const frame of frames) {
					try {
						await segment.write(frame)
					} catch (e) {
						// Timeline dropped this segment as slow/stale. Stop trying
						// to push more frames but keep consuming the upstream
						// reader to completion so we don't leave it half-open.
						droppedBySink = true
						log.debug("segment writable rejected frame; treating as dropped", {
							groupId: msg.header.group_id,
							reason: e instanceof Error ? e.message : String(e),
						})
						break
					}
				}
			}
		} finally {
			if (msg.kind === "video") {
				const details = {
					groupId: msg.header.group_id,
					subgroupId: msg.header.subgroup_id,
					objectCount,
					frameCount,
					firstFrameLogged: firstVideoFrameLogged,
					dropped: droppedBySink,
				}

				if (droppedBySink) {
					log.debug("video segment dropped by timeline", details)
				} else if (!firstVideoFrameLogged) {
					log.warn("video segment produced no frames", details)
				} else {
					log.debug("video segment complete", details)
				}
			}

			// We done. The timeline can drop a segment in two ways:
			//   1. By rejecting a write mid-stream (caught above; droppedBySink=true).
			//   2. By cancelling queue.readable AFTER all writes succeeded — in
			//      which case droppedBySink stays false but queue.writable still
			//      errors, so segment.close() throws
			//      `TypeError: Cannot close a ERRORED writable stream`.
			// Both cases are benign stream-state artifacts of a normal drop, not
			// pipeline failures. Recognise the specific TypeError by message and
			// demote; only re-throw genuinely unexpected errors so they surface
			// at the outer `.catch` in `on()`.
			try {
				await segment.close()
			} catch (e) {
				if (isBenignWritableCloseError(e)) {
					log.debug("ignoring close() on already-errored segment writable", {
						groupId: msg.header.group_id,
						subgroupId: msg.header.subgroup_id,
						droppedBySink,
						reason: e instanceof Error ? e.message : String(e),
					})
				} else {
					// Unexpected: re-surface so the outer .catch in `on()` logs it.
					throw e
				}
			}
		}
	}

	#onPause(play: boolean) {
		if (this.#video && !play) {
			this.#video.pause()
		}
	}

	#onPlay(play: boolean) {
		if (this.#video && play) {
			this.#video.play()
		}
	}
}

// Pass all events to the worker
const worker = new Worker()
self.addEventListener("message", (msg) => {
	try {
		worker.on(msg)
	} catch (e) {
		const err = asError(e)
		log.warn("worker error:", err)
	}
})

// Validates this is an expected message
function _send(msg: Message.FromWorker) {
	postMessage(msg)
}
