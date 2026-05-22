import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Location, KeyValuePairs } from "../base_data"

export interface FetchOk {
	id: bigint
	end_of_track: number // u8
	end_location: Location
	track_extensions?: KeyValuePairs
	params?: Parameters
}

export namespace FetchOk {
	export function serialize(v: FetchOk): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.FetchOk)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putU8(v.end_of_track)
		payloadBuf.putBytes(Location.serialize(v.end_location))
		const params = v.params ?? new Map()
		payloadBuf.putBytes(Parameters.serialize(params))
		const extensions = v.track_extensions ?? new Map()
		payloadBuf.putBytes(KeyValuePairs.serialize(extensions))

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): FetchOk {
		const id = reader.getVarInt()
		const end_of_track = reader.getU8()
		const end_location = Location.deserialize(reader)
		const numParams = reader.getNumberVarInt()
		let params: Parameters | undefined
		if (numParams > 0) {
			params = Parameters.deserialize_with_count(reader, Number(numParams))
		}
		let track_extensions: KeyValuePairs | undefined
		if (reader.remaining > 0) {
			track_extensions = KeyValuePairs.deserialize(reader)
		}
		return {
			id,
			end_of_track,
			end_location,
			track_extensions,
			params,
		}
	}
}
