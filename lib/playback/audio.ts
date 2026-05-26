import * as Message from "./worker/message"

import registerMyAudioWorklet from "audio-worklet:./worklet/index.ts"
import { getLogger, getGlobalLogger, installWorkletLogReceiver, onLoggerLevelChange } from "../common/logger"

const log = getLogger()

// NOTE: This must be on the main thread
export class Audio {
	context: AudioContext
	worklet: Promise<AudioWorkletNode>
	volumeNode: GainNode

	// Dispose function for the logger level change listener
	#disposeLoggerListener?: () => void

	constructor(config: Message.ConfigAudio) {
		this.context = new AudioContext({
			latencyHint: "interactive",
			sampleRate: config.sampleRate,
		})
		this.volumeNode = this.context.createGain()
		this.volumeNode.gain.value = 1.0

		this.worklet = this.load(config)
	}

	private async load(config: Message.ConfigAudio): Promise<AudioWorkletNode> {
		// Load the worklet source code.
		await registerMyAudioWorklet(this.context)
		const volume = this.context.createGain()
		volume.gain.value = 2.0

		// Create the worklet
		const worklet = new AudioWorkletNode(this.context, "renderer")

		worklet.onprocessorerror = (e: Event) => {
			log.error("audio worklet processor error", e)
		}

		// Install log receiver so worklet log records appear in the global logger.
		worklet.port.start()
		installWorkletLogReceiver(worklet.port)

		// Keep the worklet's cached log level in sync whenever the global logger changes.
		this.#disposeLoggerListener = onLoggerLevelChange((level) => {
			worklet.port.postMessage({ logLevel: level })
		})

		// Connect the worklet to the volume node and then to the speakers
		worklet.connect(this.volumeNode)
		this.volumeNode.connect(this.context.destination)

		worklet.port.postMessage({ config })

		// Send the initial log level to the worklet.
		const logger = getGlobalLogger()
		const initialLevel = typeof logger.level === "function" ? logger.level() : "error"
		worklet.port.postMessage({ logLevel: initialLevel })

		return worklet
	}

	private on(_event: MessageEvent) {
		// TODO
	}

	public setVolume(newVolume: number) {
		this.volumeNode.gain.setTargetAtTime(newVolume, this.context.currentTime, 0.01)
	}

	public getVolume(): number {
		return this.volumeNode.gain.value
	}

	async close() {
		this.#disposeLoggerListener?.()
		const worklet = await this.worklet.catch(() => undefined)
		if (worklet) {
			worklet.port.close()
			worklet.disconnect()
		}
	}
}
