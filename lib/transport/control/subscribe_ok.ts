import { ControlMessageType } from "."
import { GroupOrder } from "./subscribe"
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
		const paramsBytes = Parameters.serialize(v.params)
		payloadBuf.putVarInt(v.params.size) // Number of Parameters
		payloadBuf.putBytes(paramsBytes)
		// Draft-16: Track Extensions (length-prefixed KVP block)
		if (v.track_extensions && v.track_extensions.size > 0) {
			const extBytes = KeyValuePairs.serialize(v.track_extensions)
			payloadBuf.putVarInt(extBytes.length)
			payloadBuf.putBytes(extBytes)
		} else {
			payloadBuf.putVarInt(0) // empty track extensions
		}

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): SubscribeOk {
		const id = reader.getVarInt()
		const track_alias = reader.getVarInt()
		const numParams = reader.getNumberVarInt()
		const params = Parameters.deserialize_with_count(reader, numParams)
		// Draft-16: Track Extensions
		let track_extensions: KeyValuePairs | undefined
		if (reader.remaining > 0) {
			const extLength = reader.getNumberVarInt()
			if (extLength > 0) {
				const extData = reader.getBytes(extLength)
				track_extensions = KeyValuePairs.deserialize(new ImmutableBytesBuffer(extData))
			}
		}
		return {
			id,
			track_alias,
			params,
			track_extensions,
		}
	}
}
