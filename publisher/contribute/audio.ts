import { getLogger } from "@moq-js/transport"

const log = getLogger()

const SUPPORTED = [
	// TODO support AAC
	// "mp4a"
	"Opus",
]

export class Encoder {
	#encoder!: AudioEncoder
	#encoderConfig: AudioEncoderConfig
	#decoderConfig?: AudioDecoderConfig

	frames: TransformStream<AudioData, AudioDecoderConfig | EncodedAudioChunk>

	constructor(config: AudioEncoderConfig) {
		this.#encoderConfig = config

		this.frames = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
			flush: this.#flush.bind(this),
		})
	}

	#start(controller: TransformStreamDefaultController<AudioDecoderConfig | EncodedAudioChunk>) {
		try {
			this.#encoder = new AudioEncoder({
				output: (frame, metadata) => {
					this.#enqueue(controller, frame, metadata)
				},
				error: (err) => {
					throw err
				},
			})

			this.#encoder.configure(this.#encoderConfig)
		} catch (e) {
			log.error("failed to configure AudioEncoder", e)
			throw e
		}
	}

	#transform(frame: AudioData) {
		try {
			this.#encoder.encode(frame)
		} catch (e) {
			log.error("failed to encode audio frame", e)
			throw e
		}
		frame.close()
	}

	#enqueue(
		controller: TransformStreamDefaultController<AudioDecoderConfig | EncodedAudioChunk>,
		frame: EncodedAudioChunk,
		metadata?: EncodedAudioChunkMetadata,
	) {
		const config = metadata?.decoderConfig
		if (config && !this.#decoderConfig) {
			const config = metadata.decoderConfig
			if (!config) throw new Error("missing decoder config")

			controller.enqueue(config)
			this.#decoderConfig = config
		}

		controller.enqueue(frame)
	}

	#flush() {
		this.#encoder.close()
	}

	static async isSupported(config: AudioEncoderConfig) {
		// Check if we support a specific codec family
		const short = config.codec.substring(0, 4)
		if (!SUPPORTED.includes(short)) return false

		const res = await AudioEncoder.isConfigSupported(config)
		return !!res.supported
	}

	get config() {
		return this.#encoderConfig
	}
}
