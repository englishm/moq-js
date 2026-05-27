// TODO add support for @/ to avoid relative imports
import { Ring } from "../../common/ring"
import * as Message from "./message"
import { getWorkletLogger, setWorkletLogLevel } from "@moq-js/transport"

class Renderer extends AudioWorkletProcessor {
	ring?: Ring
	base: number
	// log is initialised in the constructor once `this.port` is available.
	#log!: ReturnType<typeof getWorkletLogger>
	#processCount = 0
	#lastUnderrunLogProcess = 0
	#underrunCount = 0
	#underrunExpected = 0
	#underrunGot = 0

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
		}
	}

	onConfig(config: Message.Config) {
		this.ring = new Ring(config.ring)
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
			this.#underrunCount += 1
			this.#underrunExpected += output.length
			this.#underrunGot += size

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
			// TODO trigger rebuffering event
		}

		return true
	}
}

registerProcessor("renderer", Renderer)
