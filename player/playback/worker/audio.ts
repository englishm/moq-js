import * as Message from "./message"
import { Ring } from "../../common/ring"
import { Component, Frame } from "./timeline"
import * as MP4 from "@moq-js/media"
import { getWorkerLogger } from "@moq-js/transport"
import type { AudioStats } from "./stats"

const log = getWorkerLogger()

// This is run in a worker.
export class Renderer {
	#ring: Ring
	#timeline: Component
	#stats?: AudioStats

	#decoder!: AudioDecoder
	#stream: TransformStream<Frame, AudioData>
	// Cumulative dropped samples since construction. Kept for log throttling.
	#droppedSamples = 0
	#lastDroppedSamplesLog = 0

	constructor(config: Message.ConfigAudio, timeline: Component, stats?: AudioStats) {
		this.#timeline = timeline
		this.#ring = new Ring(config.ring)
		this.#stats = stats

		this.#stream = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch((e) => log.error("run failed", e))
	}

	#start(controller: TransformStreamDefaultController) {
		this.#decoder = new AudioDecoder({
			output: (frame: AudioData) => {
				if (this.#stats) {
					this.#stats.onDecodeOutput(frame.numberOfFrames, performance.now())
				}
				controller.enqueue(frame)
			},
			error: (e: unknown) => {
				log.warn("audio decoder error", e)
				if (this.#stats) this.#stats.errorsTotal++
			},
		})
	}

	#transform(frame: Frame) {
		if (this.#decoder.state !== "configured") {
			const track = frame.track
			if (!MP4.isAudioTrack(track)) throw new Error("expected audio track")

			const label = `${track.codec}@${track.audio.sample_rate}Hz`

			try {
				// We only support OPUS right now which doesn't need a description.
				this.#decoder.configure({
					codec: track.codec,
					sampleRate: track.audio.sample_rate,
					numberOfChannels: track.audio.channel_count,
				})
				log.debug("decoder configured", { label, codec: track.codec })
				if (this.#stats) {
					this.#stats.configuresTotal++
					this.#stats.currentCodec = track.codec
					this.#stats.currentSampleRate = track.audio.sample_rate
					this.#stats.currentChannels = track.audio.channel_count
				}
			} catch (error) {
				log.warn("decoder configure failed", { label, error })
				if (this.#stats) this.#stats.errorsTotal++
				return
			}
		}

		const chunk = new EncodedAudioChunk({
			type: frame.sample.is_sync ? "key" : "delta",
			timestamp: frame.sample.dts / frame.track.timescale,
			duration: frame.sample.duration,
			data: frame.sample.data,
		})

		this.#stats?.onDecodeSubmit(performance.now())
		this.#decoder.decode(chunk)
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#stream).getReader()

		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			// Write audio samples to the ring buffer, dropping when there's no space.
			const written = this.#ring.write(frame)

			// AudioData must always be explicitly closed to release its underlying
			// resources. Do this after ring.write so the data is copied first.
			frame.close()

			this.#stats?.onSamplesWritten(written)

			if (written < frame.numberOfFrames) {
				const dropped = frame.numberOfFrames - written
				this.#droppedSamples += dropped
				this.#stats?.onSamplesDropped(dropped)
				// This can be noisy during startup/rebuffering. Keep it at trace and aggregate so
				// debug logging remains usable in demos.
				if (this.#droppedSamples - this.#lastDroppedSamplesLog >= 9600) {
					log.trace("dropped audio samples", { count: this.#droppedSamples - this.#lastDroppedSamplesLog })
					this.#lastDroppedSamplesLog = this.#droppedSamples
				}
			}
		}
	}
}
