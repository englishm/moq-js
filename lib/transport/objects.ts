import { Reader, Writer } from "./stream"
export { Reader, Writer }

// Each stream type is prefixed with the given VarInt type.
// https://www.ietf.org/archive/id/draft-ietf-moq-transport-06.html#section-7
export enum StreamType {
	// Datagram = 0x1, // No datagram support
	Track = 0x2, // Deprecated in DRAFT_07
	Subgroup = 0x4,
	// Fetch = 0x5, // Added in DRAFT_07
}

export enum Status {
	OBJECT_NULL = 1,
	GROUP_NULL = 2,
	GROUP_END = 3,
	TRACK_END = 4,
}

export interface TrackHeader {
	type: StreamType.Track
	sub: bigint
	track: bigint
	publisher_priority: number // VarInt with a u32 maximum value
}

export interface TrackChunk {
	group: number // The group sequence, as a number because 2^53 is enough.
	object: number
	status?: Status // Only sent if Object Payload Length is zero
	payload: Uint8Array | Status
}

export interface SubgroupHeader {
	type: StreamType.Subgroup
	sub: bigint
	track: bigint
	group: number // The group sequence, as a number because 2^53 is enough.
	subgroup: number // The subgroup sequence, as a number because 2^53 is enough.
	publisher_priority: number // VarInt with a u32 maximum value
}

export interface SubgroupChunk {
	object: number
	status?: Status // Only sent if Object Payload Length is zero
	payload: Uint8Array | Status
}

type WriterType<T> = T extends TrackHeader ? TrackWriter : T extends SubgroupHeader ? SubgroupWriter : never

export class Objects {
	private quic: WebTransport

	constructor(quic: WebTransport) {
		this.quic = quic
	}

	async send<T extends TrackHeader | SubgroupHeader>(h: T): Promise<WriterType<T>> {
		const stream = await this.quic.createUnidirectionalStream()
		const w = new Writer(stream)

		await w.u53(h.type)
		await w.u62(h.sub)
		await w.u62(h.track)

		let res: WriterType<T>

		if (h.type === StreamType.Subgroup) {
			await w.u53(h.group)
			await w.u53(h.subgroup)
			await w.u8(h.publisher_priority)

			res = new SubgroupWriter(h, w) as WriterType<T>
		} else if (h.type === StreamType.Track) {
			await w.u8(h.publisher_priority)

			res = new TrackWriter(h, w) as WriterType<T>
		} else {
			throw new Error("unknown header type")
		}

		// console.trace("send object", res.header)

		return res
	}

	async recv(): Promise<TrackReader | SubgroupReader | undefined> {
		const streams = this.quic.incomingUnidirectionalStreams.getReader()

		const { value, done } = await streams.read()
		streams.releaseLock()

		if (done) return

		const r = new Reader(new Uint8Array(), value)
		const type = (await r.u53()) as StreamType
		let res: TrackReader | SubgroupReader

		if (type == StreamType.Track) {
			const h: TrackHeader = {
				type,
				sub: await r.u62(),
				track: await r.u62(),
				publisher_priority: await r.u8(),
			}

			res = new TrackReader(h, r)
		} else if (type == StreamType.Subgroup) {
			const h = {
				type,
				sub: await r.u62(),
				track: await r.u62(),
				group: await r.u53(),
				subgroup: await r.u53(),
				publisher_priority: await r.u8(),
			}
			res = new SubgroupReader(h, r)
		} else {
			console.log("transport/objects.ts: unknown stream type: ", type)
			throw new Error("unknown stream type")
		}

		// console.trace("receive object", res.header)

		return res
	}
}

export class TrackWriter {
	constructor(
		public header: TrackHeader,
		public stream: Writer,
	) {}

	async write(c: TrackChunk) {
		await this.stream.u53(c.group)
		await this.stream.u53(c.object)

		if (c.payload instanceof Uint8Array) {
			await this.stream.u53(c.payload.byteLength)
			await this.stream.write(c.payload)
		} else {
			// empty payload with status
			await this.stream.u53(0)
			await this.stream.u53(c.payload as number)
		}
	}

	async close() {
		await this.stream.close()
	}
}

export class SubgroupWriter {
	constructor(
		public header: SubgroupHeader,
		public stream: Writer,
	) {}

	async write(c: SubgroupChunk) {
		await this.stream.u53(c.object)
		if (c.payload instanceof Uint8Array) {
			await this.stream.u53(c.payload.byteLength)
			await this.stream.write(c.payload)
		} else {
			await this.stream.u53(0)
			await this.stream.u53(c.payload as number)
		}
	}

	async close() {
		await this.stream.close()
	}
}

export class TrackReader {
	constructor(
		public header: TrackHeader,
		public stream: Reader,
	) {}

	async read(): Promise<TrackChunk | undefined> {
		if (await this.stream.done()) {
			return
		}

		const group = await this.stream.u53()
		const object = await this.stream.u53()
		const size = await this.stream.u53()

		let payload
		if (size == 0) {
			payload = (await this.stream.u53()) as Status
		} else {
			payload = await this.stream.read(size)
		}

		return {
			group,
			object,
			payload,
		}
	}

	async close() {
		await this.stream.close()
	}
}

export class SubgroupReader {
	constructor(
		public header: SubgroupHeader,
		public stream: Reader,
	) {}

	async read(): Promise<SubgroupChunk | undefined> {
		if (await this.stream.done()) {
			return
		}

		const object = await this.stream.u53()
		const size = await this.stream.u53()

		let payload
		if (size == 0) {
			payload = (await this.stream.u53()) as Status
		} else {
			payload = await this.stream.read(size)
		}

		return {
			object,
			payload,
		}
	}

	async close() {
		await this.stream.close()
	}
}
