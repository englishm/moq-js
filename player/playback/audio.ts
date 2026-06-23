import * as Message from "./worker/message"
import * as WorkletMessage from "./worklet/message"
import registerMyAudioWorklet from "audio-worklet:./worklet/index.ts"
import { getLogger, getGlobalLogger, installWorkletLogReceiver, onLoggerLevelChange, Deferred } from "@moq-js/transport"
import type { AudioPlaybackStat } from "@moq-js/transport"

const log = getLogger()

// NOTE: This must be on the main thread
export class Audio {
	context: AudioContext
	worklet: Promise<AudioWorkletNode>
	volumeNode: GainNode

	// Dispose function for the logger level change listener
	#disposeLoggerListener?: () => void

	// Pending getWorkletStats() requests keyed by requestId.
	#pendingStatsRequests = new Map<number, { deferred: Deferred<AudioPlaybackStat | undefined>; timeout: ReturnType<typeof setTimeout> }>()
	#nextStatsRequestId = 1

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

		// Handle non-log messages from the worklet (stats replies).
		worklet.port.addEventListener("message", (e: MessageEvent) => {
			// installWorkletLogReceiver already consumed log records; handle stats here.
			const msg = e.data as WorkletMessage.WorkletStatsMessage
			if (msg?.stats) {
				const pending = this.#pendingStatsRequests.get(msg.stats.requestId)
				if (pending) {
					clearTimeout(pending.timeout)
					this.#pendingStatsRequests.delete(msg.stats.requestId)
					pending.deferred.resolve(msg.stats.entry)
				}
			}
		})

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

	/**
	 * Request a stats snapshot from the AudioWorklet. Returns undefined if the
	 * worklet is not loaded yet, or times out within 250 ms.
	 */
	async getWorkletStats(): Promise<AudioPlaybackStat | undefined> {
		const worklet = await this.worklet.catch(() => undefined)
		if (!worklet) return undefined

		const requestId = this.#nextStatsRequestId++
		const deferred = new Deferred<AudioPlaybackStat | undefined>()
		const timeout = setTimeout(() => {
			if (this.#pendingStatsRequests.has(requestId)) {
				this.#pendingStatsRequests.delete(requestId)
				deferred.resolve(undefined)
			}
		}, 250)
		this.#pendingStatsRequests.set(requestId, { deferred, timeout })
		worklet.port.postMessage({ getStats: { requestId } } satisfies WorkletMessage.From)
		return deferred.promise
	}

	public setVolume(newVolume: number) {
		this.volumeNode.gain.setTargetAtTime(newVolume, this.context.currentTime, 0.01)
	}

	public getVolume(): number {
		return this.volumeNode.gain.value
	}

	async close() {
		this.#disposeLoggerListener?.()
		// Reject all pending stats requests so callers don't hang.
		for (const { deferred, timeout } of this.#pendingStatsRequests.values()) {
			clearTimeout(timeout)
			deferred.resolve(undefined)
		}
		this.#pendingStatsRequests.clear()
		const worklet = await this.worklet.catch(() => undefined)
		if (worklet) {
			worklet.port.close()
			worklet.disconnect()
		}
	}
}
