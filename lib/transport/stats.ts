/**
 * TransportStats — a single shared counter bag that Connection, ControlStream,
 * Subscriber, and Objects all write into.  Designed for zero-allocation
 * operation on the hot path: every increment is a `++` or `+= n` on a plain
 * `number` field.
 *
 * The `collect()` method snapshots the current state into a `MoqStatsReport`
 * on demand; no data structures grow between calls.
 */

import type {
	MoqStatsReport,
	TransportStat,
	ControlStreamStat,
	InboundTrackStat,
} from "../common/stats"
import { Ewma, Jitter } from "../common/stats"

// ---------------------------------------------------------------------------
// Per-subscription counter bag
// ---------------------------------------------------------------------------

/**
 * Counters for a single active (or recently closed) inbound subscription.
 * Created in Subscriber.subscribe(), dropped in Subscriber.#dropSubscribe().
 */
export class InboundTrackStats {
	/** Stable stat id assigned at construction, e.g. "inbound-track-1". */
	readonly id: string
	readonly trackName: string
	readonly namespace: string
	readonly kind: string

	/** performance.now() when SUBSCRIBE was sent. */
	subscribeStartMs = 0
	/** ms from SUBSCRIBE → SUBSCRIBE_OK (set once). */
	subscribeLatencyMs: number | undefined = undefined

	groupsReceivedTotal = 0
	objectsReceivedTotal = 0
	subgroupsReceivedTotal = 0
	lastGroupSequence = 0
	publishDoneTotal = 0
	errorTotal = 0
	unsubscribeTotal = 0

	#jitter = new Jitter()

	constructor(id: string, trackName: string, namespace: string, kind: string) {
		this.id = id
		this.trackName = trackName
		this.namespace = namespace
		this.kind = kind
	}

	onStreamArrived(nowMs: number): void {
		this.subgroupsReceivedTotal++
		this.#jitter.observe(nowMs)
	}

	onObjectArrived(groupSequence: number): void {
		this.objectsReceivedTotal++
		if (groupSequence > this.lastGroupSequence) {
			this.groupsReceivedTotal++
			this.lastGroupSequence = groupSequence
		}
	}

	get jitterMs(): number {
		return this.#jitter.jitterMs
	}
}

// ---------------------------------------------------------------------------
// Main collector
// ---------------------------------------------------------------------------

export class TransportStats {
	// --- connection-level ---
	/** performance.now() when connection was established. */
	connectedAtMs = 0
	connectDialMs: number | undefined = undefined
	setupRoundtripMs: number | undefined = undefined

	// --- control-stream counters ---
	controlBytesReceived = 0
	controlBytesSent = 0
	controlMessagesReceived = 0
	controlMessagesSent = 0
	messagesByTypeReceived: Record<string, number> = {}
	messagesByTypeSent: Record<string, number> = {}
	unknownRequestErrorsTotal = 0

	// --- object-stream counters ---
	streamsOpenedIn = 0

	// --- per-subscription tracking ---
	// Keyed by internal subscription id (stable string like "inbound-track-N").
	// Entries are deleted in onSubscriptionDropped().
	#inboundTracks = new Map<string, InboundTrackStats>()
	#nextTrackStatId = 1

	// --- subscribe latency: stamp keyed by request id bigint ---
	// Entries are cleared in onSubscribeOk / onSubscribeError.
	#subscribeStartTimes = new Map<bigint, { nowMs: number; statId: string }>()

	// -----------------------------------------------------------------------
	// Connection lifecycle hooks
	// -----------------------------------------------------------------------

	onConnected(nowMs: number): void {
		this.connectedAtMs = nowMs
	}

	onDialComplete(dialMs: number): void {
		this.connectDialMs = dialMs
	}

	onSetupComplete(roundtripMs: number): void {
		this.setupRoundtripMs = roundtripMs
	}

	// -----------------------------------------------------------------------
	// Control-stream hooks (called from ControlStream.send / .recv)
	// -----------------------------------------------------------------------

	onControlMessageReceived(typeName: string, payloadBytes: number): void {
		this.controlMessagesReceived++
		this.controlBytesReceived += payloadBytes
		this.messagesByTypeReceived[typeName] = (this.messagesByTypeReceived[typeName] ?? 0) + 1
	}

	onControlMessageSent(typeName: string, payloadBytes: number): void {
		this.controlMessagesSent++
		this.controlBytesSent += payloadBytes
		this.messagesByTypeSent[typeName] = (this.messagesByTypeSent[typeName] ?? 0) + 1
	}

	onUnknownRequestError(): void {
		this.unknownRequestErrorsTotal++
	}

	// -----------------------------------------------------------------------
	// Object-stream hooks (called from Objects.recv)
	// -----------------------------------------------------------------------

	onStreamAccepted(): void {
		this.streamsOpenedIn++
	}

	// -----------------------------------------------------------------------
	// Subscription lifecycle hooks (called from Subscriber)
	// -----------------------------------------------------------------------

	/**
	 * Register a new inbound subscription. Returns the stable `InboundTrackStats`
	 * entry so the caller can pass it to onStreamArrived / onObjectArrived later.
	 */
	onSubscribe(requestId: bigint, trackName: string, namespace: string[], kind: string, nowMs: number): InboundTrackStats {
		const statId = `inbound-track-${this.#nextTrackStatId++}`
		const entry = new InboundTrackStats(statId, trackName, namespace.join("/"), kind)
		entry.subscribeStartMs = nowMs
		this.#inboundTracks.set(statId, entry)
		this.#subscribeStartTimes.set(requestId, { nowMs, statId })
		return entry
	}

	onSubscribeOk(requestId: bigint, nowMs: number): void {
		const pending = this.#subscribeStartTimes.get(requestId)
		if (!pending) return
		this.#subscribeStartTimes.delete(requestId)
		const entry = this.#inboundTracks.get(pending.statId)
		if (entry && entry.subscribeLatencyMs === undefined) {
			entry.subscribeLatencyMs = nowMs - pending.nowMs
		}
	}

	onSubscribeError(requestId: bigint): void {
		const pending = this.#subscribeStartTimes.get(requestId)
		if (!pending) return
		this.#subscribeStartTimes.delete(requestId)
		const entry = this.#inboundTracks.get(pending.statId)
		if (entry) {
			entry.errorTotal++
		}
	}

	onSubscribeDone(statId: string): void {
		const entry = this.#inboundTracks.get(statId)
		if (entry) entry.publishDoneTotal++
	}

	onSubscribeUnsubscribed(statId: string): void {
		const entry = this.#inboundTracks.get(statId)
		if (entry) entry.unsubscribeTotal++
	}

	/**
	 * Drop the per-subscription stat entry. Must be called from
	 * Subscriber.#dropSubscribe() so entries don't accumulate under churn.
	 */
	onSubscriptionDropped(statId: string): void {
		this.#inboundTracks.delete(statId)
	}

	getTrackStats(statId: string): InboundTrackStats | undefined {
		return this.#inboundTracks.get(statId)
	}

	// -----------------------------------------------------------------------
	// Snapshot / collect
	// -----------------------------------------------------------------------

	/** Snapshot current state into `report`. */
	collect(report: MoqStatsReport, nowMs: number): void {
		const uptimeMs = this.connectedAtMs > 0 ? nowMs - this.connectedAtMs : 0

		const transport: TransportStat = {
			id: "transport",
			type: "transport",
			timestamp: nowMs,
			controlBytesReceived: this.controlBytesReceived,
			controlBytesSent: this.controlBytesSent,
			controlMessagesReceived: this.controlMessagesReceived,
			controlMessagesSent: this.controlMessagesSent,
			streamsOpenedIn: this.streamsOpenedIn,
			connectDialMs: this.connectDialMs,
			setupRoundtripMs: this.setupRoundtripMs,
			connectionUptimeMs: uptimeMs,
			activeSubscriptions: this.#inboundTracks.size,
		}
		report.set(transport.id, transport)

		const controlStream: ControlStreamStat = {
			id: "control",
			type: "control-stream",
			timestamp: nowMs,
			messagesByTypeReceived: { ...this.messagesByTypeReceived },
			messagesByTypeSent: { ...this.messagesByTypeSent },
			unknownRequestErrorsTotal: this.unknownRequestErrorsTotal,
		}
		report.set(controlStream.id, controlStream)

		// Snapshot each active inbound-track entry.
		for (const entry of this.#inboundTracks.values()) {
			const stat: InboundTrackStat = {
				id: entry.id,
				type: "inbound-track",
				timestamp: nowMs,
				trackName: entry.trackName,
				namespace: entry.namespace,
				kind: entry.kind,
				subscribeLatencyMs: entry.subscribeLatencyMs,
				groupsReceivedTotal: entry.groupsReceivedTotal,
				objectsReceivedTotal: entry.objectsReceivedTotal,
				subgroupsReceivedTotal: entry.subgroupsReceivedTotal,
				lastGroupSequence: entry.lastGroupSequence,
				publishDoneTotal: entry.publishDoneTotal,
				errorTotal: entry.errorTotal,
				unsubscribeTotal: entry.unsubscribeTotal,
				interArrivalJitterMs: entry.jitterMs,
			}
			report.set(stat.id, stat)
		}
	}
}
