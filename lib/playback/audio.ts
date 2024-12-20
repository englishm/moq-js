import * as Message from "./worker/message"

import registerMyAudioWorklet from "audio-worklet:./worklet/index.ts"

// NOTE: This must be on the main thread
export class Audio {
	context: AudioContext
	worklet: Promise<AudioWorkletNode>
	volumeNode: GainNode

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

		worklet.port.addEventListener("message", this.on.bind(this))
		worklet.onprocessorerror = (e: Event) => {
			console.error("Audio worklet error:", e)
		}

		// Connect the worklet to the volume node and then to the speakers
		worklet.connect(this.volumeNode)
		this.volumeNode.connect(this.context.destination)

		worklet.port.postMessage({ config })

		return worklet
	}

	private on(_event: MessageEvent) {
		// TODO
	}

	public setVolume(newVolume: number) {
		this.volumeNode.gain.setTargetAtTime(newVolume, this.context.currentTime, 0.01)
	}
}
