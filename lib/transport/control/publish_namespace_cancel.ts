import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { ReasonPhrase } from "../base_data"

export interface PublishNamespaceCancel {
	id: bigint
	error_code: bigint
	error_reason: string
}

export namespace PublishNamespaceCancel {
	export function serialize(v: PublishNamespaceCancel): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.PublishNamespaceCancel)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putVarInt(v.error_code)
		payloadBuf.putBytes(ReasonPhrase.serialize(v.error_reason))
		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): PublishNamespaceCancel {
		const id = reader.getVarInt()
		const error_code = reader.getVarInt()
		const error_reason = ReasonPhrase.deserialize(reader)
		return {
			id,
			error_code,
			error_reason,
		}
	}
}
