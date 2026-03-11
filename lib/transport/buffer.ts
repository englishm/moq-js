const MAX_U6 = Math.pow(2, 6) - 1 // 0-63 (6 bits)
const MAX_U14 = Math.pow(2, 14) - 1 // 0-16383 (14 bits)
const MAX_U30 = Math.pow(2, 30) - 1 // 0-1073741823 (30 bits)
const MAX_U53 = Number.MAX_SAFE_INTEGER
const MAX_U62: bigint = 2n ** 62n - 1n // 0-4611686018427387903 (62 bits)

export interface Reader {
	byteLength: number
	waitForBytes(len: number): Promise<void>
	read(len: number): Promise<Uint8Array>
	done(): Promise<boolean>
	close(): Promise<void>
	release(): [Uint8Array, ReadableStream<Uint8Array>] | [Uint8Array, WritableStream<Uint8Array>]

	getU8(): Promise<number>
	getU16(): Promise<number>
	getNumberVarInt(): Promise<number>
	getVarInt(): Promise<bigint>
	getVarBytes(): Promise<Uint8Array>
	getUtf8String(): Promise<string>
}

export interface Writer {
	write(data: Uint8Array): Promise<void>
	flush(): Promise<void>
	clear(): void
	close(): Promise<void>
	release(): [Uint8Array, WritableStream<Uint8Array>] | [Uint8Array, ReadableStream<Uint8Array>]

	putU8(v: number): void
	putU16(v: number): void
	putVarInt(v: number | bigint): void
	putUtf8String(v: string): void
}

export class ImmutableBytesBuffer {
	protected buffer: Uint8Array
	protected offset = 0
	view: DataView

	constructor(buffer: Uint8Array) {
		this.buffer = buffer
		this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length)
	}

	get length(): number {
		return this.buffer.length
	}

	get remaining(): number {
		return this.length - this.offset
	}

	get Uint8Array(): Uint8Array {
		return this.buffer.slice(0, this.offset)
	}

	get firstByteValue(): number {
		return this.buffer[this.offset]
	}

	getRemainingBuffer(): Uint8Array {
		return this.buffer.subarray(this.offset)
	}

	getU8(): number {
		if (this.remaining < 1) throw new Error("not enough bytes")
		const val = this.view.getUint8(this.offset)
		this.offset += 1
		return val
	}

	getU16(): number {
		if (this.remaining < 2) throw new Error("not enough bytes")
		const val = this.view.getUint16(this.offset)
		this.offset += 2
		return val
	}

	getU32(): number {
		if (this.remaining < 4) throw new Error("not enough bytes")
		const val = this.view.getUint32(this.offset)
		this.offset += 4
		return val
	}

	getU64(): bigint {
		if (this.remaining < 8) throw new Error("not enough bytes")
		const val = this.view.getBigUint64(this.offset)
		this.offset += 8
		return val
	}

	getVarInt(): bigint {
		if (this.remaining < 1) throw new Error("not enough bytes")

		// Read first byte to determine length
		const first = this.view.getUint8(this.offset)
		const prefix = (first & 0b11000000) >> 6 // Top 2 bits indicate length

		if (prefix === 0) {
			// 1 byte: 00xxxxxx
			this.offset += 1
			return BigInt(first & 0x3f)
		} else if (prefix === 1) {
			// 2 bytes: 01xxxxxx xxxxxxxx
			if (this.remaining < 2) throw new Error("not enough bytes")
			const val = this.view.getUint16(this.offset)
			this.offset += 2
			return BigInt(val & 0x3fff)
		} else if (prefix === 2) {
			// 4 bytes: 10xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
			if (this.remaining < 4) throw new Error("not enough bytes")
			const val = this.view.getUint32(this.offset)
			this.offset += 4
			return BigInt(val & 0x3fffffff)
		} else {
			// 8 bytes: 11xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
			if (this.remaining < 8) throw new Error("not enough bytes")
			const val = this.view.getBigUint64(this.offset)
			this.offset += 8
			return val & 0x3fffffffffffffffn
		}
	}

	getNumberVarInt(): number {
		const val = this.getVarInt()
		if (val > Number.MAX_SAFE_INTEGER) throw new Error("varint too large")
		return Number(val)
	}

	getBytes(len: number): Uint8Array {
		if (this.remaining < len) throw new Error("not enough bytes")
		const val = this.buffer.slice(this.offset, this.offset + len)
		this.offset += len
		return val
	}

	getVarBytes(): Uint8Array {
		const len = this.getNumberVarInt()
		return this.getBytes(len)
	}

	getUtf8String(): string {
		const len = this.getNumberVarInt()
		const val = this.getBytes(len)
		return new TextDecoder().decode(val)
	}
}

export class MutableBytesBuffer {
	offset = 0
	buffer: Uint8Array
	view: DataView
	constructor(buffer: Uint8Array) {
		this.buffer = buffer
		this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
	}

	get length(): number {
		return this.offset
	}

	get byteLength(): number {
		// NOTE(itzmanish): since we are working with u8 buffer, byteLength is same as length
		return this.length
	}

	get Uint8Array(): Uint8Array {
		return this.buffer.subarray(0, this.offset)
	}

	enoughSpaceAvailable(len: number): void {
		const required = this.offset + len
		if (required < this.buffer.length) {
			return
		}

		const newBuffer = new Uint8Array(nextPow2(required))
		newBuffer.set(this.buffer.subarray(0, this.offset))
		this.buffer = newBuffer
		this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength)
	}

	putU8(v: number) {
		this.enoughSpaceAvailable(1)
		this.view.setUint8(this.offset, v)
		this.offset += 1
	}

	putU16(v: number) {
		this.enoughSpaceAvailable(2)
		this.view.setUint16(this.offset, v)
		this.offset += 2
	}

	putU32(v: number) {
		this.enoughSpaceAvailable(4)
		this.view.setUint32(this.offset, v)
		this.offset += 4
	}

	putU64(v: bigint) {
		this.enoughSpaceAvailable(8)
		this.view.setBigUint64(this.offset, v)
		this.offset += 8
	}

	putVarInt(v: number | bigint) {
		const value = typeof v === "number" ? BigInt(v) : v
		if (value < 0) throw new Error("underflow, value is negative: " + v)

		let length: number
		let prefix: number

		if (value < MAX_U6) {
			// 1 byte: 00xxxxxx
			length = 1
			prefix = 0x00
		} else if (value < MAX_U14) {
			// 2 bytes: 01xxxxxx xxxxxxxx
			length = 2
			prefix = 0x40
		} else if (value < MAX_U30) {
			// 4 bytes: 10xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
			length = 4
			prefix = 0x80
		} else if (value <= MAX_U62) {
			// 8 bytes: 11xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
			length = 8
			prefix = 0xc0
		} else {
			throw new Error("overflow, value larger than 62-bits: " + v)
		}

		this.enoughSpaceAvailable(length)

		// Write first byte with prefix
		const shift = BigInt((length - 1) * 8)
		this.putU8(Number((value >> shift) | BigInt(prefix)))

		// Write remaining bytes
		for (let i = length - 2; i >= 0; i--) {
			this.putU8(Number((value >> BigInt(i * 8)) & 0xffn))
		}
	}

	putBytes(v: Uint8Array) {
		this.enoughSpaceAvailable(v.length)
		this.buffer.set(v, this.offset)
		this.offset += v.length
	}

	putUtf8String(v: string) {
		const bytes = new TextEncoder().encode(v)
		this.putLengthPrefixedByteArray(bytes.length, bytes)
	}

	putLengthPrefixedByteArray(len: number, v: Uint8Array) {
		this.putVarInt(len)
		this.putBytes(v)
	}
}

export class ReadableStreamBuffer implements Reader {
	protected buffer: Uint8Array
	protected reader: ReadableStreamDefaultReader<Uint8Array>
	protected readableStream: ReadableStream<Uint8Array>

	constructor(reader: ReadableStream, buffer?: Uint8Array) {
		this.buffer = buffer ?? new Uint8Array()
		this.reader = reader.getReader()
		this.readableStream = reader
	}

	waitForBytes(len: number): Promise<void> {
		if (this.buffer.byteLength >= len) {
			return Promise.resolve()
		}
		return this.#fillTo(len)
	}

	get byteLength(): number {
		return this.buffer.byteLength
	}

	// Adds more data to the buffer, returning true if more data was added.
	async #fill(): Promise<boolean> {
		const result = await this.reader.read()
		if (result.done) {
			return false
		}
		const buffer = new Uint8Array(result.value)

		if (this.buffer.byteLength == 0) {
			this.buffer = buffer
		} else {
			const temp = new Uint8Array(this.buffer.byteLength + buffer.byteLength)
			temp.set(this.buffer)
			temp.set(buffer, this.buffer.byteLength)
			this.buffer = temp
		}

		return true
	}

	// Add more data to the buffer until it's at least size bytes.
	async #fillTo(size: number) {
		while (this.buffer.byteLength < size) {
			if (!(await this.#fill())) {
				throw new Error("unexpected end of stream")
			}
		}
	}

	// Consumes the first size bytes of the buffer.
	#slice(size: number): Uint8Array {
		const result = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset, size)
		this.buffer = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset + size)

		return result
	}

	async read(size: number): Promise<Uint8Array> {
		if (size == 0) return new Uint8Array()

		await this.#fillTo(size)
		return this.#slice(size)
	}

	async readAll(): Promise<Uint8Array> {
		// eslint-disable-next-line no-empty
		while (await this.#fill()) {}
		return this.#slice(this.buffer.byteLength)
	}

	async getUtf8String(maxLength?: number): Promise<string> {
		const length = await this.getNumberVarInt()
		if (maxLength !== undefined && length > maxLength) {
			throw new Error(`string length ${length} exceeds max length ${maxLength}`)
		}

		const buffer = await this.read(length)
		return new TextDecoder().decode(buffer)
	}

	async getU8(): Promise<number> {
		await this.#fillTo(1)
		return this.#slice(1)[0]
	}

	async getU16(): Promise<number> {
		await this.#fillTo(2)
		const slice = this.#slice(2)
		const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength)

		return view.getInt16(0)
	}

	// Returns a Number using 53-bits, the max Javascript can use for integer math
	async getNumberVarInt(): Promise<number> {
		const v = await this.getVarInt()
		if (v > MAX_U53) {
			throw new Error("value larger than 53-bits; use v62 instead")
		}

		return Number(v)
	}

	async getVarInt(): Promise<bigint> {
		await this.#fillTo(1)
		const size = (this.buffer[0] & 0xc0) >> 6

		if (size == 0) {
			const first = this.#slice(1)[0]
			return BigInt(first) & 0x3fn
		} else if (size == 1) {
			await this.#fillTo(2)
			const slice = this.#slice(2)
			const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength)

			return BigInt(view.getInt16(0)) & 0x3fffn
		} else if (size == 2) {
			await this.#fillTo(4)
			const slice = this.#slice(4)
			const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength)

			return BigInt(view.getUint32(0)) & 0x3fffffffn
		} else if (size == 3) {
			await this.#fillTo(8)
			const slice = this.#slice(8)
			const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength)

			return view.getBigUint64(0) & 0x3fffffffffffffffn
		} else {
			throw new Error("impossible")
		}
	}

	async getVarBytes(): Promise<Uint8Array> {
		const length = await this.getNumberVarInt()
		return this.read(length)
	}

	async done(): Promise<boolean> {
		if (this.buffer.byteLength > 0) return false
		return !(await this.#fill())
	}

	async close() {
		this.reader.releaseLock()
		await this.readableStream.cancel()
	}

	release(): [Uint8Array, ReadableStream<Uint8Array>] {
		this.reader.releaseLock()
		return [this.buffer, this.readableStream]
	}
}

export class WritableStreamBuffer implements Writer {
	protected writer: WritableStreamDefaultWriter<Uint8Array>
	protected writableStream: WritableStream<Uint8Array>
	protected buffer: MutableBytesBuffer
	constructor(writer: WritableStream<Uint8Array>) {
		this.writer = writer.getWriter()
		this.writableStream = writer
		this.buffer = new MutableBytesBuffer(new Uint8Array())
	}

	async write(data: Uint8Array) {
		return this.writer.write(data)
	}

	async close() {
		this.writer.releaseLock()
		return this.writableStream.close()
	}

	async flush() {
		await this.write(this.buffer.Uint8Array)
		this.clear()
	}

	clear() {
		this.buffer = new MutableBytesBuffer(new Uint8Array())
	}

	putU8(v: number) {
		this.buffer.putU8(v)
	}

	putU16(v: number) {
		this.buffer.putU16(v)
	}

	putVarInt(v: number | bigint) {
		this.buffer.putVarInt(v)
	}

	putUtf8String(v: string) {
		this.buffer.putUtf8String(v)
	}

	release(): [Uint8Array, WritableStream<Uint8Array>] {
		this.writer.releaseLock()
		return [this.buffer.Uint8Array, this.writableStream]
	}
}

export class ReadableWritableStreamBuffer implements Reader, Writer {
	private readStreamBuffer: ReadableStreamBuffer
	private writeStreamBuffer: WritableStreamBuffer

	constructor(reader: ReadableStream, writer: WritableStream<Uint8Array>) {
		this.readStreamBuffer = new ReadableStreamBuffer(reader)
		this.writeStreamBuffer = new WritableStreamBuffer(writer)
	}

	waitForBytes(len: number): Promise<void> {
		return this.readStreamBuffer.waitForBytes(len)
	}

	get byteLength(): number {
		return this.readStreamBuffer.byteLength
	}

	async read(len: number): Promise<Uint8Array> {
		return this.readStreamBuffer.read(len)
	}

	async getU8(): Promise<number> {
		return this.readStreamBuffer.getU8()
	}

	async getU16(): Promise<number> {
		return this.readStreamBuffer.getU16()
	}

	async getNumberVarInt(): Promise<number> {
		return this.readStreamBuffer.getNumberVarInt()
	}

	async getVarInt(): Promise<bigint> {
		return this.readStreamBuffer.getVarInt()
	}

	async getUtf8String(): Promise<string> {
		return this.readStreamBuffer.getUtf8String()
	}

	async getVarBytes(): Promise<Uint8Array> {
		return this.readStreamBuffer.getVarBytes()
	}

	async done(): Promise<boolean> {
		return this.readStreamBuffer.done()
	}

	putU16(v: number): void {
		this.writeStreamBuffer.putU16(v)
	}
	putVarInt(v: number | bigint): void {
		this.writeStreamBuffer.putVarInt(v)
	}
	putUtf8String(v: string): void {
		this.writeStreamBuffer.putUtf8String(v)
	}
	putU8(v: number) {
		this.writeStreamBuffer.putU8(v)
	}

	async write(data: Uint8Array) {
		return this.writeStreamBuffer.write(data)
	}

	async close() {
		this.readStreamBuffer.close()
		this.writeStreamBuffer.close()
	}
	async flush(): Promise<void> {
		return this.writeStreamBuffer.flush()
	}

	clear(): void {
		this.writeStreamBuffer.clear()
	}

	release(): [Uint8Array, ReadableStream<Uint8Array>] | [Uint8Array, WritableStream<Uint8Array>] {
		throw new Error("use release all instead of release")
	}

	releaseAll(): [Uint8Array, Uint8Array, ReadableStream<Uint8Array>, WritableStream<Uint8Array>] {
		const [readBuffer, readStream] = this.readStreamBuffer.release()
		const [writeBuffer, writeStream] = this.writeStreamBuffer.release()
		return [readBuffer, writeBuffer, readStream, writeStream]
	}
}

function nextPow2(x: number): number {
	// Handle edge cases
	if (x <= 1) return 1

	// Decrement to handle exact powers of 2
	x--

	// Fill all bits below the highest set bit
	x = x | (x >> 1)
	x = x | (x >> 2)
	x = x | (x >> 4)
	x = x | (x >> 8)
	x = x | (x >> 16)

	// Increment to get next power of 2
	return x + 1
}
