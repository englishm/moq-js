import { SubgroupHeader, SubgroupReader, SubgroupType, SubgroupWriter } from "./subgroup"
import { KeyValuePairs } from "./base_data"
import { debug } from "./utils"
import {
	ImmutableBytesBuffer,
	MutableBytesBuffer,
	ReadableStreamBuffer,
	Reader,
	WritableStreamBuffer,
	Writer,
} from "./buffer"
import { getLogger } from "../common/logger"

const log = getLogger()

export enum ObjectForwardingPreference {
	Datagram = "Datagram",
	Subgroup = "Subgroup",
}

export enum Status {
	NORMAL = 0,
	OBJECT_NULL = 1,
	GROUP_END = 3,
	TRACK_END = 4,
}

export namespace Status {
	export function serialize(status: Status): Uint8Array {
		const w = new MutableBytesBuffer(new Uint8Array())
		w.putVarInt(status)
		return w.Uint8Array
	}
	export function deserialize(reader: ImmutableBytesBuffer): Status {
		return try_from(reader.getNumberVarInt())
	}
	export function try_from(value: number | bigint) {
		const v = typeof value === "bigint" ? Number(value) : value

		switch (v) {
			case 0:
				return Status.NORMAL
			case 1:
				return Status.OBJECT_NULL
			case 3:
				return Status.GROUP_END
			case 4:
				return Status.TRACK_END
			default:
				throw new Error(`invalid object status: ${v}`)
		}
	}
}

export interface Object {
	track_namespace: string
	track_name: string
	group_id: number
	object_id: number
	publisher_priority: number
	object_forwarding_preference: ObjectForwardingPreference
	subgroup_id: number
	status: Status
	extension_headers: KeyValuePairs
	object_payload?: Uint8Array
}

export function isDatagram(obj: ObjectDatagram | SubgroupHeader): boolean {
	return obj.type in ObjectDatagramType
}

export enum ObjectDatagramType {
	Type0x0 = 0x0,
	Type0x1 = 0x1,
	Type0x2 = 0x2,
	Type0x3 = 0x3,
	Type0x4 = 0x4,
	Type0x5 = 0x5,
	Type0x6 = 0x6,
	Type0x7 = 0x7,
	Type0x20 = 0x20,
	Type0x21 = 0x21,
}

export namespace ObjectDatagramType {
	export function serialize(type: ObjectDatagramType): Uint8Array {
		const w = new MutableBytesBuffer(new Uint8Array())
		w.putVarInt(type)
		return w.Uint8Array
	}
	export function deserialize(reader: ImmutableBytesBuffer): ObjectDatagramType {
		return try_from(reader.getNumberVarInt())
	}
	export function try_from(value: number | bigint): ObjectDatagramType {
		const v = typeof value === "bigint" ? Number(value) : value

		switch (v) {
			case ObjectDatagramType.Type0x0:
			case ObjectDatagramType.Type0x1:
			case ObjectDatagramType.Type0x2:
			case ObjectDatagramType.Type0x3:
			case ObjectDatagramType.Type0x4:
			case ObjectDatagramType.Type0x5:
			case ObjectDatagramType.Type0x6:
			case ObjectDatagramType.Type0x7:
			case ObjectDatagramType.Type0x20:
			case ObjectDatagramType.Type0x21:
				return v as ObjectDatagramType
			default:
				throw new Error(`invalid object datagram type: ${v}`)
		}
	}

	export function isEndOfGroup(type: ObjectDatagramType) {
		switch (type) {
			case ObjectDatagramType.Type0x2:
			case ObjectDatagramType.Type0x3:
			case ObjectDatagramType.Type0x6:
			case ObjectDatagramType.Type0x7:
				return true
			default:
				return false
		}
	}

	export function hasExtensions(type: ObjectDatagramType) {
		switch (type) {
			case ObjectDatagramType.Type0x1:
			case ObjectDatagramType.Type0x3:
			case ObjectDatagramType.Type0x5:
			case ObjectDatagramType.Type0x7:
			case ObjectDatagramType.Type0x21:
				return true
			default:
				return false
		}
	}

	export function hasObjectId(type: ObjectDatagramType) {
		switch (type) {
			case ObjectDatagramType.Type0x4:
			case ObjectDatagramType.Type0x5:
			case ObjectDatagramType.Type0x6:
			case ObjectDatagramType.Type0x7:
				return false
			default:
				return true
		}
	}

	export function hasStatus(type: ObjectDatagramType) {
		switch (type) {
			case ObjectDatagramType.Type0x20:
			case ObjectDatagramType.Type0x21:
				return true
			default:
				return false
		}
	}
}

export interface ObjectDatagram {
	type: ObjectDatagramType
	track_alias: bigint
	group_id: number
	object_id?: number
	publisher_priority: number
	extension_headers?: KeyValuePairs
	status?: Status
	object_payload?: Uint8Array
}

export namespace ObjectDatagram {
	export function serialize(obj: ObjectDatagram): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putBytes(ObjectDatagramType.serialize(obj.type))
		buf.putVarInt(obj.group_id)
		if (obj.object_id) {
			buf.putVarInt(obj.object_id)
		}
		if (obj.object_payload) {
			buf.putVarInt(obj.object_payload.byteLength)
			buf.putBytes(obj.object_payload)
		} else {
			buf.putVarInt(0)
			buf.putVarInt(obj.status as number)
		}
		return buf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): ObjectDatagram {
		const type = reader.getNumberVarInt()
		const alias = reader.getVarInt()
		const group = reader.getNumberVarInt()
		let object_id: number | undefined
		if (ObjectDatagramType.hasObjectId(type)) {
			object_id = reader.getNumberVarInt()
		}
		const publisher_priority = reader.getU8()
		let extHeaders: KeyValuePairs | undefined
		if (ObjectDatagramType.hasExtensions(type)) {
			const extHeadersLength = reader.getNumberVarInt()
			const extHeadersData = reader.getBytes(extHeadersLength)

			extHeaders = KeyValuePairs.deserialize_with_size(new ImmutableBytesBuffer(extHeadersData), extHeadersLength)
		}
		let status: Status | undefined
		let payload: Uint8Array | undefined
		if (ObjectDatagramType.hasStatus(type)) {
			status = Status.try_from(reader.getNumberVarInt())
		} else {
			payload = reader.getBytes(reader.remaining)
		}

		return {
			group_id: group,
			object_id,
			object_payload: payload,
			status,
			type,
			track_alias: alias,
			publisher_priority,
			extension_headers: extHeaders,
		}
	}
}

export class Objects {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async send(h: ObjectDatagram | SubgroupHeader): Promise<TrackWriter | SubgroupWriter> {
		const is_datagram = isDatagram(h)

		if (is_datagram) {
			// Datagram mode
			const stream = this.quic.datagrams.writable
			const w = new WritableStreamBuffer(stream)
			return new TrackWriter(w)
		} else {
			// Subgroup stream mode
			const stream = await this.quic.createUnidirectionalStream()
			const w = new WritableStreamBuffer(stream)

			// Write subgroup header
			const subgroupHeader = h as SubgroupHeader
			await w.write(SubgroupHeader.serialize(subgroupHeader))

			return new SubgroupWriter(subgroupHeader, w)
		}
	}

	async recv(): Promise<TrackReader | SubgroupReader | undefined> {
		log.trace("waiting for incoming streams")
		const streams = this.quic.incomingUnidirectionalStreams.getReader()

		const { value, done } = await streams.read()
		log.trace("got stream", { done })
		streams.releaseLock()

		if (done) return

		const r = new ReadableStreamBuffer(value)
		const type = await r.getNumberVarInt()

		// Try to parse as SubgroupType
		try {
			const subgroupType = SubgroupType.try_from(type)
			log.trace("parsed stream type", subgroupType)

			const track_alias = await r.getVarInt()
			const group_id = await r.getNumberVarInt()

			let subgroup_id: number | undefined
			if (SubgroupType.hasExplicitSubgroupId(subgroupType)) {
				subgroup_id = await r.getNumberVarInt()
			} else if (SubgroupType.isSubgroupIdZero(subgroupType)) {
				subgroup_id = 0
			} else {
				// Subgroup ID is first object ID - will be set when reading first object
				subgroup_id = undefined
			}

			const publisher_priority = await r.getU8()

			const h: SubgroupHeader = {
				type: subgroupType,
				track_alias,
				group_id,
				subgroup_id,
				publisher_priority,
			}

			log.trace("parsed subgroup header", h)

			return new SubgroupReader(h, r)
		} catch (e) {
			// Not a subgroup type, might be datagram or other type
			log.warn("unknown stream type", type)
			throw new Error(`unknown stream type: ${type}`)
		}
	}
}

// TrackWriter is object sender over datagram
export class TrackWriter {
	// For compatibility with reader interface
	public header = { track_alias: 0n }

	constructor(public stream: Writer) {}

	async write(c: ObjectDatagram) {
		return this.stream.write(ObjectDatagram.serialize(c))
	}

	async close() {
		return this.stream.close()
	}
}

export class TrackReader {
	// Header with track_alias for routing
	public header: { track_alias: bigint }

	constructor(stream: Reader, track_alias: bigint = 0n) {
		this.stream = stream
		this.header = { track_alias }
	}

	public stream: Reader

	async read(): Promise<ObjectDatagram | undefined> {
		if (await this.stream.done()) {
			return
		}

		const type = await this.stream.getNumberVarInt()
		const alias = await this.stream.getVarInt()
		const group = await this.stream.getNumberVarInt()
		let object_id: number | undefined
		if (ObjectDatagramType.hasObjectId(type)) {
			object_id = await this.stream.getNumberVarInt()
		}
		const publisher_priority = await this.stream.getU8()
		let extHeaders: KeyValuePairs | undefined
		if (ObjectDatagramType.hasExtensions(type)) {
			extHeaders = await KeyValuePairs.deserialize_with_reader(this.stream)
		}
		let status: Status | undefined
		let payload: Uint8Array | undefined
		if (ObjectDatagramType.hasStatus(type)) {
			status = Status.try_from(await this.stream.getNumberVarInt())
		} else {
			payload = await this.stream.read(this.stream.byteLength)
		}

		return {
			group_id: group,
			object_id,
			object_payload: payload,
			status,
			type,
			track_alias: alias,
			publisher_priority,
			extension_headers: extHeaders,
		}
	}

	async close() {
		await this.stream.close()
	}
}
