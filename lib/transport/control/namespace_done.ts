import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple } from "../base_data"

export interface NamespaceDone {
	namespace_suffix: string[]
}

export namespace NamespaceDone {
	export function serialize(v: NamespaceDone): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.NamespaceDone)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putBytes(Tuple.serialize(v.namespace_suffix))
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): NamespaceDone {
		const namespace_suffix = Tuple.deserialize(reader)
		return {
			namespace_suffix,
		}
	}
}
