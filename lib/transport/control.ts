import { Reader, Writer } from "./stream"

export type Message = Subscriber | Publisher

// Sent by subscriber
export type Subscriber = Subscribe | Unsubscribe | AnnounceOk | AnnounceError

export function isSubscriber(m: Message): m is Subscriber {
	return (
		m.kind == Msg.Subscribe || m.kind == Msg.Unsubscribe || m.kind == Msg.AnnounceOk || m.kind == Msg.AnnounceError
	)
}

// Sent by publisher
export type Publisher = SubscribeOk | SubscribeError | SubscribeDone | Announce | Unannounce

export function isPublisher(m: Message): m is Publisher {
	return (
		m.kind == Msg.SubscribeOk ||
		m.kind == Msg.SubscribeError ||
		m.kind == Msg.SubscribeDone ||
		m.kind == Msg.Announce ||
		m.kind == Msg.Unannounce
	)
}

// I wish we didn't have to split Msg and Id into separate enums.
// However using the string in the message makes it easier to debug.
// We'll take the tiny performance hit until I'm better at Typescript.
export enum Msg {
	// NOTE: object and setup are in other modules
	Subscribe = "subscribe",
	SubscribeOk = "subscribe_ok",
	SubscribeError = "subscribe_error",
	SubscribeDone = "subscribe_done",
	Unsubscribe = "unsubscribe",
	Announce = "announce",
	AnnounceOk = "announce_ok",
	AnnounceError = "announce_error",
	Unannounce = "unannounce",
	GoAway = "go_away",
}

enum Id {
	// NOTE: object and setup are in other modules
	// Object = 0,
	// Setup = 1,

	Subscribe = 0x3,
	SubscribeOk = 0x4,
	SubscribeError = 0x5,
	SubscribeDone = 0xb,
	Unsubscribe = 0xa,
	Announce = 0x6,
	AnnounceOk = 0x7,
	AnnounceError = 0x8,
	Unannounce = 0x9,
	GoAway = 0x10,
}

export interface Subscribe {
	kind: Msg.Subscribe

	id: bigint
	trackId: bigint
	namespace: string[]
	name: string
	subscriber_priority: number
	group_order: GroupOrder

	location: Location

	params?: Parameters
}

export enum GroupOrder {
	Publisher = 0x0,
	Ascending = 0x1,
	Descending = 0x2,
}

export type Location = LatestGroup | LatestObject | AbsoluteStart | AbsoluteRange

export interface LatestGroup {
	mode: "latest_group"
}

export interface LatestObject {
	mode: "latest_object"
}

export interface AbsoluteStart {
	mode: "absolute_start"
	start_group: number
	start_object: number
}

export interface AbsoluteRange {
	mode: "absolute_range"
	start_group: number
	start_object: number
	end_group: number
	end_object: number
}

export type Parameters = Map<bigint, Uint8Array>

export interface SubscribeOk {
	kind: Msg.SubscribeOk
	id: bigint
	expires: bigint
	group_order: GroupOrder
	latest?: [number, number]
	params?: Parameters
}

export interface SubscribeDone {
	kind: Msg.SubscribeDone
	id: bigint
	code: bigint
	reason: string
	final?: [number, number]
}

export interface SubscribeError {
	kind: Msg.SubscribeError
	id: bigint
	code: bigint
	reason: string
	//trackAlias?: bigint
}

export interface Unsubscribe {
	kind: Msg.Unsubscribe
	id: bigint
}

export interface Announce {
	kind: Msg.Announce
	namespace: string[]
	params?: Parameters
}

export interface AnnounceOk {
	kind: Msg.AnnounceOk
	namespace: string[]
}

export interface AnnounceError {
	kind: Msg.AnnounceError
	namespace: string[]
	code: bigint
	reason: string
}

export interface Unannounce {
	kind: Msg.Unannounce
	namespace: string[]
}

export class Stream {
	private decoder: Decoder
	private encoder: Encoder

	#mutex = Promise.resolve()

	constructor(r: Reader, w: Writer) {
		this.decoder = new Decoder(r)
		this.encoder = new Encoder(w)
	}

	// Will error if two messages are read at once.
	async recv(): Promise<Message> {
		const msg = await this.decoder.message()
		console.log("received message", msg)
		return msg
	}

	async send(msg: Message) {
		const unlock = await this.#lock()
		try {
			console.log("sending message", msg)
			await this.encoder.message(msg)
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

		// Wait until the previous lock is done, then resolve our our lock.
		const lock = this.#mutex.then(() => done)

		// Save our lock as the next lock.
		this.#mutex = p

		// Return the lock.
		return lock
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	private async msg(): Promise<Msg> {
		const t = await this.r.u53()

		const advertisedLength = await this.r.u53()
		if (advertisedLength !== this.r.getByteLength()) {
			// @todo: throw this error and close the session
			// "If the length does not match the length of the message content, the receiver MUST close the session."
			console.error(
				`message length mismatch: advertised ${advertisedLength} != ${this.r.getByteLength()} received`,
			)
		}

		switch (t as Id) {
			case Id.Subscribe:
				return Msg.Subscribe
			case Id.SubscribeOk:
				return Msg.SubscribeOk
			case Id.SubscribeDone:
				return Msg.SubscribeDone
			case Id.SubscribeError:
				return Msg.SubscribeError
			case Id.Unsubscribe:
				return Msg.Unsubscribe
			case Id.Announce:
				return Msg.Announce
			case Id.AnnounceOk:
				return Msg.AnnounceOk
			case Id.AnnounceError:
				return Msg.AnnounceError
			case Id.Unannounce:
				return Msg.Unannounce
			case Id.GoAway:
				return Msg.GoAway
		}

		throw new Error(`unknown control message type: ${t}`)
	}

	async message(): Promise<Message> {
		const t = await this.msg()
		switch (t) {
			case Msg.Subscribe:
				return this.subscribe()
			case Msg.SubscribeOk:
				return this.subscribe_ok()
			case Msg.SubscribeError:
				return this.subscribe_error()
			case Msg.SubscribeDone:
				return this.subscribe_done()
			case Msg.Unsubscribe:
				return this.unsubscribe()
			case Msg.Announce:
				return this.announce()
			case Msg.AnnounceOk:
				return this.announce_ok()
			case Msg.Unannounce:
				return this.unannounce()
			case Msg.AnnounceError:
				return this.announce_error()
			case Msg.GoAway:
				throw new Error("TODO: implement go away")
		}
	}

	private async subscribe(): Promise<Subscribe> {
		return {
			kind: Msg.Subscribe,
			id: await this.r.u62(),
			trackId: await this.r.u62(),
			namespace: await this.r.tuple(),
			name: await this.r.string(),
			subscriber_priority: await this.r.u8(),
			group_order: await this.decodeGroupOrder(),
			location: await this.location(),
			params: await this.parameters(),
		}
	}

	private async decodeGroupOrder(): Promise<GroupOrder> {
		const orderCode = await this.r.u8()
		switch (orderCode) {
			case 0:
				return GroupOrder.Publisher
			case 1:
				return GroupOrder.Ascending
			case 2:
				return GroupOrder.Descending
			default:
				throw new Error(`Invalid GroupOrder value: ${orderCode}`)
		}
	}

	private async location(): Promise<Location> {
		const mode = await this.r.u62()
		if (mode == 1n) {
			return {
				mode: "latest_group",
			}
		} else if (mode == 2n) {
			return {
				mode: "latest_object",
			}
		} else if (mode == 3n) {
			return {
				mode: "absolute_start",
				start_group: await this.r.u53(),
				start_object: await this.r.u53(),
			}
		} else if (mode == 4n) {
			return {
				mode: "absolute_range",
				start_group: await this.r.u53(),
				start_object: await this.r.u53(),
				end_group: await this.r.u53(),
				end_object: await this.r.u53(),
			}
		} else {
			throw new Error(`invalid filter type: ${mode}`)
		}
	}

	private async parameters(): Promise<Parameters | undefined> {
		const count = await this.r.u53()
		if (count == 0) return undefined

		const params = new Map<bigint, Uint8Array>()

		for (let i = 0; i < count; i++) {
			const id = await this.r.u62()
			const size = await this.r.u53()
			const value = await this.r.read(size)

			if (params.has(id)) {
				throw new Error(`duplicate parameter id: ${id}`)
			}

			params.set(id, value)
		}

		return params
	}

	private async subscribe_ok(): Promise<SubscribeOk> {
		const id = await this.r.u62()
		const expires = await this.r.u62()

		const group_order = await this.decodeGroupOrder()
		let latest: [number, number] | undefined

		const flag = await this.r.u8()
		if (flag === 1) {
			//       [largest group id,   largest object id]
			latest = [await this.r.u53(), await this.r.u53()]
		} else if (flag !== 0) {
			throw new Error(`invalid final flag: ${flag}`)
		}
		// @todo: actually consume params once we implement them in moq-rs
		const params = await this.parameters()
		return {
			kind: Msg.SubscribeOk,
			id,
			expires,
			group_order,
			latest,
			params,
		}
	}

	private async subscribe_done(): Promise<SubscribeDone> {
		const id = await this.r.u62()
		const code = await this.r.u62()
		const reason = await this.r.string()

		let final: [number, number] | undefined

		const flag = await this.r.u8()
		if (flag === 1) {
			final = [await this.r.u53(), await this.r.u53()]
		} else if (flag !== 0) {
			throw new Error(`invalid final flag: ${flag}`)
		}

		return {
			kind: Msg.SubscribeDone,
			id,
			code,
			reason,
			final,
		}
	}

	private async subscribe_error(): Promise<SubscribeError> {
		return {
			kind: Msg.SubscribeError,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async unsubscribe(): Promise<Unsubscribe> {
		return {
			kind: Msg.Unsubscribe,
			id: await this.r.u62(),
		}
	}

	private async announce(): Promise<Announce> {
		const namespace = await this.r.tuple()

		return {
			kind: Msg.Announce,
			namespace,
			params: await this.parameters(),
		}
	}

	private async announce_ok(): Promise<AnnounceOk> {
		return {
			kind: Msg.AnnounceOk,
			namespace: await this.r.tuple(),
		}
	}

	private async announce_error(): Promise<AnnounceError> {
		return {
			kind: Msg.AnnounceError,
			namespace: await this.r.tuple(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async unannounce(): Promise<Unannounce> {
		return {
			kind: Msg.Unannounce,
			namespace: await this.r.tuple(),
		}
	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	async message(m: Message) {
		switch (m.kind) {
			case Msg.Subscribe:
				return this.subscribe(m)
			case Msg.SubscribeOk:
				return this.subscribe_ok(m)
			case Msg.SubscribeError:
				return this.subscribe_error(m)
			case Msg.SubscribeDone:
				return this.subscribe_done(m)
			case Msg.Unsubscribe:
				return this.unsubscribe(m)
			case Msg.Announce:
				return this.announce(m)
			case Msg.AnnounceOk:
				return this.announce_ok(m)
			case Msg.AnnounceError:
				return this.announce_error(m)
			case Msg.Unannounce:
				return this.unannounce(m)
		}
	}

	async subscribe(s: Subscribe) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.trackId),
			this.w.encodeTuple(buffer, s.namespace),
			this.w.encodeString(buffer, s.name),
			this.w.setUint8(buffer, s.subscriber_priority ?? 127),
			this.w.setUint8(buffer, s.group_order ?? GroupOrder.Publisher),
			this.encodeLocation(buffer, s.location),
			this.encodeParameters(buffer, s.params),
		])

		const messageType = this.w.setVint53(buffer, Id.Subscribe)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async subscribe_ok(s: SubscribeOk) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.expires),
			this.w.setUint8(buffer, s.group_order),
			this.w.setUint8(buffer, s.latest !== undefined ? 1 : 0),
			s.latest && this.w.setVint53(buffer, s.latest[0]),
			s.latest && this.w.setVint53(buffer, s.latest[1]),
			this.encodeParameters(buffer, s.params),
		])

		const messageType = this.w.setVint53(buffer, Id.SubscribeOk)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async subscribe_done(s: SubscribeDone) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.code),
			this.w.encodeString(buffer, s.reason),
			this.w.setUint8(buffer, s.final !== undefined ? 1 : 0),
			s.final && this.w.setVint53(buffer, s.final[0]),
			s.final && this.w.setVint53(buffer, s.final[1]),
		])

		const messageType = this.w.setVint53(buffer, Id.SubscribeDone)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async subscribe_error(s: SubscribeError) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.code),
			this.w.encodeString(buffer, s.reason),
			//@todo: add trackAlias if error code is 'Retry Track Alias'
		])

		const messageType = this.w.setVint53(buffer, Id.SubscribeError)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async unsubscribe(s: Unsubscribe) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.setVint62(buffer, s.id)])

		const messageType = this.w.setVint53(buffer, Id.Unsubscribe)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async announce(a: Announce) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.encodeTuple(buffer, a.namespace),
			this.encodeParameters(buffer, a.params),
		])

		const messageType = this.w.setVint53(buffer, Id.Announce)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async announce_ok(a: AnnounceOk) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.encodeTuple(buffer, a.namespace)])

		const messageType = this.w.setVint53(buffer, Id.AnnounceOk)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async announce_error(a: AnnounceError) {
		const buffer = new Uint8Array(8)
		const msgData = this.w.concatBuffer([
			this.w.encodeTuple(buffer, a.namespace),
			this.w.setVint62(buffer, a.code),
			this.w.encodeString(buffer, a.reason),
		])

		const messageType = this.w.setVint53(buffer, Id.AnnounceError)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async unannounce(a: Unannounce) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.encodeTuple(buffer, a.namespace)])

		const messageType = this.w.setVint53(buffer, Id.Unannounce)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	private encodeLocation(buffer: Uint8Array, l: Location): Uint8Array {
		switch (l.mode) {
			case "latest_group":
				return this.w.setVint62(buffer, 1n)
			case "latest_object":
				return this.w.setVint62(buffer, 2n)
			case "absolute_start":
				return this.w.concatBuffer([
					this.w.setVint62(buffer, 3n),
					this.w.setVint53(buffer, l.start_group),
					this.w.setVint53(buffer, l.start_object),
				])
			case "absolute_range":
				return this.w.concatBuffer([
					this.w.setVint62(buffer, 3n),
					this.w.setVint53(buffer, l.start_group),
					this.w.setVint53(buffer, l.start_object),
					this.w.setVint53(buffer, l.end_group),
					this.w.setVint53(buffer, l.end_object),
				])
		}
	}

	private encodeParameters(buffer: Uint8Array, p: Parameters | undefined): Uint8Array {
		if (!p) return this.w.setUint8(buffer, 0)

		const paramFields = [this.w.setVint53(buffer, p.size)]
		for (const [id, value] of p) {
			const idBytes = this.w.setVint62(buffer, id)
			const sizeBytes = this.w.setVint53(buffer, value.length)
			paramFields.push(idBytes, sizeBytes, value)
		}

		return this.w.concatBuffer(paramFields)
	}
}
