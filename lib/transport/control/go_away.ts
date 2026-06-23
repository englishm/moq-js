import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"

export interface GoAway {
	session_uri: string
}

export namespace GoAway {
	export function serialize(v: GoAway): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.GoAway)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putUtf8String(v.session_uri)

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): GoAway {
		const session_uri = reader.getUtf8String()
		return {
			session_uri,
		}
	}
}
