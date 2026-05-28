import * as Message from "./worker/message"
import { Audio } from "./audio"
// import WebWorker from 'web-worker:./Worker.ts';
import MediaWorker from "web-worker:./worker/index.ts"

import { RingShared } from "../common/ring"
import { Root, isAudioTrack } from "@moq-js/catalog"
import { SubgroupHeader, Deferred } from "@moq-js/transport"
import { getGlobalLogger, installWorkerLogReceiver, onLoggerLevelChange } from "@moq-js/transport"
import type { MoqStat } from "@moq-js/transport"

/**
 * Backend configuration. The caller (Player) is responsible for resolving
 * which tracks are actually going to be subscribed to so the backend can
 * skip the audio ring or the canvas/worker video pipeline when not needed.
 */
export interface BackendConfig {
	/** Catalog used to look up audio selection params (sample rate, channels). */
	catalog: Root
	/** Offscreen canvas for the video pipeline. Omit when no video is selected. */
	canvas?: OffscreenCanvas
	/** Selected audio track name. Empty string means no audio. */
	audioTrackName: string
	/** Selected video track name. Empty string means no video. */
	videoTrackName: string
}

// This is a non-standard way of importing worklet/workers.
// Unfortunately, it's the only option because of a Vite bug: https://github.com/vitejs/vite/issues/11823

// Responsible for sending messages to the worker and worklet.
export default class Backend {
	// General worker
	#worker: Worker

	// The audio context, which must be created on the main thread.
	#audio?: Audio

	#eventTarget: EventTarget

	// Dispose function for the logger level change listener
	#disposeLoggerListener: () => void
	// Dispose function for the worker log receiver listener
	#disposeWorkerLogReceiver: () => void
	// Bound message handler stored so the same reference is used for add/remove.
	#onMessage: (e: MessageEvent) => void

	// Pending getStats() requests keyed by monotonic requestId.
	// Each entry is cleared on reply, timeout, or close. The timeout handle
	// is stored alongside the Deferred so it can be cancelled on normal reply.
	#pendingStatsRequests = new Map<number, { deferred: Deferred<MoqStat[]>; timeout: ReturnType<typeof setTimeout> }>()
	#nextStatsRequestId = 1

	// Whether the first video frame has been rendered (for ttff calculation).
	#firstFrameRendered = false
	// Resolved with performance.now() when the first frame renders.
	#firstFrameDeferred = new Deferred<number>()

	constructor(config: BackendConfig, eventTarget: EventTarget) {
		// TODO does this block the main thread? If so, make this async
		this.#worker = new MediaWorker()
		this.#onMessage = this.#on.bind(this)
		this.#worker.addEventListener("message", this.#onMessage)
		this.#eventTarget = eventTarget

		// Install log receiver so worker log records appear in the global logger.
		this.#disposeWorkerLogReceiver = installWorkerLogReceiver(this.#worker)

		// Keep the worker's cached log level in sync whenever the global logger changes.
		this.#disposeLoggerListener = onLoggerLevelChange((level) => {
			this.send({ logLevel: level })
		})

		const msg: Message.Config = {}

		// Audio: only build the ring + AudioContext when the player will actually
		// subscribe to an audio track. Look up that track's selectionParams to
		// derive sampleRate/channels rather than scanning the whole catalog.
		if (config.audioTrackName) {
			const audioTrack = config.catalog.tracks.find((t) => t.name === config.audioTrackName)
			if (!audioTrack || !isAudioTrack(audioTrack)) {
				throw new Error(`audio track ${config.audioTrackName} not in catalog`)
			}
			const sampleRate = audioTrack.selectionParams.samplerate
			// TODO properly handle weird channel configs
			const channels = +audioTrack.selectionParams.channelConfig

			if (sampleRate && channels) {
				msg.audio = {
					channels,
					sampleRate,
					ring: new RingShared(channels, sampleRate / 2), // 500ms
				}
				this.#audio = new Audio(msg.audio)
			}
		}

		// Video: only transfer the canvas when both a canvas is provided and a
		// video track is selected.
		if (config.videoTrackName && config.canvas) {
			msg.video = { canvas: config.canvas }
		}

		// transferControlToOffscreen returns a Transferable; only transfer it when
		// we actually have a canvas to hand over.
		if (msg.video) {
			this.send({ config: msg }, msg.video.canvas)
		} else {
			this.send({ config: msg })
		}

		// Send the initial log level to the worker.
		const logger = getGlobalLogger()
		const initialLevel = typeof logger.level === "function" ? logger.level() : "error"
		this.send({ logLevel: initialLevel })
	}

	pause() {
		this.send({ play: false })
	}

	play() {
		this.send({ play: true })
	}

	async mute() {
		await this.#audio?.context.suspend()
	}

	async unmute() {
		await this.#audio?.context.resume()
	}

	init(init: Init) {
		this.send({ init })
	}

	segment(segment: Segment) {
		this.send({ segment }, segment.stream)
	}

	setVolume(newVolume: number) {
		this.#audio?.setVolume(newVolume)
	}

	getVolume(): number {
		return this.#audio ? this.#audio.getVolume() : 0
	}

	async close() {
		this.#disposeLoggerListener()
		this.#disposeWorkerLogReceiver()
		this.#worker.removeEventListener("message", this.#onMessage)
		this.#worker.terminate()
		// Reject all pending getStats() promises so callers don't hang.
		for (const { deferred, timeout } of this.#pendingStatsRequests.values()) {
			clearTimeout(timeout)
			deferred.reject(new Error("backend closed"))
		}
		this.#pendingStatsRequests.clear()
		// Reject the first-frame deferred if still pending.
		if (!this.#firstFrameRendered) {
			this.#firstFrameDeferred.reject(new Error("backend closed"))
		}
		await this.#audio?.context.close()
	}

	/**
	 * Request a stats snapshot from the worker (and optionally the worklet).
	 * Returns the worker's stat entries. Times out after 250 ms and returns an
	 * empty array rather than rejecting so a slow worker doesn't break the
	 * whole getStats() call.
	 */
	async getWorkerStats(): Promise<MoqStat[]> {
		const requestId = this.#nextStatsRequestId++
		const deferred = new Deferred<MoqStat[]>()
		const timeout = setTimeout(() => {
			if (this.#pendingStatsRequests.has(requestId)) {
				this.#pendingStatsRequests.delete(requestId)
				deferred.resolve([])
			}
		}, 250)
		this.#pendingStatsRequests.set(requestId, { deferred, timeout })
		this.send({ getStats: { requestId } })
		return deferred.promise
	}

	/**
	 * Request worklet stats from the audio subsystem. Returns an empty array
	 * if no audio is active or the worklet times out.
	 */
	async getWorkletStats(): Promise<MoqStat[]> {
		if (!this.#audio) return []
		const entry = await this.#audio.getWorkletStats()
		return entry ? [entry] : []
	}

	/**
	 * Returns a Promise that resolves with the performance.now() timestamp when
	 * the first video frame is rendered. Rejects if the backend is closed first.
	 */
	firstFrameRenderedAt(): Promise<number> {
		return this.#firstFrameDeferred.promise
	}

	// Enforce we're sending valid types to the worker
	private send(msg: Message.ToWorker, ...transfer: Transferable[]) {
		this.#worker.postMessage(msg, transfer)
	}

	#on(e: MessageEvent) {
		// log records are already handled by installWorkerLogReceiver listener.
		if ((e.data as { log?: unknown })?.log) return
		// The video worker posts the raw string "waitingforkeyframe" (not wrapped in FromWorker).
		if (e.data === "waitingforkeyframe") {
			this.#eventTarget.dispatchEvent(new Event("waitingforkeyframe"))
			return
		}

		const msg = e.data as Message.FromWorker

		// Stats reply from worker.
		if (msg.stats) {
			const pending = this.#pendingStatsRequests.get(msg.stats.requestId)
			if (pending) {
				clearTimeout(pending.timeout)
				this.#pendingStatsRequests.delete(msg.stats.requestId)
				pending.deferred.resolve(msg.stats.entries)
			}
			return
		}

		// First frame rendered notification from worker.
		if (msg.firstFrameRendered && !this.#firstFrameRendered) {
			this.#firstFrameRendered = true
			this.#firstFrameDeferred.resolve(performance.now())
		}
	}
}

export interface Init {
	name: string // name of the init track
	data: Uint8Array
}

export interface Segment {
	init: string // name of the init track
	kind: "audio" | "video"
	header: SubgroupHeader
	buffer: Uint8Array
	stream: ReadableStream<Uint8Array>
}
