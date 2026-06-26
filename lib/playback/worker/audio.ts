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

	async #transform(frame: Frame) {
		if (this.#decoder.state !== "configured") {
			const track = frame.track
			if (!MP4.isAudioTrack(track)) throw new Error("expected audio track")

			const configs = getAudioDecoderConfigs(track, frame.sample.description)
			let configured = false

			for (const { label, config } of configs) {
				try {
					if (typeof AudioDecoder.isConfigSupported === "function") {
						const support = await AudioDecoder.isConfigSupported(config)
						console.log("[AudioWorker] decoder support", {
							label,
							supported: support.supported,
							config: {
								codec: config.codec,
								sampleRate: config.sampleRate,
								numberOfChannels: config.numberOfChannels,
								hasDescription: !!config.description,
								descriptionLength:
									config.description instanceof Uint8Array
										? config.description.byteLength
										: config.description instanceof ArrayBuffer
											? config.description.byteLength
											: 0,
							},
						})

						if (!support.supported) {
							continue
						}
					}

					this.#decoder.configure(config)
					console.log("[AudioWorker] decoder configured", { label, codec: config.codec })
					configured = true
					break
				} catch (error) {
					console.warn("[AudioWorker] decoder configure failed", { label, error })
				}
			}

			if (!configured) {
				throw new Error(`failed to configure audio decoder for codec ${track.codec}`)
			}
		}

		const timestamp = toMicroseconds(frame.sample.cts, frame.track.timescale)
		const duration = toMicroseconds(frame.sample.duration, frame.track.timescale)

		const chunk = new EncodedAudioChunk({
			type: frame.sample.is_sync ? "key" : "delta",
			timestamp,
			duration,
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

function getAudioDecoderDescription(description: unknown): Uint8Array | undefined {
	const esds = (description as { esds?: { esd?: Descriptor } } | undefined)?.esds
	if (!esds?.esd) {
		return
	}

	const decoderSpecificInfo = findDescriptor(esds.esd, 5)
	if (!decoderSpecificInfo?.data) {
		return
	}

	return toUint8Array(decoderSpecificInfo.data)
}

function getAudioDecoderConfigs(track: MP4.AudioTrack, description: unknown): Array<{ label: string; config: AudioDecoderConfig }> {
	const base: AudioDecoderConfig = {
		codec: track.codec,
		sampleRate: track.audio.sample_rate,
		numberOfChannels: track.audio.channel_count,
	}

	const configs: Array<{ label: string; config: AudioDecoderConfig }> = []
	const decoderSpecificInfo = getAudioDecoderDescription(description)

	if (decoderSpecificInfo) {
		configs.push({
			label: "decoder-specific-info",
			config: { ...base, description: decoderSpecificInfo },
		})

		if (track.codec.startsWith("mp4a.40.") && decoderSpecificInfo.length > 2) {
			configs.push({
				label: "aac-audio-specific-config-prefix",
				config: { ...base, description: decoderSpecificInfo.slice(0, 2) },
			})
		}
	}

	configs.push({
		label: "no-description",
		config: base,
	})

	return configs
}

interface Descriptor {
	tag?: number
	descs?: Descriptor[]
	data?: unknown
}

function findDescriptor(desc: Descriptor, tag: number): Descriptor | undefined {
	if (desc.tag === tag) {
		return desc
	}

	for (const child of desc.descs ?? []) {
		const found = findDescriptor(child, tag)
		if (found) {
			return found
		}
	}
}

function toUint8Array(data: unknown): Uint8Array | undefined {
	if (data instanceof Uint8Array) {
		return data
	}

	if (Array.isArray(data)) {
		return new Uint8Array(data)
	}

	if (data && typeof data === "object") {
		const bytes = Object.entries(data)
			.filter(([key, value]) => /^\d+$/.test(key) && typeof value === "number")
			.sort(([a], [b]) => Number(a) - Number(b))
			.map(([, value]) => value)

		if (bytes.length) {
			return new Uint8Array(bytes)
		}
	}
}

function toMicroseconds(value: number, timescale: number): number {
	return Math.round((value * 1_000_000) / timescale)
}
