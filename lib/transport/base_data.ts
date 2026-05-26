import { ImmutableBytesBuffer, MutableBytesBuffer, Reader } from "./buffer"

export type Tuple<T = any> = TupleField<T>[]
export type TupleField<T = any> = T // can be any type

export namespace Tuple {
	// Serialize implementation - only works for types where TupleField.serialize is implemented
	export function serialize<T extends string>(tuple: Tuple<T>): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(tuple.length)
		tuple.forEach((field) => {
			const serialized = TupleField.serialize(field)
			buf.putBytes(serialized)
		})
		return buf.Uint8Array
	}

	// Deserialize implementation - only works for types where TupleField.deserialize is implemented
	export function deserialize<T extends string>(buffer: ImmutableBytesBuffer): Tuple<T> {
		const tuple: T[] = []
		const len = buffer.getVarInt()
		for (let i = 0; i < len; i++) {
			const field = TupleField.deserialize<T>(buffer)
			tuple.push(field)
		}
		return tuple
	}
}

export namespace TupleField {
	// Serialize implementation for string fields only
	export function serialize<T extends string>(field: T): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		const encoded = new TextEncoder().encode(field)
		buf.putVarInt(encoded.length)
		buf.putBytes(encoded)
		return buf.Uint8Array
	}

	// Deserialize implementation for string fields only
	export function deserialize<T extends string>(buffer: ImmutableBytesBuffer): T {
		const field = buffer.getVarBytes()
		return new TextDecoder().decode(field) as T
	}
}

export type Location = {
	group: bigint
	object: bigint
}

export namespace Location {
	export function serialize(location: Location): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(location.group)
		buf.putVarInt(location.object)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): Location {
		const group = buffer.getVarInt()
		const object = buffer.getVarInt()
		return { group, object }
	}
}

// Draft-16: Key-Value-Pairs use delta-encoded types (Section 1.4.2)
// Delta Type is delta from previous type (or 0 if first)
// Type even => value is varint (no length prefix)
// Type odd => value is length-prefixed bytes
export type KeyValuePairs = Map<bigint, Uint8Array | bigint>
export type Parameters = KeyValuePairs

export namespace KeyValuePairs {
	export function valueIsVarInt(key: bigint): boolean {
		return (key & 1n) === 0n
	}

	export function serialize(pairs: KeyValuePairs): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		let prevType = 0n
		// Sort keys to ensure ascending order for delta encoding
		const sortedEntries = [...pairs.entries()].sort((a, b) => {
			if (a[0] < b[0]) return -1
			if (a[0] > b[0]) return 1
			return 0
		})
		for (const [key, value] of sortedEntries) {
			const delta = key - prevType
			buf.putVarInt(delta)
			if (valueIsVarInt(key)) {
				buf.putVarInt(value as bigint)
			} else {
				const bytes = value as Uint8Array
				buf.putVarInt(bytes.length)
				buf.putBytes(bytes)
			}
			prevType = key
		}
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): KeyValuePairs {
		const pairs = new Map<bigint, Uint8Array | bigint>()
		let prevType = 0n
		while (buffer.remaining > 0) {
			const delta = buffer.getVarInt()
			const resolvedType = prevType + delta
			if (valueIsVarInt(resolvedType)) {
				const value = buffer.getVarInt()
				pairs.set(resolvedType, value)
			} else {
				const length = buffer.getNumberVarInt()
				const value = buffer.getBytes(length)
				pairs.set(resolvedType, value)
			}
			prevType = resolvedType
		}
		return pairs
	}

	export function deserialize_with_count(buffer: ImmutableBytesBuffer, count: number): KeyValuePairs {
		const pairs = new Map<bigint, Uint8Array | bigint>()
		let prevType = 0n
		for (let i = 0; i < count; i++) {
			const delta = buffer.getVarInt()
			const resolvedType = prevType + delta
			if (valueIsVarInt(resolvedType)) {
				const value = buffer.getVarInt()
				pairs.set(resolvedType, value)
			} else {
				const length = buffer.getNumberVarInt()
				const value = buffer.getBytes(length)
				pairs.set(resolvedType, value)
			}
			prevType = resolvedType
		}
		return pairs
	}

	export async function deserialize_with_reader(reader: Reader): Promise<KeyValuePairs> {
		const pairs = new Map<bigint, Uint8Array | bigint>()
		let prevType = 0n
		while (!(await reader.done())) {
			const delta = await reader.getVarInt()
			const resolvedType = prevType + delta
			if (valueIsVarInt(resolvedType)) {
				const value = await reader.getVarInt()
				pairs.set(resolvedType, value)
			} else {
				const length = await reader.getNumberVarInt()
				const value = await reader.read(length)
				pairs.set(resolvedType, value)
			}
			prevType = resolvedType
		}
		return pairs
	}

	export async function deserialize_with_reader_count(reader: Reader, count: number): Promise<KeyValuePairs> {
		const pairs = new Map<bigint, Uint8Array | bigint>()
		let prevType = 0n
		for (let i = 0; i < count; i++) {
			const delta = await reader.getVarInt()
			const resolvedType = prevType + delta
			if (valueIsVarInt(resolvedType)) {
				const value = await reader.getVarInt()
				pairs.set(resolvedType, value)
			} else {
				const length = await reader.getNumberVarInt()
				const value = await reader.read(length)
				pairs.set(resolvedType, value)
			}
			prevType = resolvedType
		}
		return pairs
	}
}

export type ExtensionHeaders = KeyValuePairs

export namespace ExtensionHeaders {
	export function serialize(headers: ExtensionHeaders, allowEmpty = true): Uint8Array {
		const bytes = KeyValuePairs.serialize(headers)
		if (!allowEmpty && bytes.length === 0) {
			throw new Error("extension headers cannot be empty")
		}

		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(bytes.length)
		buf.putBytes(bytes)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer, allowEmpty = true): ExtensionHeaders {
		const length = buffer.getNumberVarInt()
		if (!allowEmpty && length === 0) {
			throw new Error("extension headers cannot be empty")
		}

		const bytes = buffer.getBytes(length)
		return KeyValuePairs.deserialize(new ImmutableBytesBuffer(bytes))
	}
}

export namespace Parameters {
	export function valueIsVarInt(key: bigint): boolean {
		return KeyValuePairs.valueIsVarInt(key)
	}

	export function serialize(pairs: Parameters): Uint8Array {
		const bytes = KeyValuePairs.serialize(pairs)
		const buf = new MutableBytesBuffer(new Uint8Array())
		buf.putVarInt(pairs.size)
		buf.putBytes(bytes)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): Parameters {
		const count = buffer.getNumberVarInt()
		return KeyValuePairs.deserialize_with_count(buffer, count)
	}

	export function deserialize_with_count(buffer: ImmutableBytesBuffer, count: number): Parameters {
		return KeyValuePairs.deserialize_with_count(buffer, count)
	}

	export async function deserialize_with_reader(reader: Reader): Promise<Parameters> {
		const count = await reader.getNumberVarInt()
		return KeyValuePairs.deserialize_with_reader_count(reader, count)
	}

	export async function deserialize_with_reader_count(reader: Reader, count: number): Promise<Parameters> {
		return KeyValuePairs.deserialize_with_reader_count(reader, count)
	}
}

// Draft-16: Reason Phrase structure (Section 1.4.3)
// Max length is 1024 bytes
export const REASON_PHRASE_MAX_LENGTH = 1024

export type ReasonPhrase = string

export namespace ReasonPhrase {
	export function serialize(reason: ReasonPhrase): Uint8Array {
		const buf = new MutableBytesBuffer(new Uint8Array())
		const encoded = new TextEncoder().encode(reason)
		if (encoded.length > REASON_PHRASE_MAX_LENGTH) {
			throw new Error(`Reason phrase exceeds max length of ${REASON_PHRASE_MAX_LENGTH} bytes`)
		}
		buf.putVarInt(encoded.length)
		buf.putBytes(encoded)
		return buf.Uint8Array
	}

	export function deserialize(buffer: ImmutableBytesBuffer): ReasonPhrase {
		const length = buffer.getNumberVarInt()
		if (length > REASON_PHRASE_MAX_LENGTH) {
			throw new Error(`Reason phrase length ${length} exceeds max of ${REASON_PHRASE_MAX_LENGTH}`)
		}
		const bytes = buffer.getBytes(length)
		return new TextDecoder().decode(bytes)
	}

	export async function deserialize_with_reader(reader: Reader): Promise<ReasonPhrase> {
		const length = await reader.getNumberVarInt()
		if (length > REASON_PHRASE_MAX_LENGTH) {
			throw new Error(`Reason phrase length ${length} exceeds max of ${REASON_PHRASE_MAX_LENGTH}`)
		}
		const bytes = await reader.read(length)
		return new TextDecoder().decode(bytes)
	}
}

// Draft-16: Parameter Type constants (Section 13.2, Table 8)
export enum ParameterType {
	DELIVERY_TIMEOUT = 0x02,
	AUTHORIZATION_TOKEN = 0x03,
	EXPIRES = 0x08,
	LARGEST_OBJECT = 0x09,
	FORWARD = 0x10,
	SUBSCRIBER_PRIORITY = 0x20,
	SUBSCRIPTION_FILTER = 0x21,
	GROUP_ORDER = 0x22,
	NEW_GROUP_REQUEST = 0x32,
}

// Draft-16: Extension Header Type constants (Section 13.3, Table 9)
export enum ExtensionHeaderType {
	DELIVERY_TIMEOUT = 0x02,
	MAX_CACHE_DURATION = 0x04,
	IMMUTABLE_EXTENSIONS = 0x0b,
	DEFAULT_PUBLISHER_PRIORITY = 0x0e,
	DEFAULT_PUBLISHER_GROUP_ORDER = 0x22,
	DYNAMIC_GROUPS = 0x30,
	PRIOR_GROUP_ID_GAP = 0x3c,
	PRIOR_OBJECT_ID_GAP = 0x3e,
}

// Draft-16: Session Termination Error Codes (Section 13.4.1, Table 10)
export enum SessionTerminationError {
	NO_ERROR = 0x0,
	INTERNAL_ERROR = 0x1,
	UNAUTHORIZED = 0x2,
	PROTOCOL_VIOLATION = 0x3,
	INVALID_REQUEST_ID = 0x4,
	DUPLICATE_TRACK_ALIAS = 0x5,
	KEY_VALUE_FORMATTING_ERROR = 0x6,
	TOO_MANY_REQUESTS = 0x7,
	INVALID_PATH = 0x8,
	MALFORMED_PATH = 0x9,
	GOAWAY_TIMEOUT = 0x10,
	CONTROL_MESSAGE_TIMEOUT = 0x11,
	DATA_STREAM_TIMEOUT = 0x12,
	AUTH_TOKEN_CACHE_OVERFLOW = 0x13,
	DUPLICATE_AUTH_TOKEN_ALIAS = 0x14,
	VERSION_NEGOTIATION_FAILED = 0x15,
	MALFORMED_AUTH_TOKEN = 0x16,
	UNKNOWN_AUTH_TOKEN_ALIAS = 0x17,
	EXPIRED_AUTH_TOKEN = 0x18,
	INVALID_AUTHORITY = 0x19,
	MALFORMED_AUTHORITY = 0x1a,
}

// Draft-16: REQUEST_ERROR Codes (Section 13.4.2, Table 11)
export enum RequestErrorCode {
	INTERNAL_ERROR = 0x0,
	UNAUTHORIZED = 0x1,
	TIMEOUT = 0x2,
	NOT_SUPPORTED = 0x3,
	MALFORMED_AUTH_TOKEN = 0x4,
	EXPIRED_AUTH_TOKEN = 0x5,
	DOES_NOT_EXIST = 0x10,
	INVALID_RANGE = 0x11,
	MALFORMED_TRACK = 0x12,
	DUPLICATE_SUBSCRIPTION = 0x19,
	UNINTERESTED = 0x20,
	PREFIX_OVERLAP = 0x30,
	INVALID_JOINING_REQUEST_ID = 0x32,
}

// Draft-16: PUBLISH_DONE Codes (Section 13.4.3, Table 12)
export enum PublishDoneCode {
	INTERNAL_ERROR = 0x0,
	UNAUTHORIZED = 0x1,
	TRACK_ENDED = 0x2,
	SUBSCRIPTION_ENDED = 0x3,
	GOING_AWAY = 0x4,
	EXPIRED = 0x5,
	TOO_FAR_BEHIND = 0x6,
	UPDATE_FAILED = 0x8,
	MALFORMED_TRACK = 0x12,
}

// Draft-16: Data Stream Reset Error Codes (Section 13.4.4, Table 13)
export enum DataStreamResetCode {
	INTERNAL_ERROR = 0x0,
	CANCELLED = 0x1,
	DELIVERY_TIMEOUT = 0x2,
	SESSION_CLOSED = 0x3,
	UNKNOWN_OBJECT_STATUS = 0x4,
	MALFORMED_TRACK = 0x12,
}
