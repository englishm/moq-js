import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"


// Draft-16: MAX_REQUEST_ID (Section 9.5, type 0x15)
// Sent to increase the number of requests the peer can send within a session.
// The Maximum Request ID MUST only increase within a session.
export interface MaxRequestId {
    max_request_id: bigint
}

export namespace MaxRequestId {
    export function serialize(v: MaxRequestId): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.MaxRequestId)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.max_request_id)
        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): MaxRequestId {
        const max_request_id = reader.getVarInt()
        return {
            max_request_id,
        }
    }
}