export interface FetchHeader {
	type: FetchType
	id: bigint
}

export enum FetchType {
	Type0x5 = 0x5,
}

export namespace FetchType {
	export function try_from(value: number | bigint): FetchType {
		const v = typeof value === "bigint" ? Number(value) : value

		switch (v) {
			case FetchType.Type0x5:
				return v as FetchType
			default:
				throw new Error(`invalid fetch type: ${v}`)
		}
	}
}
