import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Location } from "../base_data"

export interface SubscribeUpdate {
	id: bigint               // Request ID (new)
	subscription_id: bigint  // Existing Request ID
	params?: Parameters
}


export namespace SubscribeUpdate {
	export function serialize(v: SubscribeUpdate): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.SubscribeUpdate)

		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putVarInt(v.subscription_id) // Existing Request ID
		const params = v.params ?? new Map()
		const paramsBytes = Parameters.serialize(params)
		payloadBuf.putVarInt(params.size) // Number of Parameters
		payloadBuf.putBytes(paramsBytes)

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): SubscribeUpdate {
		const id = reader.getVarInt()
		const subscription_id = reader.getVarInt()
		const numParams = reader.getNumberVarInt()
		const params = Parameters.deserialize_with_count(reader, numParams)
		return {
			id,
			subscription_id,
			params,
		}
	}
}
