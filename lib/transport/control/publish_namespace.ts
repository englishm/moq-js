import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Tuple, KeyValuePairs } from "../base_data"

export interface PublishNamespace {
	id: bigint
	namespace: Tuple<string>
	params?: Parameters
}

export namespace PublishNamespace {
	export function serialize(v: PublishNamespace): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.PublishNamespace)

		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putBytes(Tuple.serialize(v.namespace))
		// Draft-16: Number of Parameters + delta-encoded parameters
		const params = v.params ?? new Map()
		const paramsBytes = KeyValuePairs.serialize(params)
		payloadBuf.putVarInt(params.size)
		payloadBuf.putBytes(paramsBytes)

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): PublishNamespace {
		const id = reader.getVarInt()
		const namespace = Tuple.deserialize(reader)
		const numParams = reader.getNumberVarInt()
		const params = Parameters.deserialize_with_count(reader, numParams)
		return {
			id,
			namespace,
			params,
		}
	}
}
