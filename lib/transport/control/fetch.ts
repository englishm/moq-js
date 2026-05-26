import { ControlMessageType } from "./message_type"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Location, Tuple, Parameters } from "../base_data"

export enum FetchType {
	Standalone = 0x1,
	Relative = 0x2,
	Absolute = 0x3,
}

export namespace FetchType {
	export function serialize(v: FetchType): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(v)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): FetchType {
		const order = buffer.getVarInt()
		switch (order) {
			case 1n:
				return FetchType.Standalone
			case 2n:
				return FetchType.Relative
			case 3n:
				return FetchType.Absolute
			default:
				throw new Error(`Invalid FetchType value: ${order}`)
		}
	}
}

export interface StandaloneFetch {
	namespace: Tuple<string>
	name: string
	start_location: Location
	end_location: Location
}

export namespace StandaloneFetch {
	export function serialize(v: StandaloneFetch): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putBytes(Tuple.serialize(v.namespace))
		buf.putUtf8String(v.name)
		buf.putBytes(Location.serialize(v.start_location))
		buf.putBytes(Location.serialize(v.end_location))
		return buf.Uint8Array
	}

	export function deserialize(r: ImmutableBytesBuffer): StandaloneFetch {
		const namespace = Tuple.deserialize(r)
		const name = r.getUtf8String()
		const start_location = Location.deserialize(r)
		const end_location = Location.deserialize(r)
		return {
			namespace,
			name,
			start_location,
			end_location,
		}
	}
}

export interface JoiningFetch {
	id: bigint
	start: bigint
}

export namespace JoiningFetch {
	export function serialize(v: JoiningFetch): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(v.id)
		buf.putVarInt(v.start)
		return buf.Uint8Array
	}

	export function deserialize(r: ImmutableBytesBuffer): JoiningFetch {
		const id = r.getVarInt()
		const start = r.getVarInt()
		return {
			id,
			start,
		}
	}
}

export interface Fetch {
	id: bigint
	fetch_type: FetchType
	standalone?: StandaloneFetch
	joining?: JoiningFetch
	params?: Parameters
}

export namespace Fetch {
	export function serialize(v: Fetch): Uint8Array {
		const mainBuf = new MutableBytesBuffer(new Uint8Array())
		mainBuf.putVarInt(ControlMessageType.Fetch)
		const payloadBuf = new MutableBytesBuffer(new Uint8Array())
		payloadBuf.putVarInt(v.id)
		payloadBuf.putBytes(FetchType.serialize(v.fetch_type))
		if (v.standalone) {
			payloadBuf.putBytes(StandaloneFetch.serialize(v.standalone))
		}
		if (v.joining) {
			payloadBuf.putBytes(JoiningFetch.serialize(v.joining))
		}
		const params = v.params ?? new Map()
		payloadBuf.putBytes(Parameters.serialize(params))

		mainBuf.putU16(payloadBuf.byteLength)
		mainBuf.putBytes(payloadBuf.Uint8Array)
		return mainBuf.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): Fetch {
		const id = reader.getVarInt()
		const fetch_type = FetchType.deserialize(reader)
		let standalone: StandaloneFetch | undefined
		let joining: JoiningFetch | undefined
		let params: Parameters | undefined
		if (fetch_type == FetchType.Standalone) {
			standalone = StandaloneFetch.deserialize(reader)
		} else if (fetch_type == FetchType.Relative || fetch_type == FetchType.Absolute) {
			joining = JoiningFetch.deserialize(reader)
		}
		const numParams = reader.getNumberVarInt()
		if (numParams > 0) {
			params = Parameters.deserialize_with_count(reader, Number(numParams))
		}
		return {
			id,
			fetch_type,
			standalone,
			joining,
			params,
		}
	}
}
