import { Timeline } from "./timeline"

import * as Audio from "./audio"
import * as Video from "./video"

import * as MP4 from "../../media/mp4"
import * as Message from "./message"
import { asError } from "../../common/error"
import { Deferred } from "../../common/async"
import { SubgroupReader } from "../../transport/subgroup"
import { ReadableStreamBuffer } from "../../transport/buffer"
import { getWorkerLogger, setWorkerLogLevel } from "../../common/logger"

const log = getWorkerLogger()

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
		// console.log("message: ", msg)

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

		// Read each chunk, decoding the MP4 frames and adding them to the queue.
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
				console.log("[PlaybackWorker] video segment first frame", {
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
					console.warn("[PlaybackWorker] video segment starts without a keyframe", {
						groupId: msg.header.group_id,
						subgroupId: msg.header.subgroup_id,
						objectId: chunk.object_id,
					})
				}

				firstVideoFrameLogged = true
			}

			for (const frame of frames) {
				await segment.write(frame)
			}
		}

		if (msg.kind === "video") {
			const details = {
				groupId: msg.header.group_id,
				subgroupId: msg.header.subgroup_id,
				objectCount,
				frameCount,
				firstFrameLogged: firstVideoFrameLogged,
			}

			if (!firstVideoFrameLogged) {
				console.warn("[PlaybackWorker] video segment produced no frames", details)
			} else {
				console.log("[PlaybackWorker] video segment complete", details)
			}
		}

		// We done.
		await segment.close()
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
