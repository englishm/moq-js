import { ControlMessageType, Version } from "."
import { Parameters } from "../base_data"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"

export interface ClientSetup {
	params: Parameters
}

export namespace ClientSetup {
	export function serialize(v: ClientSetup): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.ClientSetup)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		// Draft-16: Number of Parameters + delta-encoded parameters only
		const paramsBytes = Parameters.serialize(v.params)
		payloadBuf.putVarInt(v.params.size)
		payloadBuf.putBytes(paramsBytes)
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): ClientSetup {
		// Draft-16: Number of Parameters + parameters
		const numParams = reader.getNumberVarInt()
		const params = Parameters.deserialize_with_count(reader, numParams)
		return {
			params,
		}
	}
}
