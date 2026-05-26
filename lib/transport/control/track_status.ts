import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple, Parameters } from "../base_data"

export interface TrackStatus {
	id: bigint
	namespace: Tuple<string>
	name: string
	params: Parameters
}

export namespace TrackStatus {
	export function serialize(v: TrackStatus): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.TrackStatus)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putBytes(Tuple.serialize(v.namespace))
		payloadBuf.putUtf8String(v.name)
		payloadBuf.putBytes(Parameters.serialize(v.params))
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): TrackStatus {
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
