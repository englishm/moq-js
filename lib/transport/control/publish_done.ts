import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { ReasonPhrase } from "../base_data"


export interface PublishDone {
	id: bigint
	code: bigint
	stream_count: bigint
	reason: string
}

export namespace PublishDone {
	export function serialize(v: PublishDone): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.PublishDone)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putVarInt(v.code)
		payloadBuf.putVarInt(v.stream_count)
		payloadBuf.putBytes(ReasonPhrase.serialize(v.reason))

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): PublishDone {
		const id = reader.getVarInt()
		const code = reader.getVarInt()
		const stream_count = reader.getVarInt()
		const reason = ReasonPhrase.deserialize(reader)
		return {
			id,
			code,
			stream_count,
			reason
		}
	}
}
