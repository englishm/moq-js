import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"

// Draft-16: REQUESTS_BLOCKED (Section 9.6, type 0x1A)
// Sent when an endpoint would like to send a new request, but cannot
// because the Request ID would exceed the Maximum Request ID value sent by the peer.
export interface RequestsBlocked {
	maximum_request_id: bigint
}

export namespace RequestsBlocked {
	export function serialize(v: RequestsBlocked): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.RequestsBlocked)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.maximum_request_id)

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): RequestsBlocked {
		const maximum_request_id = reader.getVarInt()
		return {
			maximum_request_id,
		}
	}
}
