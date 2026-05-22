import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, KeyValuePairs } from "../base_data"

export interface SubscribeOk {
	id: bigint // Request ID
	track_alias: bigint
	params: Parameters
	track_extensions?: KeyValuePairs
}
export namespace SubscribeOk {
	export function serialize(v: SubscribeOk): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.SubscribeOk)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putVarInt(v.track_alias)
		payloadBuf.putBytes(Parameters.serialize(v.params))
		if (v.track_extensions && v.track_extensions.size > 0) {
			payloadBuf.putBytes(KeyValuePairs.serialize(v.track_extensions))
		}

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): SubscribeOk {
		const id = reader.getVarInt()
		const track_alias = reader.getVarInt()
		const params = Parameters.deserialize(reader)
		let track_extensions: KeyValuePairs | undefined
		if (reader.remaining > 0) {
			track_extensions = KeyValuePairs.deserialize(reader)
		}
		return {
			id,
			track_alias,
			params,
			track_extensions,
		}
	}
}
