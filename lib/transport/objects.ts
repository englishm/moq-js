import { SubgroupHeader, SubgroupReader, SubgroupType, SubgroupWriter } from "./subgroup"
import { ExtensionHeaders, KeyValuePairs } from "./base_data"
import { Status } from "./object_status"
import { getLogger } from "../common/logger"
import {
	ImmutableBytesBuffer,
	MutableBytesBuffer,
	ReadableStreamBuffer,
	Reader,
	WritableStreamBuffer,
	Writer,
} from "./buffer"

export { Status } from "./object_status"

const log = getLogger()

export enum ObjectForwardingPreference {
	Datagram = "Datagram",
	Subgroup = "Subgroup",
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
	// Datagram types have bit 4 NOT set; subgroup types have bit 4 SET
	return (obj.type & 0x10) === 0
}

// Draft-16: Object Datagram types use bitmask structure 0b00X0XXXX
// Valid ranges: 0x00..0x0F, 0x20..0x2F
// Bit layout:
//   bit 0 (0x01) = EXTENSIONS
//   bit 1 (0x02) = END_OF_GROUP
//   bit 2 (0x04) = ZERO_OBJECT_ID (when set, Object ID omitted, implied 0)
//   bit 3 (0x08) = DEFAULT_PRIORITY (when set, priority field omitted)
//   bit 5 (0x20) = STATUS (when set, Object Status present instead of payload)
// Invalid combinations: STATUS + END_OF_GROUP (0x22,0x23,0x26,0x27,0x2A,0x2B,0x2E,0x2F)
export enum ObjectDatagramType {
	Type0x0 = 0x0,
	Type0x1 = 0x1,
	Type0x2 = 0x2,
	Type0x3 = 0x3,
	Type0x4 = 0x4,
	Type0x5 = 0x5,
	Type0x6 = 0x6,
	Type0x7 = 0x7,
	Type0x8 = 0x8,
	Type0x9 = 0x9,
	Type0xA = 0xa,
	Type0xB = 0xb,
	Type0xC = 0xc,
	Type0xD = 0xd,
	Type0xE = 0xe,
	Type0xF = 0xf,
	Type0x20 = 0x20,
	Type0x21 = 0x21,
	Type0x24 = 0x24,
	Type0x25 = 0x25,
	Type0x28 = 0x28,
	Type0x29 = 0x29,
	Type0x2C = 0x2c,
	Type0x2D = 0x2d,
}

export namespace ObjectDatagramType {
	// Bitmask constants
	const EXTENSIONS_BIT = 0x01
	const END_OF_GROUP_BIT = 0x02
	const ZERO_OBJECT_ID_BIT = 0x04
	const DEFAULT_PRIORITY_BIT = 0x08
	const STATUS_BIT = 0x20

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

		// Must match form 0b00X0XXXX (bit 4 NOT set)
		if ((v & 0x10) !== 0) {
			throw new Error(`invalid object datagram type: ${v} (bit 4 set - this is a subgroup type)`)
		}
		// Must be in ranges 0x00..0x0F or 0x20..0x2F
		if (v < 0x00 || (v > 0x0f && v < 0x20) || v > 0x2f) {
			throw new Error(`invalid object datagram type: ${v} (out of range)`)
		}
		// STATUS + END_OF_GROUP is invalid
		if ((v & STATUS_BIT) !== 0 && (v & END_OF_GROUP_BIT) !== 0) {
			throw new Error(`invalid object datagram type: ${v} (STATUS + END_OF_GROUP combination)`)
		}
		return v as ObjectDatagramType
	}

	export function isEndOfGroup(type: ObjectDatagramType) {
		return (type & END_OF_GROUP_BIT) !== 0
	}

	export function hasExtensions(type: ObjectDatagramType) {
		return (type & EXTENSIONS_BIT) !== 0
	}

	export function hasObjectId(type: ObjectDatagramType) {
		// When ZERO_OBJECT_ID bit is set, Object ID is omitted (implied 0)
		return (type & ZERO_OBJECT_ID_BIT) === 0
	}

	export function hasDefaultPriority(type: ObjectDatagramType) {
		return (type & DEFAULT_PRIORITY_BIT) !== 0
	}

	export function hasStatus(type: ObjectDatagramType) {
		return (type & STATUS_BIT) !== 0
	}
}

export interface ObjectDatagram {
	type: ObjectDatagramType
	track_alias: bigint
	group_id: number
	object_id?: number
	publisher_priority?: number // undefined when DEFAULT_PRIORITY bit is set
	extension_headers?: KeyValuePairs
	status?: Status
	object_payload?: Uint8Array
}

export namespace ObjectDatagram {
	export function serialize(obj: ObjectDatagram): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putBytes(ObjectDatagramType.serialize(obj.type))
		buf.putVarInt(obj.track_alias)
		buf.putVarInt(obj.group_id)
		if (ObjectDatagramType.hasObjectId(obj.type) && obj.object_id !== undefined) {
			buf.putVarInt(obj.object_id)
		}
		if (!ObjectDatagramType.hasDefaultPriority(obj.type) && obj.publisher_priority !== undefined) {
			buf.putU8(obj.publisher_priority)
		}
		const hasExtensions = ObjectDatagramType.hasExtensions(obj.type)
		if (hasExtensions) {
			const extensionHeaders = obj.extension_headers ?? new Map()
			if (
				ObjectDatagramType.hasStatus(obj.type) &&
				obj.status !== undefined &&
				obj.status !== Status.NORMAL &&
				extensionHeaders.size > 0
			) {
				throw new Error("non-normal object status cannot include extensions")
			}
			buf.putBytes(ExtensionHeaders.serialize(extensionHeaders, false))
		}
		if (ObjectDatagramType.hasStatus(obj.type)) {
			if (obj.status !== undefined) {
				buf.putVarInt(obj.status)
			}
		} else {
			if (obj.object_payload) {
				buf.putBytes(obj.object_payload)
			}
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
		let publisher_priority: number | undefined
		if (!ObjectDatagramType.hasDefaultPriority(type)) {
			publisher_priority = reader.getU8()
		}
		let extHeaders: KeyValuePairs | undefined
		if (ObjectDatagramType.hasExtensions(type)) {
			extHeaders = ExtensionHeaders.deserialize(reader, false)
		}
		let status: Status | undefined
		let payload: Uint8Array | undefined
		if (ObjectDatagramType.hasStatus(type)) {
			status = Status.try_from(reader.getNumberVarInt())
			if (status !== Status.NORMAL && extHeaders && extHeaders.size > 0) {
				throw new Error("non-normal object status cannot include extensions")
			}
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

			let publisher_priority: number | undefined
			if (!SubgroupType.hasDefaultPriority(subgroupType)) {
				publisher_priority = await r.getU8()
			}

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
		let publisher_priority: number | undefined
		if (!ObjectDatagramType.hasDefaultPriority(type)) {
			publisher_priority = await this.stream.getU8()
		}
		let extHeaders: KeyValuePairs | undefined
		if (ObjectDatagramType.hasExtensions(type)) {
			const extHeadersBytesLength = await this.stream.getNumberVarInt()
			const extHeadersData = await this.stream.read(extHeadersBytesLength)
			extHeaders = KeyValuePairs.deserialize(new ImmutableBytesBuffer(extHeadersData))
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
