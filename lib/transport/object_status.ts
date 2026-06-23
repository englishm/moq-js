import { ImmutableBytesBuffer, MutableBytesBuffer } from "./buffer"

export enum Status {
	NORMAL = 0,
	GROUP_END = 3,
	TRACK_END = 4,
}

export namespace Status {
	export function serialize(status: Status): Uint8Array {
		const w = new MutableBytesBuffer(new Uint8Array())
		w.putVarInt(status)
		return w.Uint8Array
	}

	export function deserialize(reader: ImmutableBytesBuffer): Status {
		return try_from(reader.getNumberVarInt())
	}

	export function try_from(value: number | bigint) {
		const v = typeof value === "bigint" ? Number(value) : value

		switch (v) {
			case 0:
				return Status.NORMAL
			case 3:
				return Status.GROUP_END
			case 4:
				return Status.TRACK_END
			default:
				throw new Error(`invalid object status: ${v}`)
		}
	}
}
