import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters } from "../base_data"

// Draft-16: REQUEST_OK (Section 9.7)
// Sent in response to REQUEST_UPDATE, TRACK_STATUS, SUBSCRIBE_NAMESPACE, PUBLISH_NAMESPACE
export interface RequestOk {
    id: bigint // Request ID
    parameters: Parameters
}

export namespace RequestOk {
    export function serialize(v: RequestOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.RequestOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        const paramsBytes = Parameters.serialize(v.parameters)
        payloadBuf.putVarInt(v.parameters.size) // Number of Parameters
        payloadBuf.putBytes(paramsBytes)

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): RequestOk {
        const id = reader.getVarInt()
        const numParams = reader.getNumberVarInt()
        const parameters = Parameters.deserialize_with_count(reader, numParams)
        return {
            id,
            parameters,
        }
    }
}
