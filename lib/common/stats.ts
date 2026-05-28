/**
 * Shared stats types for the moq-js player pipeline.
 *
 * All counters are cumulative (never reset). Consumers diff consecutive
 * snapshots to compute rates. The `timestamp` field on every stat is
 * `performance.now()` at collection time so diffs yield millisecond deltas.
 *
 * Naming conventions (mirroring WebRTC where applicable):
 *   - Counters:  `<noun>sTotal`   (e.g. `framesDecodedTotal`)
 *   - Gauges:    `<noun>`         (e.g. `decodeQueueSize`)
 *   - Durations: `<noun>Ms`       (e.g. `subscribeLatencyMs`)
 *   - Rates:     `<noun>Ewma`     (e.g. `bytesPerSecondEwma`)
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Exponential weighted moving average, updated on every event.
 * alpha=0.1 gives ~10-sample memory; alpha=0.2 gives ~5-sample memory.
 * Call `update(value, nowMs)` on each observation; read `.value` to sample.
 *
 * IMPORTANT: update is time-weighted. If 5 s pass between observations the
 * EWMA decays toward 0 because no events arrived. This gives a natural
 * "rate drains to zero when there's no traffic" behaviour for bytes/sec.
 */
export class Ewma {
	#alpha: number
	#value = 0
	#lastMs = 0

	constructor(alpha = 0.2) {
		this.#alpha = alpha
	}

	/**
	 * Update with a new observation `value` at wall-clock `nowMs`
	 * (use `performance.now()`).
	 */
	update(value: number, nowMs: number): void {
		if (this.#lastMs === 0) {
			this.#value = value
			this.#lastMs = nowMs
			return
		}
		// Time-decay: weight old value by (1-alpha)^(elapsed/period). We use a
		// 1-second period so the unit of `value` is "per second".
		const elapsed = Math.max(0, nowMs - this.#lastMs) / 1000
		const decay = Math.pow(1 - this.#alpha, elapsed)
		this.#value = decay * this.#value + (1 - decay) * value
		this.#lastMs = nowMs
	}

	get value(): number {
		return this.#value
	}

	reset(): void {
		this.#value = 0
		this.#lastMs = 0
	}
}

/**
 * Inter-arrival jitter estimator.
 * Implemented using the algorithm from RFC 3550 (RTP):
 * `J(i) = J(i-1) + (|D(i)| - J(i-1)) / 16`
 * where `D(i)` is the difference in inter-arrival times.
 */
export class Jitter {
	#jitter = 0
	#lastArrivalMs = 0
	#lastExpectedIntervalMs = 0

	/**
	 * Record that a group/object arrived at `nowMs`. `expectedIntervalMs` is
	 * the nominal gap between consecutive objects (e.g. 1000/fps for video).
	 * Pass 0 if unknown — jitter will still be estimated from arrival spacing.
	 */
	observe(nowMs: number, expectedIntervalMs = 0): void {
		if (this.#lastArrivalMs === 0) {
			this.#lastArrivalMs = nowMs
			this.#lastExpectedIntervalMs = expectedIntervalMs
			return
		}
		const interArrival = nowMs - this.#lastArrivalMs
		const interSend = expectedIntervalMs || this.#lastExpectedIntervalMs || interArrival
		const d = Math.abs(interArrival - interSend)
		this.#jitter += (d - this.#jitter) / 16
		this.#lastArrivalMs = nowMs
		this.#lastExpectedIntervalMs = expectedIntervalMs
	}

	get jitterMs(): number {
		return this.#jitter
	}

	reset(): void {
		this.#jitter = 0
		this.#lastArrivalMs = 0
		this.#lastExpectedIntervalMs = 0
	}
}

/**
 * Fixed-size circular ring buffer for tracking decode submit→output latency.
 * Ring size N should be >= typical decoder in-flight queue depth (~32 is safe).
 * Entries that fall off the back are silently discarded — accuracy degrades
 * gracefully under heavy queue buildup, never crashes.
 */
export class LatencyRing {
	#buf: Float64Array
	#submitSeq = 0
	#outputSeq = 0

	constructor(size = 32) {
		this.#buf = new Float64Array(size)
	}

	/** Record a submit timestamp for the next frame entering the decoder. */
	recordSubmit(nowMs: number): void {
		const idx = this.#submitSeq % this.#buf.length
		this.#buf[idx] = nowMs
		this.#submitSeq++
	}

	/**
	 * Record that a frame exited the decoder at `nowMs`. Returns the latency
	 * in ms, or `undefined` if no matching submit was found (ring overflow).
	 */
	recordOutput(nowMs: number): number | undefined {
		const idx = this.#outputSeq % this.#buf.length
		const submitMs = this.#buf[idx]
		this.#outputSeq++
		if (submitMs === 0) return undefined
		// Clear the slot to prevent stale readings.
		this.#buf[idx] = 0
		return Math.max(0, nowMs - submitMs)
	}
}

// ---------------------------------------------------------------------------
// Stat entry interfaces
// ---------------------------------------------------------------------------

/** Discriminated union tag for all stat entries. */
export type MoqStatType =
	| "session"
	| "transport"
	| "control-stream"
	| "inbound-track"
	| "video-decoder"
	| "audio-decoder"
	| "video-render"
	| "audio-playback"
	| "timeline"
	| "codec"

/** Base fields present on every stat entry. */
export interface MoqStatBase {
	/** Stable id across snapshots. Consumers diff consecutive reports by id. */
	id: string
	type: MoqStatType
	/** `performance.now()` at collection time (milliseconds). */
	timestamp: number
}

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------

export type SessionState = "idle" | "connecting" | "playing" | "paused" | "closed"

export interface SessionStat extends MoqStatBase {
	type: "session"
	state: SessionState
	/** Milliseconds since Player was constructed. */
	uptimeMs: number
	/** Cumulative milliseconds spent in the playing (unpaused) state. */
	playMs: number
	/**
	 * Approximate time-to-first-frame: ms from the first `play()` call to the
	 * first video frame rendered on screen. Undefined until a frame has been
	 * rendered. Audio-only sessions leave this undefined.
	 */
	ttffMs?: number
	/** Message from the most recent error event, if any. */
	lastErrorMessage?: string
}

// ---------------------------------------------------------------------------
// transport
// ---------------------------------------------------------------------------

export interface TransportStat extends MoqStatBase {
	type: "transport"
	/** Cumulative control-stream bytes received. */
	controlBytesReceived: number
	/** Cumulative control-stream bytes sent. */
	controlBytesSent: number
	/** Cumulative control messages received (all types combined). */
	controlMessagesReceived: number
	/** Cumulative control messages sent (all types combined). */
	controlMessagesSent: number
	/** Cumulative inbound unidirectional streams accepted. */
	streamsOpenedIn: number
	/** ms from WebTransport dial start to `quic.ready`. */
	connectDialMs?: number
	/** ms for the full SETUP round-trip (ClientSetup → ServerSetup). */
	setupRoundtripMs?: number
	/** ms since Connection was established. */
	connectionUptimeMs: number
	/** Number of currently active inbound subscriptions (gauge). */
	activeSubscriptions: number
}

// ---------------------------------------------------------------------------
// control-stream
// ---------------------------------------------------------------------------

export interface ControlStreamStat extends MoqStatBase {
	type: "control-stream"
	/** Per-type counts of inbound control messages. Keys are ControlMessageType names. */
	messagesByTypeReceived: Record<string, number>
	/** Per-type counts of outbound control messages. */
	messagesByTypeSent: Record<string, number>
	/** Cumulative unknown-request errors (routing failures). */
	unknownRequestErrorsTotal: number
}

// ---------------------------------------------------------------------------
// inbound-track
// ---------------------------------------------------------------------------

export interface InboundTrackStat extends MoqStatBase {
	type: "inbound-track"
	/** Track name from the catalog. */
	trackName: string
	/** Namespace joined with "/" for display. */
	namespace: string
	/** "video" | "audio" | "data". */
	kind: string
	/** SUBSCRIBE → SUBSCRIBE_OK latency in ms (set once on first OK). */
	subscribeLatencyMs?: number
	/** Cumulative groups (subgroup streams) received. */
	groupsReceivedTotal: number
	/** Cumulative objects received across all groups. */
	objectsReceivedTotal: number
	/** Cumulative subgroup streams received. */
	subgroupsReceivedTotal: number
	/** Sequence number of the last received group. */
	lastGroupSequence: number
	/** Cumulative clean PUBLISH_DONE terminations. */
	publishDoneTotal: number
	/** Cumulative REQUEST_ERROR / protocol-level errors. */
	errorTotal: number
	/** Cumulative UNSUBSCRIBE events (local or remote). */
	unsubscribeTotal: number
	/** RFC-3550 inter-arrival jitter (ms). */
	interArrivalJitterMs: number
}

// ---------------------------------------------------------------------------
// video-decoder
// ---------------------------------------------------------------------------

export interface VideoDecoderStat extends MoqStatBase {
	type: "video-decoder"
	/** Cumulative encoded chunks submitted to VideoDecoder.decode(). */
	framesSubmittedTotal: number
	/** Cumulative VideoFrames produced by the decoder output callback. */
	framesDecodedTotal: number
	/** Current VideoDecoder.decodeQueueSize (gauge, 0 if decoder not configured). */
	decodeQueueSize: number
	/** EWMA of submit→output latency in ms. */
	decodeLatencyMsEwma: number
	/** Cumulative frames dropped while #waitingForKeyframe. */
	framesDroppedWaitingKeyframeTotal: number
	/** Cumulative decoder.configure() calls. */
	configuresTotal: number
	/** Cumulative decoder.reset() calls (triggered by codec mismatch). */
	resetsTotal: number
	/** Cumulative decoder error callback invocations. */
	errorsTotal: number
	/** Most recently configured codec string (e.g. "avc1.42E01E"). */
	currentCodec?: string
	/** Most recently configured coded width. */
	currentWidth?: number
	/** Most recently configured coded height. */
	currentHeight?: number
}

// ---------------------------------------------------------------------------
// audio-decoder
// ---------------------------------------------------------------------------

export interface AudioDecoderStat extends MoqStatBase {
	type: "audio-decoder"
	/** Cumulative encoded audio chunks submitted to AudioDecoder.decode(). */
	framesSubmittedTotal: number
	/** Cumulative AudioData objects produced by the decoder output callback. */
	framesDecodedTotal: number
	/** Cumulative PCM samples decoded (numberOfFrames sum across all AudioData). */
	samplesDecodedTotal: number
	/** Cumulative PCM samples dropped due to ring-buffer backpressure. */
	samplesDroppedTotal: number
	/** EWMA of submit→output latency in ms. */
	decodeLatencyMsEwma: number
	/** Cumulative decoder.configure() calls. */
	configuresTotal: number
	/** Cumulative decoder error callback invocations. */
	errorsTotal: number
	/** Most recently configured codec string (e.g. "opus"). */
	currentCodec?: string
	/** Most recently configured sample rate (Hz). */
	currentSampleRate?: number
	/** Most recently configured channel count. */
	currentChannels?: number
}

// ---------------------------------------------------------------------------
// video-render
// ---------------------------------------------------------------------------

export interface VideoRenderStat extends MoqStatBase {
	type: "video-render"
	/** Cumulative frames received from the decoder into the render loop. */
	framesReceivedTotal: number
	/** Cumulative frames actually drawn via drawImage(). */
	framesRenderedTotal: number
	/** Cumulative frames discarded because the segment was stale (older sequence). */
	framesDroppedStaleTotal: number
	/** Cumulative frames discarded because the segment was too slow (newer replaced it). */
	framesDroppedSlowTotal: number
	/** Cumulative frames dropped because the writable sink rejected them. */
	framesDroppedSinkTotal: number
	/** Cumulative frames dropped while waiting for a keyframe. */
	framesDroppedWaitingKeyframeTotal: number
	/** EWMA of rendered frames per second. */
	framesPerSecondEwma: number
	/**
	 * Cumulative freeze events. A freeze is counted once it recovers: i.e. when
	 * the next frame is rendered after a gap > max(150ms, 3×expectedFrameInterval).
	 * Tab-hidden periods are excluded (freeze only counted when `play` state is true).
	 */
	freezeCountTotal: number
	/** Cumulative milliseconds the player has been in a frozen state. */
	freezeDurationMsTotal: number
	/** Cumulative keyframe video frames received (is_sync=true). */
	keyframesReceivedTotal: number
	/** EWMA of interval between consecutive keyframes (ms). */
	keyframeIntervalMsEwma: number
	/** Sequence number of the last segment currently being rendered. */
	currentSegmentSequence: number
	/** Approximate timeline segment buffer depth (segments enqueued but not yet consumed). */
	timelineBufferDepth: number
}

// ---------------------------------------------------------------------------
// audio-playback (worklet-side counters)
// ---------------------------------------------------------------------------

export interface AudioPlaybackStat extends MoqStatBase {
	type: "audio-playback"
	/** Cumulative PCM samples written to the ring buffer from the worker. */
	samplesWrittenTotal: number
	/** Cumulative PCM samples dropped (ring full). Mirrors AudioDecoderStat.samplesDroppedTotal. */
	samplesDroppedTotal: number
	/** Cumulative worklet underrun events. */
	underrunCountTotal: number
	/** Cumulative samples expected during underruns. */
	underrunSamplesExpectedTotal: number
	/** Cumulative samples actually produced during underruns. */
	underrunSamplesGotTotal: number
	/** Current fill level of the audio ring buffer in PCM samples (gauge). */
	ringFillSamples: number
	/** Ring capacity in PCM samples (constant). */
	ringCapacitySamples: number
	/** AudioContext state at snapshot time. */
	audioContextState: string
}

// ---------------------------------------------------------------------------
// timeline
// ---------------------------------------------------------------------------

export interface TimelineStat extends MoqStatBase {
	type: "timeline"
	/** Cumulative segments enqueued into the timeline (per kind, combined). */
	segmentsEnqueuedTotal: number
	/** Cumulative segments consumed from the timeline. */
	segmentsDequeuedTotal: number
	/** Cumulative segments dropped because an older sequence arrived. */
	segmentsDroppedStaleTotal: number
	/** Cumulative segments dropped because a newer sequence preempted them. */
	segmentsDroppedSlowTotal: number
	/** Approximate current buffer depth (enqueued − dequeued). */
	bufferDepth: number
}

// ---------------------------------------------------------------------------
// codec
// ---------------------------------------------------------------------------

export interface CodecStat extends MoqStatBase {
	type: "codec"
	kind: "video" | "audio"
	/** Codec string from catalog selectionParams, if present. */
	codec?: string
	/** MIME type from catalog selectionParams, if present. */
	mimeType?: string
	// Video
	width?: number
	height?: number
	framerate?: number
	// Audio
	samplerate?: number
	channels?: number
	// Both
	bitrate?: number
}

// ---------------------------------------------------------------------------
// Union and report type
// ---------------------------------------------------------------------------

export type MoqStat =
	| SessionStat
	| TransportStat
	| ControlStreamStat
	| InboundTrackStat
	| VideoDecoderStat
	| AudioDecoderStat
	| VideoRenderStat
	| AudioPlaybackStat
	| TimelineStat
	| CodecStat

/**
 * A snapshot of stats for a single `Player` instance, keyed by stable `id`.
 * Semantics mirror `RTCStatsReport`: diff two consecutive reports to compute rates.
 */
export type MoqStatsReport = Map<string, MoqStat>
