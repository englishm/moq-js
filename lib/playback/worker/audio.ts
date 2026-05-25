import * as Message from "./message"
import { Ring } from "../../common/ring"
import { Component, Frame } from "./timeline"
import * as MP4 from "../../media/mp4"
import { getWorkerLogger } from "../../common/logger"

const log = getWorkerLogger()

// This is run in a worker.
export class Renderer {
	#ring: Ring
	#timeline: Component

	#decoder!: AudioDecoder
	#stream: TransformStream<Frame, AudioData>

	constructor(config: Message.ConfigAudio, timeline: Component) {
		this.#timeline = timeline
		this.#ring = new Ring(config.ring)

		this.#stream = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch((e) => log.error("run failed", e))
	}

	#start(controller: TransformStreamDefaultController) {
		this.#decoder = new AudioDecoder({
			output: (frame: AudioData) => {
				controller.enqueue(frame)
			},
			error: (e) => log.warn("audio decoder error", e),
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
			} catch (error) {
				log.warn("decoder configure failed", { label, error })
				return
			}
		}

		const chunk = new EncodedAudioChunk({
			type: frame.sample.is_sync ? "key" : "delta",
			timestamp: frame.sample.dts / frame.track.timescale,
			duration: frame.sample.duration,
			data: frame.sample.data,
		})

		this.#decoder.decode(chunk)
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#stream).getReader()

		for (;;) {
			const { value: frame, done } = await reader.read()
			if (done) break

			// Write audio samples to the ring buffer, dropping when there's no space.
			const written = this.#ring.write(frame)

			if (written < frame.numberOfFrames) {
				log.warn(`dropped ${frame.numberOfFrames - written} audio samples`)
			}
		}
	}
}
