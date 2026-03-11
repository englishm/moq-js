import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple, Parameters, KeyValuePairs } from "../base_data"

export enum SubscribeOptions {
	PUBLISH = 0x00,
	NAMESPACE = 0x01,
	BOTH = 0x02,
}

export interface SubscribeNamespace {
	id: bigint
	namespace: string[]
	subscribe_options: SubscribeOptions
	params?: Parameters
}

export namespace SubscribeNamespace {
	export function serialize(v: SubscribeNamespace): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.SubscribeNamespace)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putBytes(Tuple.serialize(v.namespace))
		payloadBuf.putVarInt(v.subscribe_options)
		payloadBuf.putBytes(KeyValuePairs.serialize(v.params ?? new Map()))
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): SubscribeNamespace {
		const id = reader.getVarInt()
		const namespace = Tuple.deserialize(reader)
		const subscribe_options = reader.getNumberVarInt() as SubscribeOptions
		let params: Parameters | undefined
		if (reader.remaining > 0) {
			params = KeyValuePairs.deserialize(reader)
		}
		return {
			id,
			namespace,
			subscribe_options,
			params,
		}
	}
}
