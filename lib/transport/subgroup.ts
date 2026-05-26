import { ImmutableBytesBuffer, MutableBytesBuffer, Reader, Writer } from "./buffer"
import { ExtensionHeaders, KeyValuePairs } from "./base_data"
import { Status } from "./object_status"

export interface SubgroupHeader {
	type: SubgroupType
	track_alias: bigint
	group_id: number
	subgroup_id?: number
	publisher_priority?: number // undefined when DEFAULT_PRIORITY bit is set
}

export namespace SubgroupHeader {
	export function serialize(header: SubgroupHeader): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putBytes(SubgroupType.serialize(header.type))
		buf.putVarInt(header.track_alias)
		buf.putVarInt(header.group_id)
		if (SubgroupType.hasExplicitSubgroupId(header.type) && header.subgroup_id !== undefined) {
			buf.putVarInt(header.subgroup_id)
		}
		if (!SubgroupType.hasDefaultPriority(header.type) && header.publisher_priority !== undefined) {
			buf.putU8(header.publisher_priority)
		}
		return buf.Uint8Array
	}
}

export interface SubgroupObject {
	object_id: number
	extension_headers?: KeyValuePairs
	status?: Status // only if payload is null
	object_payload?: Uint8Array
}

export namespace SubgroupObject {
	export function serialize(
		obj: SubgroupObject,
		object_id_delta = obj.object_id,
		extensionsPresent = !!obj.extension_headers,
	): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(object_id_delta)

		if (extensionsPresent) {
			buf.putBytes(ExtensionHeaders.serialize(obj.extension_headers ?? new Map()))
		}

		const payload = obj.object_payload
		const payloadLength = payload?.length ?? 0
		if (payloadLength > 0 && obj.status !== undefined && obj.status !== Status.NORMAL) {
			throw new Error("non-normal object status requires an empty payload")
		}

		buf.putVarInt(payloadLength)
		if (payloadLength === 0) {
			buf.putVarInt(obj.status ?? Status.NORMAL)
		} else {
			buf.putBytes(payload!)
		}
		return buf.Uint8Array
	}
}

// Draft-16: Subgroup header types use bitmask structure 0b00X1XXXX
// Valid ranges: 0x10..0x15, 0x18..0x1D, 0x30..0x35, 0x38..0x3D
// Bit layout:
//   bit 0 (0x01) = EXTENSIONS
//   bits 1-2 (0x06) = SUBGROUP_ID_MODE (00=zero, 01=first obj, 10=present, 11=RESERVED)
//   bit 3 (0x08) = END_OF_GROUP
//   bit 4 (0x10) = always set (stream type marker)
//   bit 5 (0x20) = DEFAULT_PRIORITY (when set, priority field omitted)
export enum SubgroupType {
	// Base types (0x10..0x1D)
	Type0x10 = 0x10,
	Type0x11 = 0x11,
	Type0x12 = 0x12,
	Type0x13 = 0x13,
	Type0x14 = 0x14,
	Type0x15 = 0x15,
	Type0x18 = 0x18,
	Type0x19 = 0x19,
	Type0x1A = 0x1a,
	Type0x1B = 0x1b,
	Type0x1C = 0x1c,
	Type0x1D = 0x1d,
	// DEFAULT_PRIORITY types (0x30..0x3D)
	Type0x30 = 0x30,
	Type0x31 = 0x31,
	Type0x32 = 0x32,
	Type0x33 = 0x33,
	Type0x34 = 0x34,
	Type0x35 = 0x35,
	Type0x38 = 0x38,
	Type0x39 = 0x39,
	Type0x3A = 0x3a,
	Type0x3B = 0x3b,
	Type0x3C = 0x3c,
	Type0x3D = 0x3d,
}

export namespace SubgroupType {
	// Bitmask constants
	const EXTENSIONS_BIT = 0x01
	const SUBGROUP_ID_MASK = 0x06
	const END_OF_GROUP_BIT = 0x08
	const DEFAULT_PRIORITY_BIT = 0x20

	export function serialize(type: SubgroupType): Uint8Array {
		const w = new MutableBytesBuffer(new Uint8Array())
		w.putVarInt(type)
		return w.Uint8Array
	}
	export function deserialize(reader: ImmutableBytesBuffer): SubgroupType {
		return try_from(reader.getNumberVarInt())
	}

	// may throw if invalid value is provided
	export function try_from(value: number | bigint): SubgroupType {
		const v = typeof value === "bigint" ? Number(value) : value

		// Must match form 0b00X1XXXX (bit 4 set)
		if ((v & 0x10) === 0) {
			throw new Error(`invalid subgroup type: ${v} (bit 4 not set)`)
		}
		// Must be in ranges 0x10..0x1F or 0x30..0x3F
		if (v < 0x10 || (v > 0x1f && v < 0x30) || v > 0x3f) {
			throw new Error(`invalid subgroup type: ${v} (out of range)`)
		}
		// SUBGROUP_ID_MODE = 0b11 is reserved
		if ((v & SUBGROUP_ID_MASK) >> 1 === 3) {
			throw new Error(`invalid subgroup type: ${v} (reserved SUBGROUP_ID_MODE=0b11)`)
		}
		return v as SubgroupType
	}

	export function isSubgroupIdPresent(type: SubgroupType) {
		return (type & SUBGROUP_ID_MASK) >> 1 === 2
	}

	export function hasExplicitSubgroupId(type: SubgroupType) {
		return isSubgroupIdPresent(type)
	}

	export function isSubgroupIdZero(type: SubgroupType) {
		return (type & SUBGROUP_ID_MASK) >> 1 === 0
	}

	export function isSubgroupFirstObjectId(type: SubgroupType) {
		return (type & SUBGROUP_ID_MASK) >> 1 === 1
	}

	export function isExtensionPresent(type: SubgroupType) {
		return (type & EXTENSIONS_BIT) !== 0
	}

	export function contains_end_of_group(type: SubgroupType) {
		return (type & END_OF_GROUP_BIT) !== 0
	}

	export function hasDefaultPriority(type: SubgroupType) {
		return (type & DEFAULT_PRIORITY_BIT) !== 0
	}
}

export class SubgroupWriter {
	#lastObjectId?: number

	constructor(
		public header: SubgroupHeader,
		public stream: Writer,
	) {}

	async write(c: SubgroupObject) {
		const object_id_delta = this.#lastObjectId === undefined ? c.object_id : c.object_id - this.#lastObjectId - 1
		if (object_id_delta < 0) {
			throw new Error("object IDs must be monotonically increasing")
		}
		const extensionsPresent = SubgroupType.isExtensionPresent(this.header.type)
		if (!extensionsPresent && c.extension_headers && c.extension_headers.size > 0) {
			throw new Error("subgroup type does not include object extensions")
		}
		if (c.status !== undefined && c.status !== Status.NORMAL && c.extension_headers && c.extension_headers.size > 0) {
			throw new Error("non-normal object status cannot include extensions")
		}

		await this.stream.write(SubgroupObject.serialize(c, object_id_delta, extensionsPresent))
		this.#lastObjectId = c.object_id
	}

	async close() {
		return this.stream.close()
	}
}
export class SubgroupReader {
	#lastObjectId?: number

	constructor(
		public header: SubgroupHeader,
		public stream: Reader,
	) {}

	async read(): Promise<SubgroupObject | undefined> {
		if (await this.stream.done()) {
			return
		}

		const object_id_delta = await this.stream.getNumberVarInt()
		const lastObjectId = this.#lastObjectId
		const firstObject = lastObjectId === undefined
		const object_id = firstObject ? object_id_delta : lastObjectId + object_id_delta + 1
		this.#lastObjectId = object_id
		if (firstObject && SubgroupType.isSubgroupFirstObjectId(this.header.type)) {
			this.header.subgroup_id = object_id
		}

		let extHeaders: KeyValuePairs | undefined
		if (SubgroupType.isExtensionPresent(this.header.type)) {
			const extHeadersBytesLength = await this.stream.getNumberVarInt()
			const extHeadersData = await this.stream.read(extHeadersBytesLength)
			extHeaders = KeyValuePairs.deserialize(new ImmutableBytesBuffer(extHeadersData))
		}

		let obj_payload_len = await this.stream.getNumberVarInt()

		let object_payload: Uint8Array | undefined
		let status: Status | undefined

		if (obj_payload_len == 0) {
			status = Status.try_from(await this.stream.getNumberVarInt())
			if (status !== Status.NORMAL && extHeaders && extHeaders.size > 0) {
				throw new Error("non-normal object status cannot include extensions")
			}
		} else {
			object_payload = await this.stream.read(obj_payload_len)
		}

		return {
			object_id,
			status,
			extension_headers: extHeaders,
			object_payload,
		}
	}

	async close() {
		await this.stream.close()
	}
}
