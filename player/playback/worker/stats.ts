/**
 * WorkerStats — in-worker counter bags collected on demand via the getStats
 * postMessage round-trip.  All counters are cumulative; only the snapshot
 * (`collect()`) allocates; the hot path is plain `++` / `+= n` increments.
 */

import type {
	MoqStat,
	VideoDecoderStat,
	AudioDecoderStat,
	VideoRenderStat,
	TimelineStat,
} from "@moq-js/transport"
import { Ewma, LatencyRing } from "@moq-js/transport"

// ---------------------------------------------------------------------------
// Timeline counters (video + audio combined — Timeline.Component is per-kind
// but we sum them for the single "timeline" stat entry)
// ---------------------------------------------------------------------------

export class TimelineStats {
	segmentsEnqueuedTotal = 0
	segmentsDequeuedTotal = 0
	segmentsDroppedStaleTotal = 0
	segmentsDroppedSlowTotal = 0

	get bufferDepth(): number {
		return Math.max(0, this.segmentsEnqueuedTotal - this.segmentsDequeuedTotal)
	}

	collect(nowMs: number): TimelineStat {
		return {
			id: "timeline",
			type: "timeline",
			timestamp: nowMs,
			segmentsEnqueuedTotal: this.segmentsEnqueuedTotal,
			segmentsDequeuedTotal: this.segmentsDequeuedTotal,
			segmentsDroppedStaleTotal: this.segmentsDroppedStaleTotal,
			segmentsDroppedSlowTotal: this.segmentsDroppedSlowTotal,
			bufferDepth: this.bufferDepth,
		}
	}
}

// ---------------------------------------------------------------------------
// Video decoder + render counters
// ---------------------------------------------------------------------------

export class VideoStats {
	// Decoder
	framesSubmittedTotal = 0
	framesDecodedTotal = 0
	framesDroppedWaitingKeyframeTotal = 0
	configuresTotal = 0
	resetsTotal = 0
	errorsTotal = 0
	currentCodec?: string
	currentWidth?: number
	currentHeight?: number
	#decodeLatencyRing = new LatencyRing(32)
	#decodeLatencyEwma = new Ewma(0.2)

	// Render
	framesReceivedTotal = 0
	framesRenderedTotal = 0
	framesDroppedStaleTotal = 0
	framesDroppedSlowTotal = 0
	framesDroppedSinkTotal = 0
	#renderFpsEwma = new Ewma(0.2)
	#lastRenderMs = 0

	// Freeze detection
	freezeCountTotal = 0
	freezeDurationMsTotal = 0
	#freezeStartMs = 0
	#inFreeze = false

	// Keyframes
	keyframesReceivedTotal = 0
	#lastKeyframeMs = 0
	#keyframeIntervalEwma = new Ewma(0.2)

	onDecodeSubmit(nowMs: number): void {
		this.framesSubmittedTotal++
		this.#decodeLatencyRing.recordSubmit(nowMs)
	}

	onDecodeOutput(nowMs: number): void {
		this.framesDecodedTotal++
		const latency = this.#decodeLatencyRing.recordOutput(nowMs)
		if (latency !== undefined) {
			this.#decodeLatencyEwma.update(latency, nowMs)
		}
	}

	onFrameReceived(isKeyframe: boolean, nowMs: number): void {
		this.framesReceivedTotal++
		if (isKeyframe) {
			this.keyframesReceivedTotal++
			if (this.#lastKeyframeMs > 0) {
				this.#keyframeIntervalEwma.update(nowMs - this.#lastKeyframeMs, nowMs)
			}
			this.#lastKeyframeMs = nowMs
		}
	}

	onFrameRendered(nowMs: number, isPlaying: boolean): void {
		this.framesRenderedTotal++

		// Freeze recovery: if we were frozen and now a frame arrived, close the freeze.
		if (this.#inFreeze && isPlaying) {
			this.#inFreeze = false
			this.freezeDurationMsTotal += nowMs - this.#freezeStartMs
			this.freezeCountTotal++
		}

		// FPS EWMA: 1 frame per (gap ms) → rate = 1000/gap fps.
		if (this.#lastRenderMs > 0) {
			const gap = nowMs - this.#lastRenderMs
			if (gap > 0) {
				this.#renderFpsEwma.update(1000 / gap, nowMs)
			}
		}
		this.#lastRenderMs = nowMs
	}

	/**
	 * Called from the render loop when no new frame arrived within the freeze
	 * threshold. Only transitions to frozen once per gap; subsequent ticks while
	 * already frozen are no-ops.
	 */
	onFreezeDetected(nowMs: number): void {
		if (!this.#inFreeze) {
			this.#inFreeze = true
			this.#freezeStartMs = nowMs
		}
	}

	get decodeQueueSize(): number {
		// VideoDecoder.decodeQueueSize is read directly in the Renderer; we store
		// the last known value here for the stats snapshot.
		return this.#cachedDecodeQueueSize
	}
	#cachedDecodeQueueSize = 0
	updateDecodeQueueSize(n: number): void {
		this.#cachedDecodeQueueSize = n
	}

	collect(nowMs: number): VideoDecoderStat | VideoStats {
		return this
	}

	collectDecoder(nowMs: number): VideoDecoderStat {
		return {
			id: "decoder:video",
			type: "video-decoder",
			timestamp: nowMs,
			framesSubmittedTotal: this.framesSubmittedTotal,
			framesDecodedTotal: this.framesDecodedTotal,
			decodeQueueSize: this.#cachedDecodeQueueSize,
			decodeLatencyMsEwma: this.#decodeLatencyEwma.value,
			framesDroppedWaitingKeyframeTotal: this.framesDroppedWaitingKeyframeTotal,
			configuresTotal: this.configuresTotal,
			resetsTotal: this.resetsTotal,
			errorsTotal: this.errorsTotal,
			currentCodec: this.currentCodec,
			currentWidth: this.currentWidth,
			currentHeight: this.currentHeight,
		}
	}

	collectRender(nowMs: number): VideoRenderStat {
		return {
			id: "render:video",
			type: "video-render",
			timestamp: nowMs,
			framesReceivedTotal: this.framesReceivedTotal,
			framesRenderedTotal: this.framesRenderedTotal,
			framesDroppedStaleTotal: this.framesDroppedStaleTotal,
			framesDroppedSlowTotal: this.framesDroppedSlowTotal,
			framesDroppedSinkTotal: this.framesDroppedSinkTotal,
			framesDroppedWaitingKeyframeTotal: this.framesDroppedWaitingKeyframeTotal,
			framesPerSecondEwma: this.#renderFpsEwma.value,
			freezeCountTotal: this.freezeCountTotal,
			freezeDurationMsTotal: this.freezeDurationMsTotal,
			keyframesReceivedTotal: this.keyframesReceivedTotal,
			keyframeIntervalMsEwma: this.#keyframeIntervalEwma.value,
			currentSegmentSequence: this.#currentSegmentSequence,
			timelineBufferDepth: this.#timelineBufferDepth,
		}
	}

	#currentSegmentSequence = 0
	#timelineBufferDepth = 0
	updateSegmentSequence(seq: number): void {
		this.#currentSegmentSequence = seq
	}
	updateTimelineBufferDepth(depth: number): void {
		this.#timelineBufferDepth = depth
	}
}

// ---------------------------------------------------------------------------
// Audio decoder counters
// ---------------------------------------------------------------------------

export class AudioStats {
	framesSubmittedTotal = 0
	framesDecodedTotal = 0
	samplesDecodedTotal = 0
	samplesDroppedTotal = 0 // mirrored from Renderer.#droppedSamples
	samplesWrittenTotal = 0
	configuresTotal = 0
	errorsTotal = 0
	currentCodec?: string
	currentSampleRate?: number
	currentChannels?: number
	#decodeLatencyRing = new LatencyRing(32)
	#decodeLatencyEwma = new Ewma(0.2)

	onDecodeSubmit(nowMs: number): void {
		this.framesSubmittedTotal++
		this.#decodeLatencyRing.recordSubmit(nowMs)
	}

	onDecodeOutput(numberOfSamples: number, nowMs: number): void {
		this.framesDecodedTotal++
		this.samplesDecodedTotal += numberOfSamples
		const latency = this.#decodeLatencyRing.recordOutput(nowMs)
		if (latency !== undefined) {
			this.#decodeLatencyEwma.update(latency, nowMs)
		}
	}

	onSamplesWritten(n: number): void {
		this.samplesWrittenTotal += n
	}

	onSamplesDropped(n: number): void {
		this.samplesDroppedTotal += n
	}

	collect(nowMs: number): AudioDecoderStat {
		return {
			id: "decoder:audio",
			type: "audio-decoder",
			timestamp: nowMs,
			framesSubmittedTotal: this.framesSubmittedTotal,
			framesDecodedTotal: this.framesDecodedTotal,
			samplesDecodedTotal: this.samplesDecodedTotal,
			samplesDroppedTotal: this.samplesDroppedTotal,
			decodeLatencyMsEwma: this.#decodeLatencyEwma.value,
			configuresTotal: this.configuresTotal,
			errorsTotal: this.errorsTotal,
			currentCodec: this.currentCodec,
			currentSampleRate: this.currentSampleRate,
			currentChannels: this.currentChannels,
		}
	}
}

// ---------------------------------------------------------------------------
// Top-level worker collector
// ---------------------------------------------------------------------------

export class WorkerStats {
	readonly video = new VideoStats()
	readonly audio = new AudioStats()
	readonly timeline = new TimelineStats()

	// Segment-level counters (per-segment locals promoted here).
	objectsReceivedVideoTotal = 0
	objectsReceivedAudioTotal = 0
	payloadBytesVideoTotal = 0
	payloadBytesAudioTotal = 0

	/**
	 * Merge timeline drop/dequeue counters from the Component instances.
	 * Called just before collect() so the snapshot is fresh.
	 */
	syncTimelineCounters(
		videoComponent: { segmentsDroppedStaleTotal: number; segmentsDroppedSlowTotal: number; segmentsDequeuedTotal: number },
		audioComponent: { segmentsDroppedStaleTotal: number; segmentsDroppedSlowTotal: number; segmentsDequeuedTotal: number },
	): void {
		this.timeline.segmentsDroppedStaleTotal = videoComponent.segmentsDroppedStaleTotal + audioComponent.segmentsDroppedStaleTotal
		this.timeline.segmentsDroppedSlowTotal = videoComponent.segmentsDroppedSlowTotal + audioComponent.segmentsDroppedSlowTotal
		this.timeline.segmentsDequeuedTotal = videoComponent.segmentsDequeuedTotal + audioComponent.segmentsDequeuedTotal
	}

	collect(nowMs: number): MoqStat[] {
		return [
			this.video.collectDecoder(nowMs),
			this.video.collectRender(nowMs),
			this.audio.collect(nowMs),
			this.timeline.collect(nowMs),
		]
	}
}
