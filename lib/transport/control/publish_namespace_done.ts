import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"

export interface PublishNamespaceDone {
	id: bigint
}

export namespace PublishNamespaceDone {
	export function serialize(v: PublishNamespaceDone): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.PublishNamespaceDone)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): PublishNamespaceDone {
		const id = reader.getVarInt()
		return {
			id,
		}
	}
}
