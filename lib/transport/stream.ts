import {
	ControlMessageType,
	MessageWithType,
	Publish,
	PublishDone,
	PublishNamespace,
	PublishNamespaceDone,
	PublishNamespaceCancel,
	PublishOk,
	Unsubscribe,
	Fetch,
	FetchOk,
	FetchCancel,
	Subscribe,
	SubscribeOk,
	SubscribeUpdate,
	SubscribeNamespace,
	Namespace,
	NamespaceDone,
	TrackStatus,
	MaxRequestId,
	RequestsBlocked,
	RequestOk,
	RequestError,
	GoAway,
} from "./control"
import { debug } from "./utils"
import { ImmutableBytesBuffer, ReadableWritableStreamBuffer, Reader, Writer } from "./buffer"
import { RequestId } from "./request_id"

export class ControlStream {
	private decoder: Decoder
	private encoder: Encoder
	#requestId: RequestId

	#mutex = Promise.resolve()

	constructor(c: ReadableWritableStreamBuffer, requestId = RequestId.client(0n, 0n)) {
		this.decoder = new Decoder(c)
		this.encoder = new Encoder(c)
		this.#requestId = requestId
	}

	// Will error if two messages are read at once.
	async recv(): Promise<MessageWithType> {
		const msg = await this.decoder.message()
		return msg
	}

	async send(msg: MessageWithType) {
		const unlock = await this.#lock()
		try {
			debug("sending message", msg)
			const payload = this.encoder.message(msg)
			debug("sending payload", payload)
			await this.encoder.send(payload)
		} finally {
			unlock()
		}
	}

	async #lock() {
		// Make a new promise that we can resolve later.
		let done: () => void
		const p = new Promise<void>((resolve) => {
			done = () => resolve()
		})

		// Wait until the previous lock is done, then resolve our lock.
		const lock = this.#mutex.then(() => done)

		// Save our lock as the next lock.
		this.#mutex = p

		// Return the lock.
		return lock
	}

	async nextRequestId(): Promise<bigint> {
		const allocation = this.#requestId.allocate()
		if (allocation.type === "allocated") {
			return allocation.id
		}

		if (allocation.should_send_requests_blocked) {
			await this.send({
				type: ControlMessageType.RequestsBlocked,
				message: { maximum_request_id: allocation.max_request_id },
			})
		}

		throw new Error("request ID limit reached")
	}

	applyMaxRequestId(msg: MaxRequestId) {
		this.#requestId.applyMaxRequestId(msg)
	}

	validateIncomingRequestId(id: bigint) {
		this.#requestId.validateIncoming(id)
	}

	handleRequestsBlocked(msg: RequestsBlocked) {
		this.#requestId.handleRequestsBlocked(msg)
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	private async messageType(): Promise<ControlMessageType> {
		const t = await this.r.getNumberVarInt()
		return t as ControlMessageType
	}

	async message(): Promise<MessageWithType> {
		const t = await this.messageType()
		const advertisedLength = await this.r.getU16()
		if (advertisedLength > this.r.byteLength) {
			console.error(
				`message: ${ControlMessageType.toString(t)} length mismatch: advertised ${advertisedLength} > ${this.r.byteLength} received`,
			)
			// NOTE(itzmanish): should we have a timeout and retry few times even if timeout is reached?
			await this.r.waitForBytes(advertisedLength)
		}
		const rawPayload = await this.r.read(advertisedLength)
		const payload = new ImmutableBytesBuffer(rawPayload)

		let res: MessageWithType
		switch (t) {
			case ControlMessageType.GoAway:
				res = {
					type: t,
					message: GoAway.deserialize(payload),
				}
				break
			case ControlMessageType.Subscribe:
				res = {
					type: t,
					message: Subscribe.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeOk:
				res = {
					type: t,
					message: SubscribeOk.deserialize(payload),
				}
				break
			case ControlMessageType.Unsubscribe:
				res = {
					type: t,
					message: Unsubscribe.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeUpdate:
				res = {
					type: t,
					message: SubscribeUpdate.deserialize(payload),
				}
				break
			case ControlMessageType.Publish:
				res = {
					type: t,
					message: Publish.deserialize(payload),
				}
				break
			case ControlMessageType.PublishDone:
				res = {
					type: t,
					message: PublishDone.deserialize(payload),
				}
				break
			case ControlMessageType.PublishOk:
				res = {
					type: t,
					message: PublishOk.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespace:
				res = {
					type: t,
					message: PublishNamespace.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespaceDone:
				res = {
					type: t,
					message: PublishNamespaceDone.deserialize(payload),
				}
				break
			case ControlMessageType.Fetch:
				res = {
					type: t,
					message: Fetch.deserialize(payload),
				}
				break
			case ControlMessageType.FetchCancel:
				res = {
					type: t,
					message: FetchCancel.deserialize(payload),
				}
				break
			case ControlMessageType.FetchOk:
				res = {
					type: t,
					message: FetchOk.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeNamespace:
				res = {
					type: t,
					message: SubscribeNamespace.deserialize(payload),
				}
				break
			case ControlMessageType.RequestOk:
				res = {
					type: t,
					message: RequestOk.deserialize(payload),
				}
				break
			case ControlMessageType.RequestError:
				res = {
					type: t,
					message: RequestError.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespaceCancel:
				res = {
					type: t,
					message: PublishNamespaceCancel.deserialize(payload),
				}
				break
			case ControlMessageType.Namespace:
				res = {
					type: t,
					message: Namespace.deserialize(payload),
				}
				break
			case ControlMessageType.NamespaceDone:
				res = {
					type: t,
					message: NamespaceDone.deserialize(payload),
				}
				break
			case ControlMessageType.TrackStatus:
				res = {
					type: t,
					message: TrackStatus.deserialize(payload),
				}
				break
			case ControlMessageType.MaxRequestId:
				res = {
					type: t,
					message: MaxRequestId.deserialize(payload),
				}
				break
			case ControlMessageType.RequestsBlocked:
				res = {
					type: t,
					message: RequestsBlocked.deserialize(payload),
				}
				break
			default:
				throw new Error(`unknown message kind: ${t}`)
		}

		return res
	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	message(m: MessageWithType): Uint8Array {
		const { message } = m
		switch (m.type) {
			case ControlMessageType.GoAway:
				return GoAway.serialize(message as GoAway)
			case ControlMessageType.Subscribe:
				return Subscribe.serialize(message as Subscribe)
			case ControlMessageType.SubscribeOk:
				return SubscribeOk.serialize(message as SubscribeOk)
			case ControlMessageType.SubscribeUpdate:
				return SubscribeUpdate.serialize(message as SubscribeUpdate)
			case ControlMessageType.SubscribeNamespace:
				return SubscribeNamespace.serialize(message as SubscribeNamespace)
			case ControlMessageType.Unsubscribe:
				return Unsubscribe.serialize(message as Unsubscribe)
			case ControlMessageType.Publish:
				return Publish.serialize(message as Publish)
			case ControlMessageType.PublishDone:
				return PublishDone.serialize(message as PublishDone)
			case ControlMessageType.PublishOk:
				return PublishOk.serialize(message as PublishOk)
			case ControlMessageType.PublishNamespace:
				return PublishNamespace.serialize(message as PublishNamespace)
			case ControlMessageType.PublishNamespaceDone:
				return PublishNamespaceDone.serialize(message as PublishNamespaceDone)
			case ControlMessageType.Fetch:
				return Fetch.serialize(message as Fetch)
			case ControlMessageType.FetchCancel:
				return FetchCancel.serialize(message as FetchCancel)
			case ControlMessageType.FetchOk:
				return FetchOk.serialize(message as FetchOk)
			case ControlMessageType.RequestOk:
				return RequestOk.serialize(message as RequestOk)
			case ControlMessageType.RequestError:
				return RequestError.serialize(message as RequestError)
			case ControlMessageType.PublishNamespaceCancel:
				return PublishNamespaceCancel.serialize(message as PublishNamespaceCancel)
			case ControlMessageType.Namespace:
				return Namespace.serialize(message as Namespace)
			case ControlMessageType.NamespaceDone:
				return NamespaceDone.serialize(message as NamespaceDone)
			case ControlMessageType.TrackStatus:
				return TrackStatus.serialize(message as TrackStatus)
			case ControlMessageType.MaxRequestId:
				return MaxRequestId.serialize(message as MaxRequestId)
			case ControlMessageType.RequestsBlocked:
				return RequestsBlocked.serialize(message as RequestsBlocked)
			default:
				throw new Error(`unknown message kind in encoder`)
		}
	}

	async send(payload: Uint8Array) {
		await this.w.write(payload)
	}
}
