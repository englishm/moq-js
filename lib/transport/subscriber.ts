import * as Control from "./control"
import { Queue, Watch } from "../common/async"
import { Objects } from "./objects"
import type { TrackReader } from "./objects"
import { debug } from "./utils"
import { ControlStream } from "./stream"
import { SubgroupReader } from "./subgroup"
import { ParameterType } from "./base_data"
import { getLogger } from "../common/logger"
import type { TransportStats } from "./stats"
import type { InboundTrackStats } from "./stats"

const log = getLogger()

export interface TrackInfo {
	track_alias: bigint
	track: TrackReader | SubgroupReader
}

export interface SubscribeRequestOptions {
	forward?: number | boolean
	subscriber_priority?: number
	group_order?: Control.GroupOrder
	filter?: Control.SubscriptionFilter
}

export class Subscriber {
	// Use to send control messages.
	#control: ControlStream

	// Use to send objects.
	#objects: Objects

	// Optional stats collector shared with the owning Connection.
	#stats?: TransportStats

	// Announced broadcasts.
	#publishedNamespaces = new Map<string, PublishNamespaceRecv>()
	#publishedNamespacesQueue = new Watch<PublishNamespaceRecv[]>([])
	// Our subscribed tracks.
	#subscribe = new Map<bigint, SubscribeSend>()
	#trackToIDMap = new Map<string, bigint>()
	#trackAliasMap = new Map<bigint, bigint>() // Maps request ID to track alias
	#aliasToSubscriptionMap = new Map<bigint, bigint>() // Maps track alias to subscription ID
	#pendingTrack = new Map<bigint, (id: bigint) => Promise<void>>()
	// Maps request id → InboundTrackStats for subscribe latency and per-object hooks.
	#trackStatsByRequestId = new Map<bigint, InboundTrackStats>()
	// Maps track alias → InboundTrackStats (set on SUBSCRIBE_OK, used in recvObject).
	#trackStatsByAlias = new Map<bigint, InboundTrackStats>()

	#dropSubscribe(id: bigint): SubscribeSend | undefined {
		const subscribe = this.#subscribe.get(id)
		if (!subscribe) {
			return
		}

		this.#subscribe.delete(id)

		const trackAlias = this.#trackAliasMap.get(id)
		if (trackAlias !== undefined) {
			this.#trackAliasMap.delete(id)
			this.#aliasToSubscriptionMap.delete(trackAlias)
			this.#trackStatsByAlias.delete(trackAlias)
		}

		// Drop the per-subscription stat entry so it doesn't accumulate under churn.
		const trackStatEntry = this.#trackStatsByRequestId.get(id)
		if (trackStatEntry) {
			this.#trackStatsByRequestId.delete(id)
			this.#stats?.onSubscriptionDropped(trackStatEntry.id)
		}

		const mappedId = this.#trackToIDMap.get(subscribe.track)
		if (mappedId === id) {
			this.#trackToIDMap.delete(subscribe.track)
		}

		return subscribe
	}

	constructor(control: ControlStream, objects: Objects, stats?: TransportStats) {
		this.#control = control
		this.#objects = objects
		this.#stats = stats
	}

	publishedNamespaces(): Watch<PublishNamespaceRecv[]> {
		return this.#publishedNamespacesQueue
	}

	hasOutstandingRequest(id: bigint) {
		return this.#subscribe.has(id)
	}

	async recv(msg: Control.MessageWithType) {
		const { type, message } = msg
		switch (type) {
			case Control.ControlMessageType.PublishNamespace:
				await this.recvPublishNamespace(message)
				break
			case Control.ControlMessageType.PublishNamespaceDone:
				this.recvPublishNamespaceDone(message)
				break
			case Control.ControlMessageType.SubscribeOk:
				this.recvSubscribeOk(message)
				break
			case Control.ControlMessageType.RequestError:
				await this.recvRequestError(message)
				break
			case Control.ControlMessageType.PublishDone:
				await this.recvPublishDone(message)
				break
			default:
				throw new Error(`unknown control message`) // impossible
		}
	}

	async recvPublishNamespace(msg: Control.PublishNamespace) {
		if (this.#publishedNamespaces.has(msg.namespace.join("/"))) {
			throw new Error(`duplicate publish namespace for namespace: ${msg.namespace.join("/")}`)
		}

		await this.#control.send({
			type: Control.ControlMessageType.RequestOk,
			message: { id: msg.id, parameters: new Map() },
		})

		const publishNamespace = new PublishNamespaceRecv(this.#control, msg.namespace, msg.id)
		this.#publishedNamespaces.set(msg.namespace.join("/"), publishNamespace)
		this.#publishedNamespacesQueue.update((queue) => [...queue, publishNamespace])
	}

	recvPublishNamespaceDone(_msg: Control.PublishNamespaceDone) {
		throw new Error(`TODO PublishNamespaceDone`)
	}

	async subscribe_namespace(namespace: string[]) {
		const id = await this.#control.nextRequestId()
		// TODO(itzmanish): implement this
		const msg: Control.MessageWithType = {
			type: Control.ControlMessageType.SubscribeNamespace,
			message: {
				id,
				namespace,
				subscribe_options: Control.SubscribeOptions.BOTH,
			},
		}
		await this.#control.send(msg)
	}

	async subscribe(namespace: string[], track: string, opts?: SubscribeRequestOptions) {
		const id = await this.#control.nextRequestId()

		const subscribe = new SubscribeSend(this.#control, id, namespace, track, (sid) => {
			// Local-state cleanup hook so SubscribeSend.close() can drop the
			// subscription from #subscribe / #trackToIDMap / alias maps. The
			// returned SubscribeSend (if any) is the same one calling us — we
			// don't need to do anything else with it here.
			this.#dropSubscribe(sid)
		})
		this.#subscribe.set(id, subscribe)

		// Register subscribe latency timer and inbound-track stat entry.
		if (this.#stats) {
			// Derive kind from track name convention: ".m4s" suffix = media, ".catalog" = data.
			const kind = track.endsWith(".m4s") ? "video/audio" : track === ".catalog" ? "data" : "unknown"
			const trackStats = this.#stats.onSubscribe(id, track, namespace, kind, performance.now())
			this.#trackStatsByRequestId.set(id, trackStats)
		}

		this.#trackToIDMap.set(track, id)

		const params = new Map<bigint, Uint8Array | bigint>()
		if (opts?.forward !== undefined) {
			const forward = typeof opts.forward === "boolean" ? (opts.forward ? 1 : 0) : opts.forward
			if (forward !== 0 && forward !== 1) throw new Error("forward must be 0, 1, true, or false")
			params.set(BigInt(ParameterType.FORWARD), BigInt(forward))
		}
		if (opts?.subscriber_priority !== undefined) {
			params.set(BigInt(ParameterType.SUBSCRIBER_PRIORITY), BigInt(opts.subscriber_priority))
		}
		if (opts?.group_order !== undefined) {
			if (opts.group_order === Control.GroupOrder.Publisher)
				throw new Error("group_order parameter must be Ascending or Descending")
			params.set(BigInt(ParameterType.GROUP_ORDER), BigInt(opts.group_order))
		}
		if (opts?.filter !== undefined) {
			params.set(BigInt(ParameterType.SUBSCRIPTION_FILTER), Control.SubscriptionFilter.serialize(opts.filter))
		}

		const subscription_req: Control.MessageWithType = {
			type: Control.ControlMessageType.Subscribe,
			message: {
				id,
				namespace,
				name: track,
				params,
			},
		}

		await this.#control.send(subscription_req)
		debug("subscribe request sent", { id, namespace, track })

		return subscribe
	}

	async unsubscribe(track: string) {
		const trackID = this.#trackToIDMap.get(track)
		if (trackID === undefined) {
			log.warn(`unsubscribe attempted but track ${track} not found in trackToIDMap`)
			return
		}

		// Per draft-16 section 5.1.1, the subscriber keeps subscription state until it sends
		// UNSUBSCRIBE. Tear down local state immediately after the control message is sent so
		// consumers blocked on sub.data() can exit and the player can pause/resume cleanly.
		let subscribe: SubscribeSend | undefined
		try {
			await this.#control.send({ type: Control.ControlMessageType.Unsubscribe, message: { id: trackID } })
			subscribe = this.#dropSubscribe(trackID)
		} catch (error) {
			log.error(`failed to unsubscribe from track ${track}`, error)
			return
		}

		if (subscribe) {
			await subscribe.onDone(0n, 0n, "unsubscribed")
		}
	}

	recvSubscribeOk(msg: Control.SubscribeOk) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe ok for unknown id: ${msg.id}`)
		}

		// Store the track alias provided by the publisher
		this.#trackAliasMap.set(msg.id, msg.track_alias)
		// Also create reverse mapping for receiving objects
		this.#aliasToSubscriptionMap.set(msg.track_alias, msg.id)

		// Record subscribe latency and wire alias → stats for per-object hooks.
		if (this.#stats) {
			this.#stats.onSubscribeOk(msg.id, performance.now())
			const trackStats = this.#trackStatsByRequestId.get(msg.id)
			if (trackStats) {
				this.#trackStatsByAlias.set(msg.track_alias, trackStats)
			}
		}

		const callback = this.#pendingTrack.get(msg.track_alias)
		if (callback) {
			this.#pendingTrack.delete(msg.track_alias)
			void callback(msg.id)
		}

		log.debug("subscribe ok", msg)
		subscribe.onOk(msg.track_alias)
	}

	async recvRequestError(msg: Control.RequestError) {
		this.#stats?.onSubscribeError(msg.id)
		const subscribe = this.#dropSubscribe(msg.id)
		if (!subscribe) {
			throw new Error(`request error for unknown id: ${msg.id}`)
		}

		await subscribe.onError(msg.code, msg.reason)
	}

	async recvPublishDone(msg: Control.PublishDone) {
		// Record publishDone before dropping the entry so the stat is captured.
		const trackStats = this.#trackStatsByRequestId.get(msg.id)
		if (trackStats) this.#stats?.onSubscribeDone(trackStats.id)

		const subscribe = this.#dropSubscribe(msg.id)
		if (!subscribe) {
			// This can arrive after we locally sent UNSUBSCRIBE and dropped the subscription.
			log.debug(`PUBLISH_DONE for unknown subscription (already torn down locally): ${msg.id}`)
			return
		}

		await subscribe.onDone(msg.code, msg.stream_count, msg.reason)
	}

	async recvObject(reader: TrackReader | SubgroupReader) {
		log.trace("recvObject", reader)
		// Get track alias from reader header
		const track_alias = reader.header.track_alias

		// Record per-track stream arrival for stats.
		const trackStats = this.#trackStatsByAlias.get(track_alias)
		if (trackStats) {
			trackStats.onStreamArrived(performance.now())
		}

		// Map track alias back to subscription ID
		const subscriptionId = this.#aliasToSubscriptionMap.get(track_alias)
		log.trace("resolved subscriptionId", subscriptionId)
		const callback = async (id: bigint) => {
			const subscribe = this.#subscribe.get(id)
			if (!subscribe) {
				log.debug(`dropping data for already-removed subscription: ${id}`)
				return
			}
			log.trace("dispatching data to subscription", id)
			return subscribe.onData(reader)
		}
		if (subscriptionId === undefined) {
			log.warn(`track alias ${track_alias} not found in aliasToSubscriptionMap`)
			this.#pendingTrack.set(track_alias, callback)
			return
		}

		await callback(subscriptionId)
	}
}

export class PublishNamespaceRecv {
	#control: ControlStream
	#id: bigint

	readonly namespace: string[]

	// The current state of the publish namespace
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: ControlStream, namespace: string[], id: bigint) {
		this.#control = control // so we can send messages
		this.namespace = namespace
		this.#id = id
	}

	// Acknowledge the publish namespace as valid.
	async ok() {
		if (this.#state !== "init") return
		this.#state = "ack"

		// Send the control message.
		return this.#control.send({
			type: Control.ControlMessageType.RequestOk,
			message: { id: this.#id, parameters: new Map() },
		})
	}

	async close(code = 0n, reason = "") {
		if (this.#state === "closed") return
		this.#state = "closed"

		return this.#control.send({
			type: Control.ControlMessageType.RequestError,
			message: { id: this.#id, code, retry_interval: 0n, reason },
		})
	}
}

export class SubscribeSend {
	#control: ControlStream
	#id: bigint
	#trackAlias?: bigint // Set when SUBSCRIBE_OK is received
	// Closed locally once UNSUBSCRIBE has been sent OR a terminal control
	// message (PUBLISH_DONE / REQUEST_ERROR) was received. Used to make
	// close() idempotent and to avoid sending UNSUBSCRIBE for a subscription
	// that the publisher has already terminated.
	#closed = false
	// Hook back into the owning Subscriber so close() can drop local
	// bookkeeping (subscribe map, trackToID map, alias maps). Not invoked when
	// the subscription was already terminated by the publisher — the receive
	// path drops state itself in that case.
	#onClose: (id: bigint) => void

	readonly namespace: string[]
	readonly track: string

	// A queue of received streams for this subscription.
	#data = new Queue<TrackReader | SubgroupReader>()

	constructor(
		control: ControlStream,
		id: bigint,
		namespace: string[],
		track: string,
		onClose: (id: bigint) => void,
	) {
		this.#control = control // so we can send messages
		this.#id = id
		this.namespace = namespace
		this.track = track
		this.#onClose = onClose
	}

	get trackAlias(): bigint | undefined {
		return this.#trackAlias
	}

	async close(_code = 0n, _reason = "") {
		// Idempotent. The subscription may already be torn down because:
		//   - The publisher sent PUBLISH_DONE / REQUEST_ERROR (recv path
		//     called onDone/onError, which sets #closed).
		//   - A previous close() call already sent UNSUBSCRIBE.
		// In either case there's nothing more to do — re-sending UNSUBSCRIBE
		// would target an unknown subscription id on the relay.
		if (this.#closed) return
		this.#closed = true

		try {
			await this.#control.send({
				type: Control.ControlMessageType.Unsubscribe,
				message: { id: this.#id },
			})
		} catch (err) {
			log.warn("failed to send UNSUBSCRIBE on close", { id: this.#id, track: this.track, err })
			// Still drop local state below — keeping a stale entry around
			// after a control-stream failure helps nothing.
		}

		// Drop the local subscription bookkeeping so a follow-up
		// subscribe(namespace, sameTrack) on this connection can succeed.
		this.#onClose(this.#id)

		// Close the data queue so anyone awaiting sub.data() unblocks.
		if (!this.#data.closed()) {
			await this.#data.close()
		}
	}

	onOk(trackAlias: bigint) {
		log.debug("setting track alias", trackAlias)
		this.#trackAlias = trackAlias
	}

	// FIXME(itzmanish): implement correctly
	async onDone(code: bigint, streamCount: bigint, reason: string) {
		log.debug("subscription done", { id: this.#id, code, streamCount, reason, track: this.track })
		// Publisher terminated the subscription — no need for us to send
		// UNSUBSCRIBE on a subsequent close().
		this.#closed = true

		if (code === 0n) {
			return await this.#data.close()
		}

		const suffix = reason !== "" ? `: ${reason}` : ""
		return await this.#data.abort(new Error(`PUBLISH_DONE (${code})${suffix}`))
	}

	async onError(code: bigint, reason: string) {
		// Relay/publisher errored the subscription — same reasoning as onDone.
		this.#closed = true
		if (code == 0n) {
			return await this.#data.close()
		}

		if (reason !== "") {
			reason = `: ${reason}`
		}

		const err = new Error(`REQUEST_ERROR (${code})${reason}`)
		return await this.#data.abort(err)
	}

	async onData(reader: TrackReader | SubgroupReader) {
		log.trace("onData", reader)
		if (!this.#data.closed()) await this.#data.push(reader)
	}

	// Receive the next a readable data stream
	async data() {
		return await this.#data.next()
	}
}
