import { ImmutableBytesBuffer, MutableBytesBuffer, Reader, Writer } from "./buffer"
import { KeyValuePairs } from "./base_data"
import { Status } from "./objects"
import { getLogger } from "../common/logger"

const log = getLogger()

export interface SubgroupHeader {
	type: SubgroupType
	track_alias: bigint
	group_id: number
	subgroup_id?: number
	publisher_priority: number
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
		buf.putU8(header.publisher_priority)
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
	export function serialize(obj: SubgroupObject): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(obj.object_id)

		if (obj.extension_headers) {
			buf.putBytes(KeyValuePairs.serialize(obj.extension_headers))
		}
		buf.putVarInt(obj.object_payload?.length ?? 0)
		if (!obj.object_payload) {
			buf.putVarInt(obj.status!)
		} else {
			buf.putBytes(obj.object_payload)
		}
		return buf.Uint8Array
	}
}

export enum SubgroupType {
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
}

export namespace SubgroupType {
	export function serialize(type: SubgroupType): Uint8Array {
		const w = new MutableBytesBuffer(new Uint8Array())
		w.putVarInt(type)
		return w.Uint8Array
	}
	export function deserialize(reader: ImmutableBytesBuffer): SubgroupType {
		return try_from(reader.getNumberVarInt())
	}

	// may throw if invalid value if provided
	export function try_from(value: number | bigint): SubgroupType {
		const v = typeof value === "bigint" ? Number(value) : value

		switch (v) {
			case SubgroupType.Type0x10:
			case SubgroupType.Type0x11:
			case SubgroupType.Type0x12:
			case SubgroupType.Type0x13:
			case SubgroupType.Type0x14:
			case SubgroupType.Type0x15:
			case SubgroupType.Type0x18:
			case SubgroupType.Type0x19:
			case SubgroupType.Type0x1A:
			case SubgroupType.Type0x1B:
			case SubgroupType.Type0x1C:
			case SubgroupType.Type0x1D:
				return v as SubgroupType
			default:
				throw new Error(`invalid subgroup type: ${v}`)
		}
	}

	export function isSubgroupIdPresent(type: SubgroupType) {
		switch (type) {
			case SubgroupType.Type0x14:
			case SubgroupType.Type0x15:
			case SubgroupType.Type0x1C:
			case SubgroupType.Type0x1D:
				return true
			default:
				return false
		}
	}

	export function hasExplicitSubgroupId(type: SubgroupType) {
		return isSubgroupIdPresent(type)
	}

	export function isSubgroupIdZero(type: SubgroupType) {
		switch (type) {
			case SubgroupType.Type0x10:
			case SubgroupType.Type0x11:
			case SubgroupType.Type0x18:
			case SubgroupType.Type0x19:
				return true
			default:
				return false
		}
	}

	export function isSubgroupFirstObjectId(type: SubgroupType) {
		return !(hasExplicitSubgroupId(type) || isSubgroupIdZero(type))
	}

	export function isExtensionPresent(type: SubgroupType) {
		switch (type) {
			case SubgroupType.Type0x11:
			case SubgroupType.Type0x13:
			case SubgroupType.Type0x15:
			case SubgroupType.Type0x19:
			case SubgroupType.Type0x1B:
			case SubgroupType.Type0x1D:
				return true
			default:
				return false
		}
	}

	export function contains_end_of_group(type: SubgroupType) {
		switch (type) {
			case SubgroupType.Type0x18:
			case SubgroupType.Type0x19:
			case SubgroupType.Type0x1A:
			case SubgroupType.Type0x1B:
			case SubgroupType.Type0x1C:
			case SubgroupType.Type0x1D:
				return true
			default:
				return false
		}
	}
}

export class SubgroupWriter {
	constructor(
		public header: SubgroupHeader,
		public stream: Writer,
	) {}

	async write(c: SubgroupObject) {
		return this.stream.write(SubgroupObject.serialize(c))
	}

	async close() {
		return this.stream.close()
	}
}
export class SubgroupReader {
	constructor(
		public header: SubgroupHeader,
		public stream: Reader,
	) {}

	async read(): Promise<SubgroupObject | undefined> {
		if (await this.stream.done()) {
			return
		}

		const object_id = await this.stream.getNumberVarInt()

		let extHeaders: KeyValuePairs | undefined
		if (SubgroupType.isExtensionPresent(this.header.type)) {
			extHeaders = await KeyValuePairs.deserialize_with_reader(this.stream)
		}

		log.trace("subgroup header", object_id, extHeaders)

		let obj_payload_len = await this.stream.getNumberVarInt()

		let object_payload: Uint8Array | undefined
		let status: Status | undefined

		log.trace("subgroup read", object_id, obj_payload_len)

		if (obj_payload_len == 0) {
			status = Status.try_from(await this.stream.getNumberVarInt())
		} else {
			object_payload = await this.stream.read(obj_payload_len)
		}

		log.trace("subgroup read success", object_id, status)
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
