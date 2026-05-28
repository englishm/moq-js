// TODO(itzmanish): add support for @/ to avoid relative imports
import { Ring } from "../../common/ring"
import * as Message from "./message"
import { getWorkletLogger, setWorkletLogLevel } from "@moq-js/transport"
import type { AudioPlaybackStat } from "@moq-js/transport"

class Renderer extends AudioWorkletProcessor {
	ring?: Ring
	base: number
	// log is initialised in the constructor once `this.port` is available.
	#log!: ReturnType<typeof getWorkletLogger>

	// Log-throttling counters (reset after each log emit — do not use for stats).
	#processCount = 0
	#lastUnderrunLogProcess = 0
	#underrunCount = 0
	#underrunExpected = 0
	#underrunGot = 0

	// Cumulative stats counters (never reset — safe to snapshot at any time).
	#totalUnderrunCount = 0
	#totalUnderrunSamplesExpected = 0
	#totalUnderrunSamplesGot = 0
	#totalSamplesWritten = 0   // updated via message from worker (not tracked here)
	#totalSamplesDropped = 0   // same as above

	constructor() {
		// The super constructor call is required.
		super()

		this.base = 0
		this.#log = getWorkletLogger(this.port)
		this.port.onmessage = this.onMessage.bind(this)
	}

	onMessage(e: MessageEvent) {
		const msg = e.data as Message.From
		if (msg.logLevel !== undefined) {
			setWorkletLogLevel(msg.logLevel)
		} else if (msg.config) {
			this.onConfig(msg.config)
		} else if (msg.getStats) {
			this.onGetStats(msg.getStats.requestId)
		}
	}

	onConfig(config: Message.Config) {
		this.ring = new Ring(config.ring)
	}

	onGetStats(requestId: number): void {
		const ringFill = this.ring ? this.ring.size() : 0
		const ringCapacity = this.ring ? this.ring.capacity : 0

		const entry: AudioPlaybackStat = {
			id: "render:audio",
			type: "audio-playback",
			timestamp: currentTime * 1000, // AudioWorkletProcessor.currentTime is in seconds
			// samplesWrittenTotal / samplesDroppedTotal come from the worker-side audio renderer;
			// the worklet only reads from the ring, so we report 0 here and the worker-side
			// AudioStats has the correct values.
			samplesWrittenTotal: 0,
			samplesDroppedTotal: 0,
			underrunCountTotal: this.#totalUnderrunCount,
			underrunSamplesExpectedTotal: this.#totalUnderrunSamplesExpected,
			underrunSamplesGotTotal: this.#totalUnderrunSamplesGot,
			ringFillSamples: ringFill,
			ringCapacitySamples: ringCapacity,
			// AudioWorkletGlobalScope does not have access to AudioContext.state
			audioContextState: "running",
		}

		const reply: Message.WorkletStatsMessage = { stats: { requestId, entry } }
		this.port.postMessage(reply)
	}

	// Inputs and outputs in groups of 128 samples.
	process(inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
		this.#processCount += 1

		if (!this.ring) {
			// Paused
			return true
		}

		if (inputs.length != 1 && outputs.length != 1) {
			throw new Error("only a single track is supported")
		}

		if (this.ring.size() == this.ring.capacity) {
			// This is a hack to clear any latency in the ring buffer.
			// The proper solution is to play back slightly faster?
			this.#log.warn("resyncing ring buffer")
			this.ring.clear()
			return true
		}

		const output = outputs[0]

		const size = this.ring.read(output)
		if (size < output.length) {
			const underrunExpected = output.length
			const underrunGot = size

			// Update log-throttling counters (reset after emit).
			this.#underrunCount += 1
			this.#underrunExpected += underrunExpected
			this.#underrunGot += underrunGot

			// Update cumulative counters (never reset).
			this.#totalUnderrunCount += 1
			this.#totalUnderrunSamplesExpected += underrunExpected
			this.#totalUnderrunSamplesGot += underrunGot

			// Avoid flooding postMessage/console from the realtime audio thread. At 48kHz with
			// 128-frame render quanta this logs at most about once every 650ms.
			if (this.#processCount - this.#lastUnderrunLogProcess >= 250) {
				this.#log.trace("audio underrun", {
					count: this.#underrunCount,
					expected: this.#underrunExpected,
					got: this.#underrunGot,
				})
				this.#lastUnderrunLogProcess = this.#processCount
				this.#underrunCount = 0
				this.#underrunExpected = 0
				this.#underrunGot = 0
			}
			// TODO(itzmanish): trigger rebuffering event
		}

		return true
	}
}

registerProcessor("renderer", Renderer)
