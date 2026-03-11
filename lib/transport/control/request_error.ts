import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { ReasonPhrase } from "../base_data"

// Draft-16: REQUEST_ERROR (Section 9.8)
// Sent in response to any request (SUBSCRIBE, FETCH, PUBLISH, SUBSCRIBE_NAMESPACE, PUBLISH_NAMESPACE, TRACK_STATUS)
export interface RequestError {
	id: bigint // Request ID
	code: bigint // Error Code (RequestErrorCode)
	retry_interval: bigint // Minimum retry time in ms + 1; 0 = don't retry
	reason: ReasonPhrase
}

export namespace RequestError {
	export function serialize(v: RequestError): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.RequestError)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putVarInt(v.code)
		payloadBuf.putVarInt(v.retry_interval)
		payloadBuf.putBytes(ReasonPhrase.serialize(v.reason))

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): RequestError {
		const id = reader.getVarInt()
		const code = reader.getVarInt()
		const retry_interval = reader.getVarInt()
		const reason = ReasonPhrase.deserialize(reader)
		return {
			id,
			code,
			retry_interval,
			reason,
		}
	}
}
