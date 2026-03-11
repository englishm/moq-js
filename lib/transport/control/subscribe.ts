import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple, Parameters } from "../base_data"

export enum GroupOrder {
	Publisher = 0x0,
	Ascending = 0x1,
	Descending = 0x2,
}

export namespace GroupOrder {
	export function serialize(v: GroupOrder): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putU8(v)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): GroupOrder {
		const order = buffer.getU8()
		switch (order) {
			case 0:
				return GroupOrder.Publisher
			case 1:
				return GroupOrder.Ascending
			case 2:
				return GroupOrder.Descending
			default:
				throw new Error(`Invalid GroupOrder value: ${order}`)
		}
	}
}

export enum FilterType {
	NextGroupStart = 0x1,
	LargestObject = 0x2,
	AbsoluteStart = 0x3,
	AbsoluteRange = 0x4,
}

export namespace FilterType {
	export function serialize(v: FilterType): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(v)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): FilterType {
		const order = buffer.getVarInt()
		switch (order) {
			case 1n:
				return FilterType.NextGroupStart
			case 2n:
				return FilterType.LargestObject
			case 3n:
				return FilterType.AbsoluteStart
			case 4n:
				return FilterType.AbsoluteRange
			default:
				throw new Error(`Invalid FilterType value: ${order}`)
		}
	}
}

export interface Subscribe {
	id: bigint // Request ID
	namespace: Tuple
	name: string
	params: Parameters
}

export namespace Subscribe {
	export function serialize(v: Subscribe): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.Subscribe)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putBytes(Tuple.serialize(v.namespace))
		payloadBuf.putUtf8String(v.name)
		// Draft-16: inline parameters moved to Parameters KVP
		const paramsBytes = Parameters.serialize(v.params)
		payloadBuf.putVarInt(v.params.size) // Number of Parameters
		payloadBuf.putBytes(paramsBytes)

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): Subscribe {
		const id = reader.getVarInt()
		const namespace = Tuple.deserialize(reader)
		const name = reader.getUtf8String()
		const numParams = reader.getNumberVarInt()
		const params = Parameters.deserialize_with_count(reader, numParams)
		return {
			id,
			namespace,
			name,
			params,
		}
	}
}
