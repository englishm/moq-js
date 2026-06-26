import * as Control from "./control"
import { ControlStream } from "./stream"
import { Queue, Watch } from "../common/async"
import { Objects, TrackWriter, ObjectDatagramType } from "./objects"
import { SubgroupType, SubgroupWriter } from "./subgroup"
import { getLogger } from "../common/logger"

const log = getLogger()

export class Publisher {
	// Used to send control messages
	#control: ControlStream

	// Use to send objects.
	#objects: Objects

	// Our announced tracks.
	#publishedNamespaces = new Map<string, PublishNamespaceSend>()
	#waitingPublishNamespaceRequests = new Map<bigint, string>()

	// Their subscribed tracks.
	#subscribe = new Map<bigint, SubscribeRecv>()
	#subscribeQueue = new Queue<SubscribeRecv>(Number.MAX_SAFE_INTEGER) // Unbounded queue in case there's no receiver

	// Track alias counter (publisher assigns these in draft-14)
	#nextTrackAlias = 0n

	constructor(control: ControlStream, objects: Objects) {
		this.#control = control
		this.#objects = objects
	}

	async publish_namespace(namespace: string[]): Promise<PublishNamespaceSend> {
		if (this.#publishedNamespaces.has(namespace.join("/"))) {
			throw new Error(`already announced: ${namespace.join("/")}`)
		}

		const publishNamespaceSend = new PublishNamespaceSend(this.#control, namespace)
		this.#publishedNamespaces.set(namespace.join("/"), publishNamespaceSend)
		const id = this.#control.nextRequestId()
		this.#waitingPublishNamespaceRequests.set(id, namespace.join("/"))

		await this.#control.send({
			type: Control.ControlMessageType.PublishNamespace,
			message: {
				id,
				namespace,
			},
		})

		return publishNamespaceSend
	}

	// Receive the next new subscription
	async subscribed() {
		return await this.#subscribeQueue.next()
	}

	async recv(msg: Control.MessageWithType) {
		const { type, message } = msg
		switch (type) {
			case Control.ControlMessageType.Subscribe:
				await this.recvSubscribe(message)
				break
			case Control.ControlMessageType.Unsubscribe:
				this.recvUnsubscribe(message)
				break
			case Control.ControlMessageType.PublishNamespaceOk:
				this.recvPublishNamespaceOk(message)
				break
			case Control.ControlMessageType.PublishNamespaceError:
				this.recvPublishNamespaceError(message)
				break
			default:
				throw new Error(`unknown control message`) // impossible
		}
	}

	recvPublishNamespaceOk(msg: Control.PublishNamespaceOk) {
		const namespace = this.#waitingPublishNamespaceRequests.get(msg.id)
		if (!namespace) {
			throw new Error(`publish namespace OK for unknown announce: ${msg.id}`)
		}
		const publishNamespaceSend = this.#publishedNamespaces.get(namespace)
		if (!publishNamespaceSend) {
			throw new Error(`no active published namespace: ${namespace}`)
		}

		publishNamespaceSend.onOk()
		log.debug("published namespace", namespace)
	}

	recvPublishNamespaceError(msg: Control.PublishNamespaceError) {
		const namespace = this.#waitingPublishNamespaceRequests.get(msg.id)
		if (!namespace) {
			throw new Error(`publish namespace error for unknown announce: ${msg.id}`)
		}
		const publishNamespaceSend = this.#publishedNamespaces.get(namespace)
		if (!publishNamespaceSend) {
			// TODO debug this
			log.warn(`publish namespace error for unknown announce: ${namespace}`)
			return
		}

		publishNamespaceSend.onError(msg.code, msg.reason)
	}

	async recvSubscribe(msg: Control.Subscribe) {
		try {
			if (this.#subscribe.has(msg.id)) {
				throw new Error(`duplicate subscribe for id: ${msg.id}`)
			}

			const trackAlias = this.#nextTrackAlias++
			const subscribe = new SubscribeRecv(this.#control, this.#objects, msg, trackAlias)
			this.#subscribe.set(msg.id, subscribe)
			await this.#subscribeQueue.push(subscribe)
		} catch (e: any) {
			await this.#control.send({
				type: Control.ControlMessageType.SubscribeError,
				message: {
					id: msg.id,
					code: 0n,
					reason: e.message,
				},
			})
			throw e
		}
	}

	recvUnsubscribe(msg: Control.Unsubscribe) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`unsubscribe for unknown subscribe: ${msg.id}`)
		}
		subscribe.close({ unsubscribe: false })
		this.#subscribe.delete(msg.id)
	}
}

export class PublishNamespaceSend {
	#control: ControlStream

	readonly namespace: string[]

	// The current state, updated by control messages.
	#state = new Watch<"init" | "ack" | Error>("init")

	constructor(control: ControlStream, namespace: string[]) {
		this.#control = control
		this.namespace = namespace
	}

	async ok() {
		for (;;) {
			const [state, next] = this.#state.value()
			if (state === "ack") return
			if (state instanceof Error) throw state
			if (!next) throw new Error("closed")

			await next
		}
	}

	async active() {
		for (;;) {
			const [state, next] = this.#state.value()
			if (state instanceof Error) throw state
			if (!next) return

			await next
		}
	}

	async close() {
		// TODO implement unsubscribe
		// await this.#inner.sendUnsubscribe()
	}

	closed() {
		const [state, next] = this.#state.value()
		return state instanceof Error || next == undefined
	}

	onOk() {
		if (this.closed()) return
		this.#state.update("ack")
	}

	onError(code: bigint, reason: string) {
		if (this.closed()) return

		const err = new Error(`PUBLISH_NAMESPACE_ERROR (${code})` + reason ? `: ${reason}` : "")
		this.#state.update(err)
	}
}

export class SubscribeRecv {
	#control: ControlStream
	#objects: Objects
	#id: bigint
	#trackAlias: bigint // Publisher-specified in draft-14
	#subscriberPriority: number
	groupOrder: Control.GroupOrder

	readonly namespace: string[]
	readonly track: string

	// The current state of the subscription.
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: ControlStream, objects: Objects, msg: Control.Subscribe, trackAlias: bigint) {
		this.#control = control // so we can send messages
		this.#objects = objects // so we can send objects
		this.#id = msg.id
		this.#trackAlias = trackAlias
		this.namespace = msg.namespace
		this.track = msg.name
		this.#subscriberPriority = msg.subscriber_priority
		this.groupOrder = msg.group_order
	}

	// Acknowledge the subscription as valid.
	async ack() {
		if (this.#state !== "init") return
		this.#state = "ack"

		log.debug("sending subscribe ok", { id: this.#id, trackAlias: this.#trackAlias })

		// NOTE(itzmanish): revisit this
		// Send the control message.
		return this.#control.send({
			type: Control.ControlMessageType.SubscribeOk,
			message: {
				id: this.#id,
				expires: 0n,
				group_order: this.groupOrder,
				track_alias: this.#trackAlias,
				content_exists: 0,
				params: new Map(),
			},
		})
	}

	// Close the subscription with an error.
	async close({
		code = 0n,
		reason = "",
		unsubscribe = true,
	}: {
		code?: bigint
		reason?: string
		unsubscribe?: boolean
	}) {
		if (this.#state === "closed") return
		const acked = this.#state === "ack"
		this.#state = "closed"

		if (!acked) {
			return this.#control.send({
				type: Control.ControlMessageType.SubscribeError,
				message: { id: this.#id, code, reason },
			})
		}
		if (unsubscribe) {
			return this.#control.send({
				type: Control.ControlMessageType.Unsubscribe,
				message: { id: this.#id },
			})
		}
	}

	// Create a writable data stream for the entire track (using datagrams)
	async serve(props?: { priority: number }): Promise<TrackWriter> {
		if (this.#state === "closed") {
			throw new Error("subscribe closed")
		}
		return this.#objects.send({
			type: ObjectDatagramType.Type0x0, // Basic datagram without extensions
			track_alias: this.#trackAlias,
			group_id: 0, // Will be set per write
			object_id: 0, // Will be set per write
			publisher_priority: props?.priority ?? 127,
		}) as Promise<TrackWriter>
	}

	// Create a writable data stream for a subgroup within the track
	async subgroup(props: { group: number; subgroup: number; priority?: number }): Promise<SubgroupWriter> {
		if (this.#state === "closed") {
			throw new Error("subscribe closed")
		}
		return this.#objects.send({
			type: SubgroupType.Type0x10, // Basic subgroup without extensions
			track_alias: this.#trackAlias,
			group_id: props.group,
			subgroup_id: props.subgroup,
			publisher_priority: props.priority ?? 127,
		}) as Promise<SubgroupWriter>
	}
}
