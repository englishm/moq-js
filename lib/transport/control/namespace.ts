import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple } from "../base_data"


export interface Namespace {
	namespace_suffix: string[]
}

export namespace Namespace {
	export function serialize(v: Namespace): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.Namespace)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putBytes(Tuple.serialize(v.namespace_suffix))
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): Namespace {
		const namespace_suffix = Tuple.deserialize(reader)
		return {
			namespace_suffix,
		}
	}
}
