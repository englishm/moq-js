import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Tuple, KeyValuePairs } from "../base_data"

export interface Publish {
	id: bigint
	track_alias: bigint // Publisher-specified
	namespace: Tuple<string>
	name: string
	track_extensions?: KeyValuePairs
	params?: Parameters
}

export namespace Publish {
	export function serialize(v: Publish): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.Publish)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putBytes(Tuple.serialize(v.namespace))
		payloadBuf.putUtf8String(v.name)
		payloadBuf.putVarInt(v.track_alias)
		const params = v.params ?? new Map()
		payloadBuf.putBytes(Parameters.serialize(params))
		const extensions = v.track_extensions ?? new Map()
		payloadBuf.putBytes(KeyValuePairs.serialize(extensions))

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): Publish {
		const id = reader.getVarInt()
		const namespace = Tuple.deserialize(reader)
		const name = reader.getUtf8String()
		const track_alias = reader.getVarInt()
		const numParams = reader.getNumberVarInt()
		let params: Parameters | undefined
		if (numParams > 0) {
			params = Parameters.deserialize_with_count(reader, Number(numParams))
		}
		let track_extensions: KeyValuePairs | undefined
		if (reader.remaining > 0) {
			track_extensions = KeyValuePairs.deserialize(reader)
		}
		return {
			id,
			track_alias,
			namespace,
			name,
			track_extensions,
			params,
		}
	}
}
