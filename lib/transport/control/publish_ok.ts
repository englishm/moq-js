import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters } from "../base_data"

export interface PublishOk {
	id: bigint // Request ID
	params?: Parameters
}
export namespace PublishOk {
	export function serialize(v: PublishOk): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.PublishOk)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		const params = v.params ?? new Map()
		payloadBuf.putBytes(Parameters.serialize(params))

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): PublishOk {
		const id = reader.getVarInt()
		const numParams = reader.getNumberVarInt()
		let params: Parameters | undefined
		if (numParams > 0) {
			params = Parameters.deserialize_with_count(reader, Number(numParams))
		}
		return {
			id,
			params,
		}
	}
}
