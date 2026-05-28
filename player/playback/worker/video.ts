import { Frame, Component } from "./timeline"
import * as MP4 from "@moq-js/media"
import * as Message from "./message"
import { getWorkerLogger } from "@moq-js/transport"
import type { VideoStats } from "./stats"

const log = getWorkerLogger()

// Freeze threshold: gap larger than this (ms) while playing triggers a freeze.
const FREEZE_THRESHOLD_MS = 150

interface DecoderConfig {
	codec: string
	description?: ArrayBuffer | Uint8Array | DataView
	codedWidth?: number
	codedHeight?: number
	displayAspectWidth?: number
	displayAspectHeight?: number
	colorSpace?: {
		primaries?: "bt709" | "bt470bg" | "smpte170m"
		transfer?: "bt709" | "smpte170m" | "iec61966-2-1"
		matrix?: "rgb" | "bt709" | "bt470bg" | "smpte170m"
	}
	hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software"
	optimizeForLatency?: boolean
}

export class Renderer {
	#canvas: OffscreenCanvas
	#timeline: Component
	#stats?: VideoStats

	#decoder!: VideoDecoder
	#queue: TransformStream<Frame, VideoFrame>

	#decoderConfig?: DecoderConfig
	#waitingForKeyframe: boolean = true
	#paused: boolean
	#hasSentWaitingForKeyFrameEvent: boolean = false
	// Set to true after the very first frame is drawn; used to post firstFrameRendered.
	#firstFrameSent = false

	constructor(config: Message.ConfigVideo, timeline: Component, stats?: VideoStats) {
		this.#canvas = config.canvas
		this.#timeline = timeline
		this.#stats = stats
		this.#paused = false

		this.#queue = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch((e) => log.error("run failed", e))
	}

	pause() {
		this.#paused = true
		this.#decoder.flush().catch((err) => {
			log.error("flush failed on pause", err)
		})
		this.#waitingForKeyframe = true
	}

	play() {
		this.#paused = false
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#queue).getReader()
		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			// If paused, discard the frame immediately to avoid accumulating
			// VideoFrame objects that are never closed (GPU memory leak).
			if (this.#paused) {
				frame.close()
				continue
			}

			const nowMs = performance.now()
			this.#stats?.onFrameReceived(false /* isKeyframe tracked in #transform */, nowMs)

			// Freeze detection: if the gap since the last render exceeds the threshold
			// while playing, mark a freeze start (recovered in onFrameRendered).
			if (this.#stats) {
				this.#stats.onFrameRendered(nowMs, true /* isPlaying */)
			}

			self.requestAnimationFrame(() => {
				this.#canvas.width = frame.displayWidth
				this.#canvas.height = frame.displayHeight

				const ctx = this.#canvas.getContext("2d")
				if (!ctx) throw new Error("failed to get canvas context")

				ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight) // TODO respect aspect ratio
				frame.close()

				// Notify main thread the first time a frame is rendered (for ttff).
				if (!this.#firstFrameSent) {
					this.#firstFrameSent = true
					postMessage({ firstFrameRendered: true })
				}
			})
		}
	}

	#start(controller: TransformStreamDefaultController<VideoFrame>) {
		this.#decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				this.#stats?.onDecodeOutput(performance.now())
				this.#stats?.updateDecodeQueueSize(this.#decoder.decodeQueueSize)
				controller.enqueue(frame)
			},
			error: (e) => {
				log.error("video decoder error", e)
				if (this.#stats) this.#stats.errorsTotal++
			},
		})
	}

	#transform(frame: Frame) {
		if (this.#decoder.state === "closed" || this.#paused) {
			log.warn("decoder is closed or paused, skipping frame")
			return
		}

		const { sample, track } = frame

		// Reset the decoder on video track change
		if (this.#decoderConfig && this.#decoder.state == "configured") {
			if (MP4.isVideoTrack(track)) {
				const configMismatch =
					this.#decoderConfig.codec !== track.codec ||
					this.#decoderConfig.codedWidth !== track.video.width ||
					this.#decoderConfig.codedHeight !== track.video.height

				if (configMismatch) {
					this.#decoder.reset()
					this.#decoderConfig = undefined
					if (this.#stats) this.#stats.resetsTotal++
				}
			}
		}

		// Configure the decoder with the first frame
		if (this.#decoder.state !== "configured") {
			const desc = sample.description
			const box = desc.avcC ?? desc.hvcC ?? desc.vpcC ?? desc.av1C
			if (!box) throw new Error(`unsupported codec: ${track.codec}`)

			const buffer = new MP4.Stream(undefined, 0, MP4.Stream.BIG_ENDIAN)
			box.write(buffer)
			const description = new Uint8Array(buffer.buffer, 8) // Remove the box header.

			if (!MP4.isVideoTrack(track)) throw new Error("expected video track")

			this.#decoderConfig = {
				codec: track.codec,
				codedHeight: track.video.height,
				codedWidth: track.video.width,
				description,
				// optimizeForLatency: true
			}

			try {
				this.#decoder.configure(this.#decoderConfig)
				log.debug("decoder configured", { codec: track.codec, state: this.#decoder.state })
				if (this.#stats) {
					this.#stats.configuresTotal++
					this.#stats.currentCodec = track.codec
					this.#stats.currentWidth = track.video.width
					this.#stats.currentHeight = track.video.height
				}
			} catch (e) {
				log.error("failed to configure decoder", e)
				if (this.#stats) this.#stats.errorsTotal++
				return // Stop processing if configure fails
			}
			if (!frame.sample.is_sync) {
				this.#waitingForKeyframe = true
			} else {
				this.#waitingForKeyframe = false
			}
		}

		//At the start of decode, VideoDecoder seems to expect a key frame after configure() or flush()
		if (this.#decoder.state == "configured") {
			if (this.#waitingForKeyframe && !frame.sample.is_sync) {
				log.warn("skipping non-keyframe until a keyframe is found")
				if (this.#stats) this.#stats.framesDroppedWaitingKeyframeTotal++
				if (!this.#hasSentWaitingForKeyFrameEvent) {
					self.postMessage("waitingforkeyframe")
					this.#hasSentWaitingForKeyFrameEvent = true
				}
				return
			}

			// On arrival of a keyframe, allow decoding and stop waiting for a keyframe.
			if (frame.sample.is_sync) {
				this.#waitingForKeyframe = false
				this.#hasSentWaitingForKeyFrameEvent = false
				// Record keyframe for keyframe-interval stats.
				if (this.#stats) this.#stats.onFrameReceived(true, performance.now())
			}

			const chunk = new EncodedVideoChunk({
				type: frame.sample.is_sync ? "key" : "delta",
				data: frame.sample.data,
				timestamp: frame.sample.dts / frame.track.timescale,
			})

			log.trace("decoding chunk", { type: chunk.type, size: chunk.byteLength })
			try {
				this.#stats?.onDecodeSubmit(performance.now())
				this.#stats?.updateDecodeQueueSize(this.#decoder.decodeQueueSize)
				this.#decoder.decode(chunk)
			} catch (e) {
				log.error("failed to decode chunk", e)
				if (this.#stats) this.#stats.errorsTotal++
			}
		}
	}
}
