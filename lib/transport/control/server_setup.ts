import { ControlMessageType, Version } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters } from "../base_data"

export interface ServerSetup {
	params: Parameters
}

export namespace ServerSetup {
	export function serialize(v: ServerSetup): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.ServerSetup)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		const paramsBytes = Parameters.serialize(v.params)
		payloadBuf.putVarInt(v.params.size)
		payloadBuf.putBytes(paramsBytes)

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): ServerSetup {
		const numParams = reader.getNumberVarInt()
		const params = Parameters.deserialize_with_count(reader, numParams)
		return {
			params,
		}
	}
}
