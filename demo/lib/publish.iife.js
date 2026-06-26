var MoqPublishApi = (function (t) {
	"use strict"
	const e = Math.pow(2, 6) - 1,
		r = Math.pow(2, 14) - 1,
		s = Math.pow(2, 30) - 1,
		n = Number.MAX_SAFE_INTEGER,
		a = 2n ** 62n - 1n
	class o {
		buffer
		offset = 0
		view
		constructor(t) {
			;((this.buffer = t), (this.view = new DataView(t.buffer, t.byteOffset, t.length)))
		}
		get length() {
			return this.buffer.length
		}
		get remaining() {
			return this.length - this.offset
		}
		get Uint8Array() {
			return this.buffer.slice(0, this.offset)
		}
		get firstByteValue() {
			return this.buffer[this.offset]
		}
		getRemainingBuffer() {
			return this.buffer.subarray(this.offset)
		}
		getU8() {
			if (this.remaining < 1) throw new Error("not enough bytes")
			const t = this.view.getUint8(this.offset)
			return ((this.offset += 1), t)
		}
		getU16() {
			if (this.remaining < 2) throw new Error("not enough bytes")
			const t = this.view.getUint16(this.offset)
			return ((this.offset += 2), t)
		}
		getU32() {
			if (this.remaining < 4) throw new Error("not enough bytes")
			const t = this.view.getUint32(this.offset)
			return ((this.offset += 4), t)
		}
		getU64() {
			if (this.remaining < 8) throw new Error("not enough bytes")
			const t = this.view.getBigUint64(this.offset)
			return ((this.offset += 8), t)
		}
		getVarInt() {
			if (this.remaining < 1) throw new Error("not enough bytes")
			const t = this.view.getUint8(this.offset),
				e = (192 & t) >> 6
			if (0 === e) return ((this.offset += 1), BigInt(63 & t))
			if (1 === e) {
				if (this.remaining < 2) throw new Error("not enough bytes")
				const t = this.view.getUint16(this.offset)
				return ((this.offset += 2), BigInt(16383 & t))
			}
			if (2 === e) {
				if (this.remaining < 4) throw new Error("not enough bytes")
				const t = this.view.getUint32(this.offset)
				return ((this.offset += 4), BigInt(1073741823 & t))
			}
			{
				if (this.remaining < 8) throw new Error("not enough bytes")
				const t = this.view.getBigUint64(this.offset)
				return ((this.offset += 8), 0x3fffffffffffffffn & t)
			}
		}
		getNumberVarInt() {
			const t = this.getVarInt()
			if (t > Number.MAX_SAFE_INTEGER) throw new Error("varint too large")
			return Number(t)
		}
		getBytes(t) {
			if (this.remaining < t) throw new Error("not enough bytes")
			const e = this.buffer.slice(this.offset, this.offset + t)
			return ((this.offset += t), e)
		}
		getVarBytes() {
			const t = this.getNumberVarInt()
			return this.getBytes(t)
		}
		getUtf8String() {
			const t = this.getNumberVarInt()
			if (0 === t) return ""
			const e = this.getBytes(t)
			return new TextDecoder().decode(e)
		}
	}
	class h {
		offset = 0
		buffer
		view
		constructor(t) {
			;((this.buffer = t), (this.view = new DataView(t.buffer, t.byteOffset, t.byteLength)))
		}
		get length() {
			return this.offset
		}
		get byteLength() {
			return this.length
		}
		get Uint8Array() {
			return this.buffer.subarray(0, this.offset)
		}
		enoughSpaceAvailable(t) {
			const e = this.offset + t
			if (e < this.buffer.length) return
			const i = new Uint8Array(
				(r = e) <= 1
					? 1
					: (r--, (r |= r >> 1), (r |= r >> 2), (r |= r >> 4), (r |= r >> 8), 1 + (r |= r >> 16)),
			)
			var r
			;(i.set(this.buffer.subarray(0, this.offset)),
				(this.buffer = i),
				(this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength)))
		}
		putU8(t) {
			;(this.enoughSpaceAvailable(1), this.view.setUint8(this.offset, t), (this.offset += 1))
		}
		putU16(t) {
			;(this.enoughSpaceAvailable(2), this.view.setUint16(this.offset, t), (this.offset += 2))
		}
		putU32(t) {
			;(this.enoughSpaceAvailable(4), this.view.setUint32(this.offset, t), (this.offset += 4))
		}
		putU64(t) {
			;(this.enoughSpaceAvailable(8), this.view.setBigUint64(this.offset, t), (this.offset += 8))
		}
		putVarInt(t) {
			const i = "number" == typeof t ? BigInt(t) : t
			if (i < 0) throw new Error("underflow, value is negative: " + t)
			let n, o
			if (i < e) ((n = 1), (o = 0))
			else if (i < r) ((n = 2), (o = 64))
			else if (i < s) ((n = 4), (o = 128))
			else {
				if (!(i <= a)) throw new Error("overflow, value larger than 62-bits: " + t)
				;((n = 8), (o = 192))
			}
			this.enoughSpaceAvailable(n)
			const h = BigInt(8 * (n - 1))
			this.putU8(Number((i >> h) | BigInt(o)))
			for (let t = n - 2; t >= 0; t--) this.putU8(Number((i >> BigInt(8 * t)) & 0xffn))
		}
		putBytes(t) {
			;(this.enoughSpaceAvailable(t.length), this.buffer.set(t, this.offset), (this.offset += t.length))
		}
		putUtf8String(t) {
			const e = new TextEncoder().encode(t)
			this.putLengthPrefixedByteArray(e.length, e)
		}
		putLengthPrefixedByteArray(t, e) {
			;(this.putVarInt(t), this.putBytes(e))
		}
	}
	class c {
		buffer
		reader
		readableStream
		constructor(t, e) {
			;((this.buffer = e ?? new Uint8Array()), (this.reader = t.getReader()), (this.readableStream = t))
		}
		waitForBytes(t) {
			return this.buffer.byteLength >= t ? Promise.resolve() : this.#t(t)
		}
		get byteLength() {
			return this.buffer.byteLength
		}
		async #e() {
			const t = await this.reader.read()
			if (t.done) return !1
			const e = new Uint8Array(t.value)
			if (0 == this.buffer.byteLength) this.buffer = e
			else {
				const t = new Uint8Array(this.buffer.byteLength + e.byteLength)
				;(t.set(this.buffer), t.set(e, this.buffer.byteLength), (this.buffer = t))
			}
			return !0
		}
		async #t(t) {
			for (; this.buffer.byteLength < t; ) if (!(await this.#e())) throw new Error("unexpected end of stream")
		}
		#i(t) {
			const e = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset, t)
			return ((this.buffer = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset + t)), e)
		}
		async read(t) {
			return 0 == t ? new Uint8Array() : (await this.#t(t), this.#i(t))
		}
		async readAll() {
			for (; await this.#e(); );
			return this.#i(this.buffer.byteLength)
		}
		async getUtf8String(t) {
			const e = await this.getNumberVarInt()
			if (void 0 !== t && e > t) throw new Error(`string length ${e} exceeds max length ${t}`)
			const i = await this.read(e)
			return new TextDecoder().decode(i)
		}
		async getU8() {
			return (await this.#t(1), this.#i(1)[0])
		}
		async getU16() {
			await this.#t(2)
			const t = this.#i(2)
			return new DataView(t.buffer, t.byteOffset, t.byteLength).getInt16(0)
		}
		async getNumberVarInt() {
			const t = await this.getVarInt()
			if (t > n) throw new Error("value larger than 53-bits; use v62 instead")
			return Number(t)
		}
		async getVarInt() {
			await this.#t(1)
			const t = (192 & this.buffer[0]) >> 6
			if (0 == t) {
				const t = this.#i(1)[0]
				return 0x3fn & BigInt(t)
			}
			if (1 == t) {
				await this.#t(2)
				const t = this.#i(2),
					e = new DataView(t.buffer, t.byteOffset, t.byteLength)
				return 0x3fffn & BigInt(e.getInt16(0))
			}
			if (2 == t) {
				await this.#t(4)
				const t = this.#i(4),
					e = new DataView(t.buffer, t.byteOffset, t.byteLength)
				return 0x3fffffffn & BigInt(e.getUint32(0))
			}
			if (3 == t) {
				await this.#t(8)
				const t = this.#i(8)
				return 0x3fffffffffffffffn & new DataView(t.buffer, t.byteOffset, t.byteLength).getBigUint64(0)
			}
			throw new Error("impossible")
		}
		async getVarBytes() {
			const t = await this.getNumberVarInt()
			return this.read(t)
		}
		async done() {
			return !(this.buffer.byteLength > 0) && !(await this.#e())
		}
		async close() {
			;(this.reader.releaseLock(), await this.readableStream.cancel())
		}
		release() {
			return (this.reader.releaseLock(), [this.buffer, this.readableStream])
		}
	}
	class u {
		writer
		writableStream
		buffer
		constructor(t) {
			;((this.writer = t.getWriter()), (this.writableStream = t), (this.buffer = new h(new Uint8Array())))
		}
		async write(t) {
			return this.writer.write(t)
		}
		async close() {
			return (this.writer.releaseLock(), this.writableStream.close())
		}
		async flush() {
			;(await this.write(this.buffer.Uint8Array), this.clear())
		}
		clear() {
			this.buffer = new h(new Uint8Array())
		}
		putU8(t) {
			this.buffer.putU8(t)
		}
		putU16(t) {
			this.buffer.putU16(t)
		}
		putVarInt(t) {
			this.buffer.putVarInt(t)
		}
		putUtf8String(t) {
			this.buffer.putUtf8String(t)
		}
		release() {
			return (this.writer.releaseLock(), [this.buffer.Uint8Array, this.writableStream])
		}
	}
	class l {
		readStreamBuffer
		writeStreamBuffer
		constructor(t, e) {
			;((this.readStreamBuffer = new c(t)), (this.writeStreamBuffer = new u(e)))
		}
		waitForBytes(t) {
			return this.readStreamBuffer.waitForBytes(t)
		}
		get byteLength() {
			return this.readStreamBuffer.byteLength
		}
		async read(t) {
			return this.readStreamBuffer.read(t)
		}
		async getU8() {
			return this.readStreamBuffer.getU8()
		}
		async getU16() {
			return this.readStreamBuffer.getU16()
		}
		async getNumberVarInt() {
			return this.readStreamBuffer.getNumberVarInt()
		}
		async getVarInt() {
			return this.readStreamBuffer.getVarInt()
		}
		async getUtf8String() {
			return this.readStreamBuffer.getUtf8String()
		}
		async getVarBytes() {
			return this.readStreamBuffer.getVarBytes()
		}
		async done() {
			return this.readStreamBuffer.done()
		}
		putU16(t) {
			this.writeStreamBuffer.putU16(t)
		}
		putVarInt(t) {
			this.writeStreamBuffer.putVarInt(t)
		}
		putUtf8String(t) {
			this.writeStreamBuffer.putUtf8String(t)
		}
		putU8(t) {
			this.writeStreamBuffer.putU8(t)
		}
		async write(t) {
			return this.writeStreamBuffer.write(t)
		}
		async close() {
			;(this.readStreamBuffer.close(), this.writeStreamBuffer.close())
		}
		async flush() {
			return this.writeStreamBuffer.flush()
		}
		clear() {
			this.writeStreamBuffer.clear()
		}
		release() {
			throw new Error("use release all instead of release")
		}
		releaseAll() {
			const [t, e] = this.readStreamBuffer.release(),
				[i, r] = this.writeStreamBuffer.release()
			return [t, i, e, r]
		}
	}
	var p, d, f, m, _, g, y, b, w, U, S, x, v, E, B, A, I, T, z, k, C, P, L, F, D, N, R, M, O, V, G, H, Y, j, q, $, K
	function W(...t) {
		console.log("itzmanish:", ...t)
	}
	async function X(t) {
		return new Promise((e) => setTimeout(e, t))
	}
	;(!(function (t) {
		;((t.serialize = function (t) {
			const e = new h(new Uint8Array())
			return (
				e.putVarInt(t.length),
				t.forEach((t) => {
					const i = d.serialize(t)
					e.putBytes(i)
				}),
				e.Uint8Array
			)
		}),
			(t.deserialize = function (t) {
				const e = [],
					i = t.getVarInt()
				for (let r = 0; r < i; r++) {
					const i = d.deserialize(t)
					e.push(i)
				}
				return e
			}))
	})(p || (p = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array()),
					i = new TextEncoder().encode(t)
				return (e.putVarInt(i.length), e.putBytes(i), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarBytes()
					return new TextDecoder().decode(e)
				}))
		})(d || (d = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putVarInt(t.group), e.putVarInt(t.object), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { group: t.getVarInt(), object: t.getVarInt() }
				}))
		})(f || (f = {})),
		(function (t) {
			function e(t) {
				return 0n == (1n & t)
			}
			function i(t, i) {
				const r = new Map()
				for (let s = 0; s < i; s++) {
					const i = t.getVarInt(),
						s = e(i) ? t.getVarInt() : t.getVarBytes()
					r.set(i, s)
				}
				return r
			}
			;((t.valueIsVarInt = e),
				(t.serialize = function (t) {
					const i = new h(new Uint8Array())
					return (
						i.putVarInt(t.size),
						t.forEach((t, r) => {
							;(i.putVarInt(r), e(r) ? i.putVarInt(t) : i.putBytes(t))
						}),
						i.Uint8Array
					)
				}),
				(t.deserialize = function (t) {
					const e = t.getNumberVarInt()
					return i(t, e)
				}),
				(t.deserialize_with_size = i),
				(t.deserialize_with_reader = async function (t) {
					const i = await t.getNumberVarInt(),
						r = new Map()
					for (let s = 0; s < i; s++) {
						const i = await t.getVarInt(),
							s = e(i) ? await t.getVarInt() : await t.getVarBytes()
						r.set(i, s)
					}
					return r
				}))
		})(m || (m = {})),
		(function (t) {
			;((t.valueIsVarInt = function (t) {
				return m.valueIsVarInt(t)
			}),
				(t.serialize = function (t) {
					return m.serialize(t)
				}),
				(t.deserialize = function (t) {
					return m.deserialize(t)
				}),
				(t.deserialize_with_size = function (t, e) {
					return m.deserialize_with_size(t, e)
				}),
				(t.deserialize_with_reader = async function (t) {
					return m.deserialize_with_reader(t)
				}))
		})(_ || (_ = {})),
		(function (t) {
			;((t[(t.Publisher = 0)] = "Publisher"),
				(t[(t.Ascending = 1)] = "Ascending"),
				(t[(t.Descending = 2)] = "Descending"))
		})(g || (g = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putU8(t), e.Uint8Array)
			}),
				(t.deserialize = function (e) {
					const i = e.getU8()
					switch (i) {
						case 0:
							return t.Publisher
						case 1:
							return t.Ascending
						case 2:
							return t.Descending
						default:
							throw new Error(`Invalid GroupOrder value: ${i}`)
					}
				}))
		})(g || (g = {})),
		(function (t) {
			;((t[(t.NextGroupStart = 1)] = "NextGroupStart"),
				(t[(t.LargestObject = 2)] = "LargestObject"),
				(t[(t.AbsoluteStart = 3)] = "AbsoluteStart"),
				(t[(t.AbsoluteRange = 4)] = "AbsoluteRange"))
		})(y || (y = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putVarInt(t), e.Uint8Array)
			}),
				(t.deserialize = function (e) {
					const i = e.getVarInt()
					switch (i) {
						case 1n:
							return t.NextGroupStart
						case 2n:
							return t.LargestObject
						case 3n:
							return t.AbsoluteStart
						case 4n:
							return t.AbsoluteRange
						default:
							throw new Error(`Invalid FilterType value: ${i}`)
					}
				}))
		})(y || (y = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.Subscribe)
				const i = new h(new Uint8Array())
				if (
					(i.putVarInt(t.id),
					i.putBytes(p.serialize(t.namespace)),
					i.putUtf8String(t.name),
					i.putU8(t.subscriber_priority),
					i.putBytes(g.serialize(t.group_order)),
					i.putU8(t.forward),
					i.putBytes(y.serialize(t.filter_type)),
					t.filter_type === y.AbsoluteStart || t.filter_type === y.AbsoluteRange)
				) {
					if (!t.start_location)
						throw new Error("start location required for absolute start or absolute range")
					i.putBytes(f.serialize(t.start_location))
				}
				if (t.filter_type === y.AbsoluteRange) {
					if (null == t.end_group) throw new Error("end group required for absolute range")
					i.putVarInt(t.end_group)
				}
				return (
					i.putBytes(_.serialize(t.params)),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = p.deserialize(t),
						r = t.getUtf8String(),
						s = t.getU8(),
						n = g.deserialize(t),
						a = t.getU8(),
						o = y.deserialize(t)
					let h, c
					return (
						(o != y.AbsoluteRange && o != y.AbsoluteStart) || (h = f.deserialize(t)),
						o == y.AbsoluteRange && (c = t.getVarInt()),
						{
							id: e,
							namespace: i,
							name: r,
							subscriber_priority: s,
							group_order: n,
							forward: a,
							filter_type: o,
							start_location: h,
							end_group: c,
							params: _.deserialize(t),
						}
					)
				}))
		})(b || (b = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.SubscribeOk)
				const i = new h(new Uint8Array())
				if (
					(i.putVarInt(t.id),
					i.putVarInt(t.track_alias),
					i.putVarInt(t.expires),
					i.putBytes(g.serialize(t.group_order)),
					i.putU8(t.content_exists),
					t.content_exists)
				) {
					if (!t.largest_location) throw new Error("largest_location required for content_exists")
					i.putBytes(f.serialize(t.largest_location))
				}
				return (
					i.putBytes(_.serialize(t.params)),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = t.getVarInt(),
						r = t.getVarInt(),
						s = g.deserialize(t),
						n = t.getNumberVarInt()
					if (0 != n && 1 != n) throw new Error("Invalid content_exists value")
					let a
					return (
						n && (a = f.deserialize(t)),
						{
							id: e,
							track_alias: i,
							expires: r,
							group_order: s,
							content_exists: n,
							largest_location: a,
							params: _.deserialize(t),
						}
					)
				}))
		})(w || (w = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.SubscribeError)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.code),
					i.putUtf8String(t.reason),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), code: t.getVarInt(), reason: t.getUtf8String() }
				}))
		})(U || (U = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.SubscribeUpdate)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.subscription_id),
					i.putBytes(f.serialize(t.start_location)),
					i.putVarInt(t.end_group),
					i.putVarInt(t.subscriber_priority),
					i.putVarInt(t.forward),
					i.putBytes(m.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = t.getVarInt(),
						r = f.deserialize(t),
						s = t.getVarInt(),
						n = t.getNumberVarInt(),
						a = t.getNumberVarInt()
					let o
					return (
						t.remaining > 0 && (o = m.deserialize(t)),
						{
							id: e,
							subscription_id: i,
							start_location: r,
							end_group: s,
							subscriber_priority: n,
							forward: a,
							params: o,
						}
					)
				}))
		})(S || (S = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.SubscribeNamespace)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putBytes(p.serialize(t.namespace)),
					i.putBytes(m.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = p.deserialize(t)
					let r
					return (t.remaining > 0 && (r = m.deserialize(t)), { id: e, namespace: i, params: r })
				}))
		})(x || (x = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.SubscribeNamespaceOk)
				const i = new h(new Uint8Array())
				return (i.putVarInt(t.id), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt() }
				}))
		})(v || (v = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.SubscribeNamespaceError)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.code),
					i.putUtf8String(t.reason),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), code: t.getVarInt(), reason: t.getUtf8String() }
				}))
		})(E || (E = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.Unsubscribe)
				const i = new h(new Uint8Array())
				return (i.putVarInt(t.id), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt() }
				}))
		})(B || (B = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.Publish)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.track_alias),
					i.putBytes(p.serialize(t.namespace)),
					i.putUtf8String(t.name),
					i.putU8(t.content_exists),
					i.putBytes(g.serialize(t.group_order)),
					t.largest_location && i.putBytes(f.serialize(t.largest_location)),
					i.putU8(t.forward),
					i.putBytes(_.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return {
						id: t.getVarInt(),
						track_alias: t.getVarInt(),
						namespace: p.deserialize(t),
						name: t.getUtf8String(),
						content_exists: t.getU8(),
						group_order: g.deserialize(t),
						largest_location: f.deserialize(t),
						forward: t.getU8(),
						params: _.deserialize(t),
					}
				}))
		})(A || (A = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishOk)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putU8(t.forward),
					i.putU8(t.subscriber_priority),
					i.putBytes(g.serialize(t.group_order)),
					i.putBytes(y.serialize(t.filter_type)),
					t.start_location && i.putBytes(f.serialize(t.start_location)),
					t.end_group && i.putVarInt(t.end_group),
					i.putBytes(_.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = t.getU8(),
						r = t.getU8(),
						s = g.deserialize(t),
						n = y.deserialize(t)
					let a, o, h
					return (
						(n != y.AbsoluteStart && n != y.AbsoluteRange) || (a = f.deserialize(t)),
						n == y.AbsoluteRange && (o = t.getVarInt()),
						t.remaining > 0 && (h = _.deserialize(t)),
						{
							id: e,
							forward: i,
							subscriber_priority: r,
							group_order: s,
							filter_type: n,
							start_location: a,
							end_group: o,
							params: h,
						}
					)
				}))
		})(I || (I = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishError)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.code),
					i.putUtf8String(t.reason),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), code: t.getVarInt(), reason: t.getUtf8String() }
				}))
		})(T || (T = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishDone)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.code),
					i.putVarInt(t.stream_count),
					i.putUtf8String(t.reason),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return {
						id: t.getVarInt(),
						code: t.getVarInt(),
						stream_count: t.getVarInt(),
						reason: t.getUtf8String(),
					}
				}))
		})(z || (z = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishNamespace)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putBytes(p.serialize(t.namespace)),
					i.putBytes(_.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), namespace: p.deserialize(t), params: _.deserialize(t) }
				}))
		})(k || (k = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishNamespaceOk)
				const i = new h(new Uint8Array())
				return (i.putVarInt(t.id), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt() }
				}))
		})(C || (C = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishNamespaceError)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.code),
					i.putUtf8String(t.reason),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), code: t.getVarInt(), reason: t.getUtf8String() }
				}))
		})(P || (P = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.PublishNamespaceDone)
				const i = new h(new Uint8Array())
				return (
					i.putBytes(p.serialize(t.namespace)),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { namespace: p.deserialize(t) }
				}))
		})(L || (L = {})),
		(function (t) {
			;((t[(t.Standalone = 1)] = "Standalone"),
				(t[(t.Relative = 2)] = "Relative"),
				(t[(t.Absolute = 3)] = "Absolute"))
		})(F || (F = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putVarInt(t), e.Uint8Array)
			}),
				(t.deserialize = function (e) {
					const i = e.getVarInt()
					switch (i) {
						case 1n:
							return t.Standalone
						case 2n:
							return t.Relative
						case 3n:
							return t.Absolute
						default:
							throw new Error(`Invalid FetchType value: ${i}`)
					}
				}))
		})(F || (F = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.Fetch)
				const i = new h(new Uint8Array())
				return (
					i.putBytes(p.serialize(t.namespace)),
					i.putUtf8String(t.name),
					i.putBytes(f.serialize(t.start_location)),
					i.putBytes(f.serialize(t.end_location)),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return {
						namespace: p.deserialize(t),
						name: t.getUtf8String(),
						start_location: f.deserialize(t),
						end_location: f.deserialize(t),
					}
				}))
		})(D || (D = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.Fetch)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.start),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), start: t.getVarInt() }
				}))
		})(N || (N = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.Fetch)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putU8(t.subscriber_priority),
					i.putBytes(g.serialize(t.group_order)),
					i.putBytes(F.serialize(t.fetch_type)),
					t.standalone && i.putBytes(D.serialize(t.standalone)),
					t.joining && i.putBytes(N.serialize(t.joining)),
					i.putBytes(_.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = t.getU8(),
						r = g.deserialize(t),
						s = F.deserialize(t)
					let n, a, o
					return (
						s == F.Standalone
							? (n = D.deserialize(t))
							: (s != F.Relative && s != F.Absolute) || (a = N.deserialize(t)),
						t.remaining > 0 && (o = _.deserialize(t)),
						{
							id: e,
							subscriber_priority: i,
							group_order: r,
							fetch_type: s,
							standalone: n,
							joining: a,
							params: o,
						}
					)
				}))
		})(R || (R = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.FetchOk)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putBytes(g.serialize(t.group_order)),
					i.putU8(t.end_of_track),
					i.putBytes(f.serialize(t.end_location)),
					i.putBytes(_.serialize(t.params ?? new Map())),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getVarInt(),
						i = g.deserialize(t),
						r = t.getU8(),
						s = f.deserialize(t)
					let n
					return (
						t.remaining > 0 && (n = _.deserialize(t)),
						{ id: e, group_order: i, end_of_track: r, end_location: s, params: n }
					)
				}))
		})(M || (M = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.FetchError)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.id),
					i.putVarInt(t.code),
					i.putUtf8String(t.reason),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt(), code: t.getVarInt(), reason: t.getUtf8String() }
				}))
		})(O || (O = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.FetchCancel)
				const i = new h(new Uint8Array())
				return (i.putVarInt(t.id), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt() }
				}))
		})(V || (V = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.GoAway)
				const i = new h(new Uint8Array())
				return (i.putUtf8String(t.session_uri), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					const e = t.getUtf8String()
					if (e.length > 8192) throw new Error("session_uri too long")
					return { session_uri: e }
				}))
		})(G || (G = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.ClientSetup)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.versions.length),
					t.versions.forEach((t) => {
						i.putVarInt(t)
					}),
					i.putBytes(_.serialize(t.params)),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					console.log("client setup: payload len:", i.length, "msg len:", e.length),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getNumberVarInt(),
						i = []
					for (let r = 0; r < e; r++) i.push(t.getNumberVarInt())
					return { versions: i, params: _.deserialize(t) }
				}))
		})(H || (H = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.ServerSetup)
				const i = new h(new Uint8Array())
				return (
					i.putVarInt(t.version),
					i.putBytes(_.serialize(t.params)),
					e.putU16(i.byteLength),
					e.putBytes(i.Uint8Array),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					return { version: t.getNumberVarInt(), params: _.deserialize(t) }
				}))
		})(Y || (Y = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.MaxRequestId)
				const i = new h(new Uint8Array())
				return (i.putVarInt(t.id), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt() }
				}))
		})(j || (j = {})),
		(function (t) {
			;((t[(t.DRAFT_00 = 4278190080)] = "DRAFT_00"),
				(t[(t.DRAFT_01 = 4278190081)] = "DRAFT_01"),
				(t[(t.DRAFT_02 = 4278190082)] = "DRAFT_02"),
				(t[(t.DRAFT_03 = 4278190083)] = "DRAFT_03"),
				(t[(t.DRAFT_04 = 4278190084)] = "DRAFT_04"),
				(t[(t.DRAFT_05 = 4278190085)] = "DRAFT_05"),
				(t[(t.DRAFT_06 = 4278190086)] = "DRAFT_06"),
				(t[(t.DRAFT_07 = 4278190087)] = "DRAFT_07"),
				(t[(t.DRAFT_14 = 4278190094)] = "DRAFT_14"),
				(t[(t.KIXEL_00 = 765184)] = "KIXEL_00"),
				(t[(t.KIXEL_01 = 765185)] = "KIXEL_01"))
		})(q || (q = {})),
		(function (t) {
			;((t[(t.ReservedSetupV00 = 1)] = "ReservedSetupV00"),
				(t[(t.GoAway = 16)] = "GoAway"),
				(t[(t.MaxRequestId = 21)] = "MaxRequestId"),
				(t[(t.RequestsBlocked = 26)] = "RequestsBlocked"),
				(t[(t.SubscribeUpdate = 2)] = "SubscribeUpdate"),
				(t[(t.Subscribe = 3)] = "Subscribe"),
				(t[(t.SubscribeOk = 4)] = "SubscribeOk"),
				(t[(t.SubscribeError = 5)] = "SubscribeError"),
				(t[(t.Unsubscribe = 10)] = "Unsubscribe"),
				(t[(t.PublishDone = 11)] = "PublishDone"),
				(t[(t.Publish = 29)] = "Publish"),
				(t[(t.PublishOk = 30)] = "PublishOk"),
				(t[(t.PublishError = 31)] = "PublishError"),
				(t[(t.PublishNamespace = 6)] = "PublishNamespace"),
				(t[(t.PublishNamespaceOk = 7)] = "PublishNamespaceOk"),
				(t[(t.PublishNamespaceError = 8)] = "PublishNamespaceError"),
				(t[(t.PublishNamespaceDone = 9)] = "PublishNamespaceDone"),
				(t[(t.SubscribeNamespace = 17)] = "SubscribeNamespace"),
				(t[(t.SubscribeNamespaceOk = 18)] = "SubscribeNamespaceOk"),
				(t[(t.SubscribeNamespaceError = 19)] = "SubscribeNamespaceError"),
				(t[(t.Fetch = 22)] = "Fetch"),
				(t[(t.FetchCancel = 23)] = "FetchCancel"),
				(t[(t.FetchOk = 24)] = "FetchOk"),
				(t[(t.FetchError = 25)] = "FetchError"),
				(t[(t.ClientSetup = 32)] = "ClientSetup"),
				(t[(t.ServerSetup = 33)] = "ServerSetup"))
		})($ || ($ = {})),
		(function (t) {
			t.toString = function (e) {
				switch (e) {
					case t.ReservedSetupV00:
						return "ReservedSetupV00"
					case t.GoAway:
						return "GoAway"
					case t.MaxRequestId:
						return "MaxRequestId"
					case t.RequestsBlocked:
						return "RequestsBlocked"
					case t.SubscribeUpdate:
						return "SubscribeUpdate"
					case t.Subscribe:
						return "Subscribe"
					case t.SubscribeOk:
						return "SubscribeOk"
					case t.SubscribeError:
						return "SubscribeError"
					case t.Unsubscribe:
						return "Unsubscribe"
					case t.PublishDone:
						return "PublishDone"
					case t.Publish:
						return "Publish"
					case t.PublishOk:
						return "PublishOk"
					case t.PublishError:
						return "PublishError"
					case t.PublishNamespace:
						return "PublishNamespace"
					case t.PublishNamespaceOk:
						return "PublishNamespaceOk"
					case t.PublishNamespaceError:
						return "PublishNamespaceError"
					case t.PublishNamespaceDone:
						return "PublishNamespaceDone"
					case t.SubscribeNamespace:
						return "SubscribeNamespace"
					case t.SubscribeNamespaceOk:
						return "SubscribeNamespaceOk"
					case t.SubscribeNamespaceError:
						return "SubscribeNamespaceError"
					case t.Fetch:
						return "Fetch"
					case t.FetchCancel:
						return "FetchCancel"
					case t.FetchOk:
						return "FetchOk"
					case t.FetchError:
						return "FetchError"
					case t.ClientSetup:
						return "ClientSetup"
					case t.ServerSetup:
						return "ServerSetup"
				}
			}
		})($ || ($ = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				e.putVarInt($.RequestsBlocked)
				const i = new h(new Uint8Array())
				return (i.putVarInt(t.id), e.putU16(i.byteLength), e.putBytes(i.Uint8Array), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return { id: t.getVarInt() }
				}))
		})(K || (K = {})))
	class Q {
		decoder
		encoder
		#r = 0n
		#s
		#n = Promise.resolve()
		constructor(t) {
			;((this.decoder = new Z(t)), (this.encoder = new J(t)))
		}
		async recv() {
			return await this.decoder.message()
		}
		async send(t) {
			const e = await this.#a()
			try {
				W("sending message", t)
				const e = this.encoder.message(t)
				;(W("sending payload", e), await this.encoder.send(e))
			} finally {
				e()
			}
		}
		async #a() {
			let t
			const e = new Promise((e) => {
					t = () => e()
				}),
				i = this.#n.then(() => t)
			return ((this.#n = e), i)
		}
		nextRequestId(t = 2n) {
			const e = this.#r
			if (void 0 !== this.#s && e >= this.#s)
				throw new Error(`TOO_MANY_REQUESTS: Request ID ${e} >= remote max ${this.#s}`)
			return ((this.#r += t), e)
		}
		setRemoteMaxRequestId(t) {
			if (void 0 !== this.#s && t <= this.#s)
				throw new Error(
					`PROTOCOL_VIOLATION: MAX_REQUEST_ID must only increase (received ${t}, current ${this.#s})`,
				)
			this.#s = t
		}
	}
	class Z {
		r
		constructor(t) {
			this.r = t
		}
		async messageType() {
			return await this.r.getNumberVarInt()
		}
		async message() {
			const t = await this.messageType(),
				e = await this.r.getU16()
			e > this.r.byteLength &&
				(console.error(
					`message: ${$.toString(t)} length mismatch: advertised ${e} > ${this.r.byteLength} received`,
				),
				await this.r.waitForBytes(e))
			const i = await this.r.read(e),
				r = new o(i)
			let s
			switch (t) {
				case $.RequestsBlocked:
					s = { type: t, message: K.deserialize(r) }
					break
				case $.GoAway:
					s = { type: t, message: G.deserialize(r) }
					break
				case $.Subscribe:
					s = { type: t, message: b.deserialize(r) }
					break
				case $.SubscribeOk:
					s = { type: t, message: w.deserialize(r) }
					break
				case $.SubscribeError:
					s = { type: t, message: U.deserialize(r) }
					break
				case $.Unsubscribe:
					s = { type: t, message: B.deserialize(r) }
					break
				case $.SubscribeUpdate:
					s = { type: t, message: S.deserialize(r) }
					break
				case $.Publish:
					s = { type: t, message: A.deserialize(r) }
					break
				case $.PublishDone:
					s = { type: t, message: z.deserialize(r) }
					break
				case $.PublishOk:
					s = { type: t, message: I.deserialize(r) }
					break
				case $.PublishError:
					s = { type: t, message: T.deserialize(r) }
					break
				case $.PublishNamespace:
					s = { type: t, message: k.deserialize(r) }
					break
				case $.PublishNamespaceOk:
					s = { type: t, message: C.deserialize(r) }
					break
				case $.PublishNamespaceDone:
					s = { type: t, message: L.deserialize(r) }
					break
				case $.PublishNamespaceError:
					s = { type: t, message: P.deserialize(r) }
					break
				case $.Fetch:
					s = { type: t, message: R.deserialize(r) }
					break
				case $.FetchCancel:
					s = { type: t, message: V.deserialize(r) }
					break
				case $.FetchOk:
					s = { type: t, message: M.deserialize(r) }
					break
				case $.FetchError:
					s = { type: t, message: O.deserialize(r) }
					break
				case $.SubscribeNamespace:
					s = { type: t, message: x.deserialize(r) }
					break
				case $.SubscribeNamespaceOk:
					s = { type: t, message: v.deserialize(r) }
					break
				case $.SubscribeNamespaceError:
					s = { type: t, message: E.deserialize(r) }
					break
				case $.MaxRequestId:
					s = { type: t, message: j.deserialize(r) }
					break
				default:
					throw new Error(`unknown message kind: ${t}`)
			}
			return s
		}
	}
	let J = class {
		w
		constructor(t) {
			this.w = t
		}
		message(t) {
			const { message: e } = t
			switch (t.type) {
				case $.Subscribe:
					return b.serialize(e)
				case $.SubscribeOk:
					return w.serialize(e)
				case $.SubscribeError:
					return U.serialize(e)
				case $.SubscribeUpdate:
					return S.serialize(e)
				case $.SubscribeNamespace:
					return x.serialize(e)
				case $.SubscribeNamespaceOk:
					return v.serialize(e)
				case $.SubscribeNamespaceError:
					return E.serialize(e)
				case $.Unsubscribe:
					return B.serialize(e)
				case $.Publish:
					return A.serialize(e)
				case $.PublishDone:
					return z.serialize(e)
				case $.PublishOk:
					return I.serialize(e)
				case $.PublishError:
					return T.serialize(e)
				case $.PublishNamespace:
					return k.serialize(e)
				case $.PublishNamespaceOk:
					return C.serialize(e)
				case $.PublishNamespaceError:
					return P.serialize(e)
				case $.PublishNamespaceDone:
					return L.serialize(e)
				case $.Fetch:
					return R.serialize(e)
				case $.FetchCancel:
					return V.serialize(e)
				case $.FetchOk:
					return M.serialize(e)
				case $.FetchError:
					return O.serialize(e)
				case $.MaxRequestId:
					return j.serialize(e)
				case $.GoAway:
					return G.serialize(e)
				case $.RequestsBlocked:
					return K.serialize(e)
				default:
					throw new Error("unknown message kind in encoder")
			}
		}
		async send(t) {
			await this.w.write(t)
		}
	}
	var tt, et, it, rt, st, nt, at
	;(!(function (t) {
		t.serialize = function (t) {
			const e = new h(new Uint8Array())
			return (
				e.putBytes(it.serialize(t.type)),
				e.putVarInt(t.track_alias),
				e.putVarInt(t.group_id),
				it.hasExplicitSubgroupId(t.type) && void 0 !== t.subgroup_id && e.putVarInt(t.subgroup_id),
				e.putU8(t.publisher_priority),
				e.Uint8Array
			)
		}
	})(tt || (tt = {})),
		(function (t) {
			t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (
					e.putVarInt(t.object_id),
					t.extension_headers && e.putBytes(m.serialize(t.extension_headers)),
					e.putVarInt(t.object_payload?.length ?? 0),
					t.object_payload ? e.putBytes(t.object_payload) : e.putVarInt(t.status),
					e.Uint8Array
				)
			}
		})(et || (et = {})),
		(function (t) {
			;((t[(t.Type0x10 = 16)] = "Type0x10"),
				(t[(t.Type0x11 = 17)] = "Type0x11"),
				(t[(t.Type0x12 = 18)] = "Type0x12"),
				(t[(t.Type0x13 = 19)] = "Type0x13"),
				(t[(t.Type0x14 = 20)] = "Type0x14"),
				(t[(t.Type0x15 = 21)] = "Type0x15"),
				(t[(t.Type0x18 = 24)] = "Type0x18"),
				(t[(t.Type0x19 = 25)] = "Type0x19"),
				(t[(t.Type0x1A = 26)] = "Type0x1A"),
				(t[(t.Type0x1B = 27)] = "Type0x1B"),
				(t[(t.Type0x1C = 28)] = "Type0x1C"),
				(t[(t.Type0x1D = 29)] = "Type0x1D"))
		})(it || (it = {})),
		(function (t) {
			function e(e) {
				const i = "bigint" == typeof e ? Number(e) : e
				switch (i) {
					case t.Type0x10:
					case t.Type0x11:
					case t.Type0x12:
					case t.Type0x13:
					case t.Type0x14:
					case t.Type0x15:
					case t.Type0x18:
					case t.Type0x19:
					case t.Type0x1A:
					case t.Type0x1B:
					case t.Type0x1C:
					case t.Type0x1D:
						return i
					default:
						throw new Error(`invalid subgroup type: ${i}`)
				}
			}
			function i(e) {
				switch (e) {
					case t.Type0x14:
					case t.Type0x15:
					case t.Type0x1C:
					case t.Type0x1D:
						return !0
					default:
						return !1
				}
			}
			function r(t) {
				return i(t)
			}
			function s(e) {
				switch (e) {
					case t.Type0x10:
					case t.Type0x11:
					case t.Type0x18:
					case t.Type0x19:
						return !0
					default:
						return !1
				}
			}
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putVarInt(t), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return e(t.getNumberVarInt())
				}),
				(t.try_from = e),
				(t.isSubgroupIdPresent = i),
				(t.hasExplicitSubgroupId = r),
				(t.isSubgroupIdZero = s),
				(t.isSubgroupFirstObjectId = function (t) {
					return !(r(t) || s(t))
				}),
				(t.isExtensionPresent = function (e) {
					switch (e) {
						case t.Type0x11:
						case t.Type0x13:
						case t.Type0x15:
						case t.Type0x19:
						case t.Type0x1B:
						case t.Type0x1D:
							return !0
						default:
							return !1
					}
				}),
				(t.contains_end_of_group = function (e) {
					switch (e) {
						case t.Type0x18:
						case t.Type0x19:
						case t.Type0x1A:
						case t.Type0x1B:
						case t.Type0x1C:
						case t.Type0x1D:
							return !0
						default:
							return !1
					}
				}))
		})(it || (it = {})))
	class ot {
		header
		stream
		constructor(t, e) {
			;((this.header = t), (this.stream = e))
		}
		async write(t) {
			return this.stream.write(et.serialize(t))
		}
		async close() {
			return this.stream.close()
		}
	}
	class ht {
		header
		stream
		constructor(t, e) {
			;((this.header = t), (this.stream = e))
		}
		async read() {
			if (await this.stream.done()) return
			const t = await this.stream.getNumberVarInt()
			let e
			;(it.isExtensionPresent(this.header.type) && (e = await m.deserialize_with_reader(this.stream)),
				console.log("subgroup header", t, e, this.stream))
			let i,
				r,
				s = await this.stream.getNumberVarInt()
			return (
				console.log("subgroup read", t, s),
				0 == s ? (r = st.try_from(await this.stream.getNumberVarInt())) : (i = await this.stream.read(s)),
				console.log("read success??", t, r, e, i),
				{ object_id: t, status: r, extension_headers: e, object_payload: i }
			)
		}
		async close() {
			await this.stream.close()
		}
	}
	;(!(function (t) {
		;((t.Datagram = "Datagram"), (t.Subgroup = "Subgroup"))
	})(rt || (rt = {})),
		(function (t) {
			;((t[(t.NORMAL = 0)] = "NORMAL"),
				(t[(t.OBJECT_NULL = 1)] = "OBJECT_NULL"),
				(t[(t.GROUP_END = 3)] = "GROUP_END"),
				(t[(t.TRACK_END = 4)] = "TRACK_END"))
		})(st || (st = {})),
		(function (t) {
			function e(e) {
				const i = "bigint" == typeof e ? Number(e) : e
				switch (i) {
					case 0:
						return t.NORMAL
					case 1:
						return t.OBJECT_NULL
					case 3:
						return t.GROUP_END
					case 4:
						return t.TRACK_END
					default:
						throw new Error(`invalid object status: ${i}`)
				}
			}
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putVarInt(t), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return e(t.getNumberVarInt())
				}),
				(t.try_from = e))
		})(st || (st = {})),
		(function (t) {
			;((t[(t.Type0x0 = 0)] = "Type0x0"),
				(t[(t.Type0x1 = 1)] = "Type0x1"),
				(t[(t.Type0x2 = 2)] = "Type0x2"),
				(t[(t.Type0x3 = 3)] = "Type0x3"),
				(t[(t.Type0x4 = 4)] = "Type0x4"),
				(t[(t.Type0x5 = 5)] = "Type0x5"),
				(t[(t.Type0x6 = 6)] = "Type0x6"),
				(t[(t.Type0x7 = 7)] = "Type0x7"),
				(t[(t.Type0x20 = 32)] = "Type0x20"),
				(t[(t.Type0x21 = 33)] = "Type0x21"))
		})(nt || (nt = {})),
		(function (t) {
			function e(e) {
				const i = "bigint" == typeof e ? Number(e) : e
				switch (i) {
					case t.Type0x0:
					case t.Type0x1:
					case t.Type0x2:
					case t.Type0x3:
					case t.Type0x4:
					case t.Type0x5:
					case t.Type0x6:
					case t.Type0x7:
					case t.Type0x20:
					case t.Type0x21:
						return i
					default:
						throw new Error(`invalid object datagram type: ${i}`)
				}
			}
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (e.putVarInt(t), e.Uint8Array)
			}),
				(t.deserialize = function (t) {
					return e(t.getNumberVarInt())
				}),
				(t.try_from = e),
				(t.isEndOfGroup = function (e) {
					switch (e) {
						case t.Type0x2:
						case t.Type0x3:
						case t.Type0x6:
						case t.Type0x7:
							return !0
						default:
							return !1
					}
				}),
				(t.hasExtensions = function (e) {
					switch (e) {
						case t.Type0x1:
						case t.Type0x3:
						case t.Type0x5:
						case t.Type0x7:
						case t.Type0x21:
							return !0
						default:
							return !1
					}
				}),
				(t.hasObjectId = function (e) {
					switch (e) {
						case t.Type0x4:
						case t.Type0x5:
						case t.Type0x6:
						case t.Type0x7:
							return !1
						default:
							return !0
					}
				}),
				(t.hasStatus = function (e) {
					switch (e) {
						case t.Type0x20:
						case t.Type0x21:
							return !0
						default:
							return !1
					}
				}))
		})(nt || (nt = {})),
		(function (t) {
			;((t.serialize = function (t) {
				const e = new h(new Uint8Array())
				return (
					e.putBytes(nt.serialize(t.type)),
					e.putVarInt(t.group_id),
					t.object_id && e.putVarInt(t.object_id),
					t.object_payload
						? (e.putVarInt(t.object_payload.byteLength), e.putBytes(t.object_payload))
						: (e.putVarInt(0), e.putVarInt(t.status)),
					e.Uint8Array
				)
			}),
				(t.deserialize = function (t) {
					const e = t.getNumberVarInt(),
						i = t.getVarInt(),
						r = t.getNumberVarInt()
					let s
					nt.hasObjectId(e) && (s = t.getNumberVarInt())
					const n = t.getU8()
					let a, h, c
					if (nt.hasExtensions(e)) {
						const e = t.getNumberVarInt(),
							i = t.getBytes(e)
						a = m.deserialize_with_size(new o(i), e)
					}
					return (
						nt.hasStatus(e) ? (h = st.try_from(t.getNumberVarInt())) : (c = t.getBytes(t.remaining)),
						{
							group_id: r,
							object_id: s,
							object_payload: c,
							status: h,
							type: e,
							track_alias: i,
							publisher_priority: n,
							extension_headers: a,
						}
					)
				}))
		})(at || (at = {})))
	class ct {
		quic
		constructor(t) {
			this.quic = t
		}
		async send(t) {
			if (t.type in nt) {
				const t = this.quic.datagrams.writable,
					e = new u(t)
				return new ut(e)
			}
			{
				const e = await this.quic.createUnidirectionalStream(),
					i = new u(e),
					r = t
				return (await i.write(tt.serialize(r)), new ot(r, i))
			}
		}
		async recv() {
			console.log("Objects.recv waiting for streams")
			const t = this.quic.incomingUnidirectionalStreams.getReader()
			console.log("Objects.recv got streams", t)
			const { value: e, done: i } = await t.read()
			if ((console.log("Objects.recv got value, done", e, i), t.releaseLock(), i)) return
			const r = new c(e),
				s = await r.getNumberVarInt()
			try {
				const t = it.try_from(s)
				console.log("Objects.recv got type", t)
				const e = await r.getVarInt(),
					i = await r.getNumberVarInt()
				let n
				n = it.hasExplicitSubgroupId(t) ? await r.getNumberVarInt() : it.isSubgroupIdZero(t) ? 0 : void 0
				const a = { type: t, track_alias: e, group_id: i, subgroup_id: n, publisher_priority: await r.getU8() }
				return (console.log("Objects.recv got subgroup header", a), new ht(a, r))
			} catch (t) {
				throw (
					console.log("transport/objects.ts: unknown stream type: ", s),
					new Error(`unknown stream type: ${s}`)
				)
			}
		}
	}
	class ut {
		stream
		header = { track_alias: 0n }
		constructor(t) {
			this.stream = t
		}
		async write(t) {
			return this.stream.write(at.serialize(t))
		}
		async close() {
			return this.stream.close()
		}
	}
	function lt(t) {
		return t instanceof Error ? t : "string" == typeof t ? new Error(t) : new Error(String(t))
	}
	class pt {
		promise
		resolve
		reject
		pending = !0
		constructor() {
			this.promise = new Promise((t, e) => {
				;((this.resolve = (e) => {
					;((this.pending = !1), t(e))
				}),
					(this.reject = (t) => {
						;((this.pending = !1), e(t))
					}))
			})
		}
	}
	class dt {
		#o
		#h = new pt()
		constructor(t) {
			;((this.#h = new pt()), (this.#o = [t, this.#h.promise]))
		}
		value() {
			return this.#o
		}
		update(t) {
			if (!this.#h.pending) throw new Error("already closed")
			t instanceof Function && (t = t(this.#o[0]))
			const e = new pt()
			;((this.#o = [t, e.promise]), this.#h.resolve(this.#o), (this.#h = e))
		}
		close() {
			;((this.#o[1] = void 0), this.#h.resolve(this.#o))
		}
	}
	class ft {
		#h = new pt()
		async wait() {
			return this.#h.promise
		}
		wake() {
			if (!this.#h.pending) throw new Error("closed")
			;(this.#h.resolve(), (this.#h = new pt()))
		}
		close() {
			this.#h.resolve()
		}
	}
	class mt {
		#c
		#u = !1
		constructor(t = 1) {
			const e = new CountQueuingStrategy({ highWaterMark: t })
			this.#c = new TransformStream({}, void 0, e)
		}
		async push(t) {
			const e = this.#c.writable.getWriter()
			;(await e.write(t), e.releaseLock())
		}
		async next() {
			const t = this.#c.readable.getReader(),
				{ value: e, done: i } = await t.read()
			if ((t.releaseLock(), !i)) return e
		}
		async abort(t) {
			this.#u || (await this.#c.writable.abort(t), (this.#u = !0))
		}
		async close() {
			this.#u || (await this.#c.writable.close(), (this.#u = !0))
		}
		closed() {
			return this.#u
		}
	}
	class _t {
		#l
		#p = "none"
		#d
		#f = new Map()
		#m = new Map()
		#_ = new Map()
		#g = new mt(Number.MAX_SAFE_INTEGER)
		#y = 0n
		constructor(t, e) {
			;((this.#l = t), (this.#d = e))
		}
		async close() {
			return this.#g.close()
		}
		get activeSubscribersCount() {
			return this.#_.size
		}
		get migrationState() {
			return this.#p
		}
		set migrationState(t) {
			this.#p = t
		}
		async startMigration() {
			this.migrationState = "in_progress"
		}
		async migrationDone(t, e) {
			;((this.migrationState = "done"), (this.#l = t), (this.#d = e))
		}
		async publish_namespace(t) {
			if ("none" !== this.migrationState) throw new Error("migration in progress or going away")
			if (this.#f.has(t.join("/"))) throw new Error(`already announced: ${t.join("/")}`)
			const e = new gt(this.#l, t)
			this.#f.set(t.join("/"), e)
			const i = this.#l.nextRequestId()
			return (
				this.#m.set(i, t.join("/")),
				await this.#l.send({ type: $.PublishNamespace, message: { id: i, namespace: t } }),
				e
			)
		}
		async subscribed() {
			return await this.#g.next()
		}
		async recv(t) {
			const { type: e, message: i } = t
			switch (e) {
				case $.Subscribe:
					await this.recvSubscribe(i)
					break
				case $.Unsubscribe:
					this.recvUnsubscribe(i)
					break
				case $.PublishNamespaceOk:
					this.recvPublishNamespaceOk(i)
					break
				case $.PublishNamespaceError:
					this.recvPublishNamespaceError(i)
					break
				default:
					throw new Error("unknown control message")
			}
		}
		recvPublishNamespaceOk(t) {
			const e = this.#m.get(t.id)
			if (!e) throw new Error(`publish namespace OK for unknown announce: ${t.id}`)
			const i = this.#f.get(e)
			if (!i) throw new Error(`no active published namespace: ${e}`)
			;(i.onOk(), console.log("published namespace:", e))
		}
		recvPublishNamespaceError(t) {
			const e = this.#m.get(t.id)
			if (!e) throw new Error(`publish namespace error for unknown announce: ${t.id}`)
			const i = this.#f.get(e)
			i ? i.onError(t.code, t.reason) : console.warn(`publish namespace error for unknown announce: ${e}`)
		}
		async recvSubscribe(t) {
			if ("none" !== this.migrationState) throw new Error("migration in progress or going away")
			try {
				if (this.#_.has(t.id)) throw new Error(`duplicate subscribe for id: ${t.id}`)
				const e = this.#y++,
					i = new yt(this.#l, this.#d, t, e)
				;(this.#_.set(t.id, i), await this.#g.push(i))
			} catch (e) {
				throw (
					await this.#l.send({ type: $.SubscribeError, message: { id: t.id, code: 0n, reason: e.message } }),
					e
				)
			}
		}
		recvUnsubscribe(t) {
			const e = this.#_.get(t.id)
			if (!e) throw new Error(`unsubscribe for unknown subscribe: ${t.id}`)
			;(e.close(), this.#_.delete(t.id))
		}
	}
	class gt {
		#l
		namespace
		#b = new dt("init")
		constructor(t, e) {
			;((this.#l = t), (this.namespace = e))
		}
		async ok() {
			for (;;) {
				const [t, e] = this.#b.value()
				if ("ack" === t) return
				if (t instanceof Error) throw t
				if (!e) throw new Error("closed")
				await e
			}
		}
		async active() {
			for (;;) {
				const [t, e] = this.#b.value()
				if (t instanceof Error) throw t
				if (!e) return
				await e
			}
		}
		async close() {}
		closed() {
			const [t, e] = this.#b.value()
			return t instanceof Error || null == e
		}
		onOk() {
			this.closed() || this.#b.update("ack")
		}
		onError(t, e) {
			if (this.closed()) return
			const i = new Error(`PUBLISH_NAMESPACE_ERROR (${t})` + e ? `: ${e}` : "")
			this.#b.update(i)
		}
	}
	class yt {
		#l
		#d
		#w
		#U
		#S
		groupOrder
		namespace
		track
		#b = "init"
		constructor(t, e, i, r) {
			;((this.#l = t),
				(this.#d = e),
				(this.#w = i.id),
				(this.#U = r),
				(this.namespace = i.namespace),
				(this.track = i.name),
				(this.#S = i.subscriber_priority),
				(this.groupOrder = i.group_order))
		}
		async ack() {
			if ("init" === this.#b)
				return (
					(this.#b = "ack"),
					console.log("got subscribe req:", this.#w, "track:", this.#U, "sending subscribe ok"),
					this.#l.send({
						type: $.SubscribeOk,
						message: {
							id: this.#w,
							expires: 0n,
							group_order: this.groupOrder,
							track_alias: this.#U,
							content_exists: 0,
							params: new Map(),
						},
					})
				)
		}
		async close(t = 0n, e = "") {
			if ("closed" === this.#b) return
			const i = "ack" === this.#b
			return (
				(this.#b = "closed"),
				i
					? this.#l.send({
							type: $.PublishDone,
							message: { id: this.#w, code: t, reason: e, stream_count: 0n },
						})
					: this.#l.send({ type: $.SubscribeError, message: { id: this.#w, code: t, reason: e } })
			)
		}
		async serve(t) {
			if ("closed" === this.#b) throw new Error("subscribe closed")
			return this.#d.send({
				type: nt.Type0x0,
				track_alias: this.#U,
				group_id: 0,
				object_id: 0,
				publisher_priority: t?.priority ?? 127,
			})
		}
		async subgroup(t) {
			if ("closed" === this.#b) throw new Error("subscribe closed")
			return this.#d.send({
				type: it.Type0x10,
				track_alias: this.#U,
				group_id: t.group,
				subgroup_id: t.subgroup,
				publisher_priority: t.priority ?? 127,
			})
		}
	}
	class bt {
		#l
		#p = "none"
		#d
		#f = new Map()
		#x = new dt([])
		#_ = new Map()
		#v = new Map()
		#E = new Map()
		#B = new Map()
		constructor(t, e) {
			;((this.#l = t), (this.#d = e))
		}
		publishedNamespaces() {
			return this.#x
		}
		get activeSubscribersCount() {
			return this.#_.size
		}
		get migrationState() {
			return this.#p
		}
		set migrationState(t) {
			this.#p = t
		}
		async startMigration() {
			this.migrationState = "in_progress"
			for (const [t, e] of this.#v) await this.unsubscribe(t, !0)
		}
		async migrationDone(t, e) {
			;((this.migrationState = "done"), (this.#l = t), (this.#d = e))
		}
		async recv(t) {
			const { type: e, message: i } = t
			switch (e) {
				case $.PublishNamespace:
					await this.recvPublishNamespace(i)
					break
				case $.PublishNamespaceDone:
					this.recvPublishNamespaceDone(i)
					break
				case $.SubscribeOk:
					this.recvSubscribeOk(i)
					break
				case $.SubscribeError:
					await this.recvSubscribeError(i)
					break
				case $.PublishDone:
					await this.recvPublishDone(i)
					break
				default:
					throw new Error("unknown control message")
			}
		}
		async recvPublishNamespace(t) {
			if (this.#f.has(t.namespace.join("/")))
				throw new Error(`duplicate publish namespace for namespace: ${t.namespace.join("/")}`)
			await this.#l.send({ type: $.PublishNamespaceOk, message: { id: t.id } })
			const e = new wt(this.#l, t.namespace, t.id)
			;(this.#f.set(t.namespace.join("/"), e), this.#x.update((t) => [...t, e]))
		}
		recvPublishNamespaceDone(t) {
			throw new Error("TODO PublishNamespaceDone")
		}
		async subscribe_namespace(t) {
			if ("in_progress" === this.migrationState || "going_away" === this.migrationState)
				throw new Error("migration in progress or going away")
			const e = this.#l.nextRequestId(),
				i = { type: $.SubscribeNamespace, message: { id: e, namespace: t } }
			await this.#l.send(i)
		}
		async subscribe(t, e) {
			if ("in_progress" === this.migrationState || "going_away" === this.migrationState)
				throw new Error("migration in progress or going away")
			const i = this.#l.nextRequestId(),
				r = new Ut(this.#l, i, t, e)
			;(this.#_.set(i, r), this.#v.set(e, i))
			const s = {
				type: $.Subscribe,
				message: {
					id: i,
					namespace: t,
					name: e,
					subscriber_priority: 127,
					group_order: g.Publisher,
					filter_type: y.NextGroupStart,
					forward: 1,
					params: new Map(),
				},
			}
			return (await this.#l.send(s), W("subscribe sent", s), r)
		}
		async unsubscribe(t, e = !1) {
			const i = this.#v.get(t)
			if (void 0 !== i)
				try {
					const e = this.#_.get(i)
					if (e) {
						;(await e.close()) && this.#_.delete(i)
					}
					this.#v.delete(t)
				} catch (e) {
					console.error(`Failed to unsubscribe from track ${t}:`, e)
				}
			else console.warn(`Exception track ${t} not found in trackToIDMap.`)
		}
		recvSubscribeOk(t) {
			const e = this.#_.get(t.id)
			if (!e) throw new Error(`subscribe ok for unknown id: ${t.id}`)
			this.#E.set(t.track_alias, t.id)
			const i = this.#B.get(t.track_alias)
			;(i && (this.#B.delete(t.track_alias), i(t.id)), console.log("subscribe ok", t), e.onOk(t.track_alias))
		}
		async recvSubscribeError(t) {
			const e = this.#_.get(t.id)
			if (!e) throw new Error(`subscribe error for unknown id: ${t.id}`)
			;(this.#_.delete(t.id), this.#v.delete(e.track), await e.onError(t.code, t.reason))
		}
		async recvPublishDone(t) {
			const e = this.#_.get(t.id)
			if (!e) throw new Error(`publish done for unknown id: ${t.id}`)
			;(this.#_.delete(t.id), this.#v.delete(e.track), await e.onDone(t.code, t.stream_count, t.reason))
		}
		async recvObject(t) {
			console.log("got object on recvObject", t)
			const e = t.header.track_alias,
				i = this.#E.get(e)
			console.log("got subscriptionId", i)
			const r = async (e) => {
				const i = this.#_.get(e)
				if (!i) throw new Error(`data for unknown subscription: ${e}`)
				return (console.log("doing subscribe on data", t), i.onData(t))
			}
			if (void 0 === i)
				return (
					console.warn(`Exception track alias ${e} not found in aliasToSubscriptionMap.`),
					void this.#B.set(e, r)
				)
			await r(i)
		}
	}
	class wt {
		#l
		#w
		namespace
		#b = "init"
		constructor(t, e, i) {
			;((this.#l = t), (this.namespace = e), (this.#w = i))
		}
		async ok() {
			if ("init" === this.#b)
				return ((this.#b = "ack"), this.#l.send({ type: $.PublishNamespaceOk, message: { id: this.#w } }))
		}
		async close(t = 0n, e = "") {
			if ("closed" !== this.#b)
				return (
					(this.#b = "closed"),
					this.#l.send({ type: $.PublishNamespaceError, message: { id: this.#w, code: t, reason: e } })
				)
		}
	}
	class Ut {
		#l
		#w
		#U
		#u = !1
		namespace
		track
		#A = new mt()
		constructor(t, e, i, r) {
			;((this.#l = t), (this.#w = e), (this.namespace = i), (this.track = r))
		}
		get trackAlias() {
			return this.#U
		}
		async close(t = 0n, e = "") {
			return (
				!!this.#u ||
				((this.#u = !0),
				void 0 === this.#U || (await this.#l.send({ type: $.Unsubscribe, message: { id: this.#w } }), !1))
			)
		}
		onOk(t) {
			;(console.log("setting track alias", t), (this.#U = t))
		}
		async onDone(t, e, i) {
			console.warn("subscriber done, ID:", this.#w, "code", t, "streamCount", e, i)
		}
		async onError(t, e) {
			if (0n == t) return await this.#A.close()
			"" !== e && (e = `: ${e}`)
			const i = new Error(`SUBSCRIBE_ERROR (${t})${e}`)
			return await this.#A.abort(i)
		}
		async onData(t) {
			;(console.log("subscribe send onData", t), this.#A.closed() || (await this.#A.push(t)))
		}
		async data() {
			return await this.#A.next()
		}
	}
	class St {
		#p = "none"
		#I
		#T
		#d
		#z
		#k
		#C
		constructor(t, e, i) {
			;((this.#I = t),
				(this.#T = e),
				(this.#d = i),
				(this.#z = new _t(this.#T, this.#d)),
				(this.#k = new bt(this.#T, this.#d)),
				(this.#C = this.#P()))
		}
		onMigration = async () => {
			throw new Error("not implemented")
		}
		get migrationState() {
			return this.#p
		}
		close(t = 0, e = "") {
			this.#I.close({ closeCode: t, reason: e })
		}
		async #P() {
			await Promise.all([this.#L(), this.#F()])
		}
		async closePublisher(t = !0) {
			for (
				t && (await this.#T.send({ type: $.GoAway, message: { session_uri: "" } })),
					this.#p = "going_away",
					this.#k.migrationState = "going_away",
					this.#z.migrationState = "going_away";
				this.#z.activeSubscribersCount > 0;

			)
				await X(100)
			return (console.log("no more active publisher", this.#z), this.#z.close())
		}
		publish_namespace(t) {
			return this.#z.publish_namespace(t)
		}
		publishedNamespaces() {
			return this.#k.publishedNamespaces()
		}
		subscribe(t, e) {
			return this.#k.subscribe(t, e)
		}
		unsubscribe(t) {
			return this.#k.unsubscribe(t)
		}
		subscribed() {
			return this.#z.subscribed()
		}
		async #L() {
			try {
				for (console.log("starting control loop"); ; ) {
					const t = await this.#T.recv()
					;(console.log("control loop got msg", t), await this.#D(t))
				}
			} catch (t) {
				if ("close()" === t.message) return void console.warn("closing the connection: ", t)
				throw (console.error("Error in control stream:", t), t)
			}
		}
		async #F() {
			try {
				for (console.log("starting object loop"); ; ) {
					const t = await this.#d.recv()
					if ((console.log("object loop got obj", t), !t)) break
					await this.#k.recvObject(t)
				}
			} catch (t) {
				if ("close()" === t.message) return void console.warn("closing the connection: ", t)
				throw (console.error("Error in object stream:", t), t)
			}
		}
		async #D(t) {
			var e
			t.type === $.GoAway
				? this.#N(t.message)
				: t.type === $.MaxRequestId
					? await this.#R(t.message)
					: (e = t.type) == $.SubscribeOk ||
						  e == $.SubscribeError ||
						  e == $.PublishDone ||
						  e == $.Publish ||
						  e == $.PublishNamespace ||
						  e == $.PublishNamespaceDone
						? await this.#k.recv(t)
						: await this.#z.recv(t)
		}
		async #R(t) {
			this.#T.setRemoteMaxRequestId(t.id)
		}
		async #N(t) {
			if ((console.log("preparing for migration, got go_away message:", t), "in_progress" === this.#p))
				throw new Error("go away received twice")
			for (
				this.#p = "in_progress", await this.#k.startMigration(), await this.#z.startMigration();
				this.#k.activeSubscribersCount > 0;

			)
				await X(100)
			;(console.log("active subscribers count", this.#z.activeSubscribersCount, this.#k.activeSubscribersCount),
				(this.#p = "done"),
				this.onMigration(t.session_uri),
				console.log("should close the quic session now "))
		}
		async migrateSession(t, e, i) {
			;((this.#I = t),
				(this.#T = e),
				(this.#d = i),
				await this.#z.migrationDone(e, i),
				await this.#k.migrationDone(e, i),
				(this.#C = this.#P()))
		}
		async closed() {
			try {
				return (await this.#C, new Error("closed"))
			} catch (t) {
				return lt(t)
			}
		}
	}
	class xt {
		#M
		config
		constructor(t) {
			;((this.config = t),
				(this.#M = this.#O(t.fingerprint).catch((t) => {
					console.warn("failed to fetch fingerprint: ", t)
				})))
		}
		async createQuic(t) {
			const e = {},
				i = await this.#M
			i && (e.serverCertificateHashes = [i])
			const r = t ?? this.config.url,
				s = new WebTransport(r, e)
			return (await s.ready, s)
		}
		async prepareConnection(t) {
			const e = await t.createBidirectionalStream({ sendOrder: Number.MAX_SAFE_INTEGER }),
				i = new l(e.readable, e.writable),
				r = { versions: [q.DRAFT_14], params: new Map() },
				s = H.serialize(r)
			await i.write(s)
			const n = await this.readServerSetup(i)
			if (n.version != q.DRAFT_14) throw new Error(`unsupported server version: ${n.version}`)
			return { control: new Q(i), objects: new ct(t) }
		}
		async migrateSession(t) {
			const e = await this.createQuic(t),
				{ control: i, objects: r } = await this.prepareConnection(e)
			return { quic: e, control: i, objects: r }
		}
		async connect(t) {
			const e = await this.createQuic(t),
				{ control: i, objects: r } = await this.prepareConnection(e)
			return new St(e, i, r)
		}
		async #O(t) {
			if (!t) return
			const e = await fetch(t),
				i = await e.text(),
				r = new Uint8Array(i.length / 2)
			for (let t = 0; t < r.length; t += 1) r[t] = parseInt(i.slice(2 * t, 2 * t + 2), 16)
			return { algorithm: "sha-256", value: r }
		}
		async readServerSetup(t) {
			const e = await t.getNumberVarInt()
			if (e !== $.ServerSetup) throw new Error(`server SETUP type must be ${$.ServerSetup}, got ${e}`)
			const i = await t.getU16(),
				r = t.byteLength
			if (i !== r) throw new Error(`server SETUP message length mismatch: ${i} != ${r}`)
			const s = await t.read(i),
				n = new o(s)
			return Y.deserialize(n)
		}
		async readClientSetup(t) {
			const e = await t.getNumberVarInt()
			if (e !== $.ClientSetup) throw new Error(`client SETUP type must be ${$.ClientSetup}, got ${e}`)
			const i = await t.getU16(),
				r = t.byteLength
			if (i !== r) throw new Error(`client SETUP message length mismatch: ${i} != ${r}`)
			const s = await t.read(i),
				n = new o(s)
			return H.deserialize(n)
		}
	}
	class vt {
		id
		input
		#V
		timestamp = 0
		constructor(t) {
			this.id = t
			const e = new ByteLengthQueuingStrategy({ highWaterMark: 8e6 }),
				i = new TransformStream(
					{
						transform: (t, e) => {
							;((this.timestamp = Math.max(t.timestamp + t.duration)), e.enqueue(t.data))
						},
					},
					void 0,
					e,
				)
			;((this.input = i.writable), (this.#V = i.readable))
		}
		chunks() {
			const [t, e] = this.#V.tee()
			return ((this.#V = e), t)
		}
	}
	var Et,
		Bt = {}
	var At =
		(Et ||
			((Et = 1),
			(function (t) {
				var e,
					r,
					s =
						((e = new Date()),
						(r = 4),
						{
							setLogLevel: function (t) {
								r = t == this.debug ? 1 : t == this.info ? 2 : t == this.warn ? 3 : (this.error, 4)
							},
							debug: function (t, i) {
								;(void 0 === console.debug && (console.debug = console.log),
									1 >= r &&
										console.debug(
											"[" + s.getDurationString(new Date() - e, 1e3) + "]",
											"[" + t + "]",
											i,
										))
							},
							log: function (t, e) {
								this.debug(t.msg)
							},
							info: function (t, i) {
								2 >= r &&
									console.info("[" + s.getDurationString(new Date() - e, 1e3) + "]", "[" + t + "]", i)
							},
							warn: function (t, i) {
								3 >= r &&
									console.warn("[" + s.getDurationString(new Date() - e, 1e3) + "]", "[" + t + "]", i)
							},
							error: function (t, i) {
								4 >= r &&
									console.error(
										"[" + s.getDurationString(new Date() - e, 1e3) + "]",
										"[" + t + "]",
										i,
									)
							},
						})
				;((s.getDurationString = function (t, e) {
					var i
					function r(t, e) {
						for (var i = ("" + t).split("."); i[0].length < e; ) i[0] = "0" + i[0]
						return i.join(".")
					}
					t < 0 ? ((i = !0), (t = -t)) : (i = !1)
					var s = t / (e || 1),
						n = Math.floor(s / 3600)
					s -= 3600 * n
					var a = Math.floor(s / 60),
						o = 1e3 * (s -= 60 * a)
					return (
						(o -= 1e3 * (s = Math.floor(s))),
						(o = Math.floor(o)),
						(i ? "-" : "") + n + ":" + r(a, 2) + ":" + r(s, 2) + "." + r(o, 3)
					)
				}),
					(s.printRanges = function (t) {
						var e = t.length
						if (e > 0) {
							for (var i = "", r = 0; r < e; r++)
								(r > 0 && (i += ","),
									(i +=
										"[" +
										s.getDurationString(t.start(r)) +
										"," +
										s.getDurationString(t.end(r)) +
										"]"))
							return i
						}
						return "(empty)"
					}),
					(t.Log = s))
				var n = function (t) {
					if (!(t instanceof ArrayBuffer)) throw "Needs an array buffer"
					;((this.buffer = t), (this.dataview = new DataView(t)), (this.position = 0))
				}
				;((n.prototype.getPosition = function () {
					return this.position
				}),
					(n.prototype.getEndPosition = function () {
						return this.buffer.byteLength
					}),
					(n.prototype.getLength = function () {
						return this.buffer.byteLength
					}),
					(n.prototype.seek = function (t) {
						var e = Math.max(0, Math.min(this.buffer.byteLength, t))
						return ((this.position = isNaN(e) || !isFinite(e) ? 0 : e), !0)
					}),
					(n.prototype.isEos = function () {
						return this.getPosition() >= this.getEndPosition()
					}),
					(n.prototype.readAnyInt = function (t, e) {
						var i = 0
						if (this.position + t <= this.buffer.byteLength) {
							switch (t) {
								case 1:
									i = e ? this.dataview.getInt8(this.position) : this.dataview.getUint8(this.position)
									break
								case 2:
									i = e
										? this.dataview.getInt16(this.position)
										: this.dataview.getUint16(this.position)
									break
								case 3:
									if (e) throw "No method for reading signed 24 bits values"
									;((i = this.dataview.getUint8(this.position) << 16),
										(i |= this.dataview.getUint8(this.position + 1) << 8),
										(i |= this.dataview.getUint8(this.position + 2)))
									break
								case 4:
									i = e
										? this.dataview.getInt32(this.position)
										: this.dataview.getUint32(this.position)
									break
								case 8:
									if (e) throw "No method for reading signed 64 bits values"
									;((i = this.dataview.getUint32(this.position) << 32),
										(i |= this.dataview.getUint32(this.position + 4)))
									break
								default:
									throw "readInt method not implemented for size: " + t
							}
							return ((this.position += t), i)
						}
						throw "Not enough bytes in buffer"
					}),
					(n.prototype.readUint8 = function () {
						return this.readAnyInt(1, !1)
					}),
					(n.prototype.readUint16 = function () {
						return this.readAnyInt(2, !1)
					}),
					(n.prototype.readUint24 = function () {
						return this.readAnyInt(3, !1)
					}),
					(n.prototype.readUint32 = function () {
						return this.readAnyInt(4, !1)
					}),
					(n.prototype.readUint64 = function () {
						return this.readAnyInt(8, !1)
					}),
					(n.prototype.readString = function (t) {
						if (this.position + t <= this.buffer.byteLength) {
							for (var e = "", i = 0; i < t; i++) e += String.fromCharCode(this.readUint8())
							return e
						}
						throw "Not enough bytes in buffer"
					}),
					(n.prototype.readCString = function () {
						for (var t = []; ; ) {
							var e = this.readUint8()
							if (0 === e) break
							t.push(e)
						}
						return String.fromCharCode.apply(null, t)
					}),
					(n.prototype.readInt8 = function () {
						return this.readAnyInt(1, !0)
					}),
					(n.prototype.readInt16 = function () {
						return this.readAnyInt(2, !0)
					}),
					(n.prototype.readInt32 = function () {
						return this.readAnyInt(4, !0)
					}),
					(n.prototype.readInt64 = function () {
						return this.readAnyInt(8, !1)
					}),
					(n.prototype.readUint8Array = function (t) {
						for (var e = new Uint8Array(t), i = 0; i < t; i++) e[i] = this.readUint8()
						return e
					}),
					(n.prototype.readInt16Array = function (t) {
						for (var e = new Int16Array(t), i = 0; i < t; i++) e[i] = this.readInt16()
						return e
					}),
					(n.prototype.readUint16Array = function (t) {
						for (var e = new Int16Array(t), i = 0; i < t; i++) e[i] = this.readUint16()
						return e
					}),
					(n.prototype.readUint32Array = function (t) {
						for (var e = new Uint32Array(t), i = 0; i < t; i++) e[i] = this.readUint32()
						return e
					}),
					(n.prototype.readInt32Array = function (t) {
						for (var e = new Int32Array(t), i = 0; i < t; i++) e[i] = this.readInt32()
						return e
					}),
					(t.MP4BoxStream = n))
				var a = function (t, e, i) {
					;((this._byteOffset = e || 0),
						t instanceof ArrayBuffer
							? (this.buffer = t)
							: "object" == typeof t
								? ((this.dataView = t), e && (this._byteOffset += e))
								: (this.buffer = new ArrayBuffer(t || 0)),
						(this.position = 0),
						(this.endianness = null == i ? a.LITTLE_ENDIAN : i))
				}
				;((a.prototype = {}),
					(a.prototype.getPosition = function () {
						return this.position
					}),
					(a.prototype._realloc = function (t) {
						if (this._dynamicSize) {
							var e = this._byteOffset + this.position + t,
								i = this._buffer.byteLength
							if (e <= i) e > this._byteLength && (this._byteLength = e)
							else {
								for (i < 1 && (i = 1); e > i; ) i *= 2
								var r = new ArrayBuffer(i),
									s = new Uint8Array(this._buffer)
								;(new Uint8Array(r, 0, s.length).set(s), (this.buffer = r), (this._byteLength = e))
							}
						}
					}),
					(a.prototype._trimAlloc = function () {
						if (this._byteLength != this._buffer.byteLength) {
							var t = new ArrayBuffer(this._byteLength),
								e = new Uint8Array(t),
								i = new Uint8Array(this._buffer, 0, e.length)
							;(e.set(i), (this.buffer = t))
						}
					}),
					(a.BIG_ENDIAN = !1),
					(a.LITTLE_ENDIAN = !0),
					(a.prototype._byteLength = 0),
					Object.defineProperty(a.prototype, "byteLength", {
						get: function () {
							return this._byteLength - this._byteOffset
						},
					}),
					Object.defineProperty(a.prototype, "buffer", {
						get: function () {
							return (this._trimAlloc(), this._buffer)
						},
						set: function (t) {
							;((this._buffer = t),
								(this._dataView = new DataView(this._buffer, this._byteOffset)),
								(this._byteLength = this._buffer.byteLength))
						},
					}),
					Object.defineProperty(a.prototype, "byteOffset", {
						get: function () {
							return this._byteOffset
						},
						set: function (t) {
							;((this._byteOffset = t),
								(this._dataView = new DataView(this._buffer, this._byteOffset)),
								(this._byteLength = this._buffer.byteLength))
						},
					}),
					Object.defineProperty(a.prototype, "dataView", {
						get: function () {
							return this._dataView
						},
						set: function (t) {
							;((this._byteOffset = t.byteOffset),
								(this._buffer = t.buffer),
								(this._dataView = new DataView(this._buffer, this._byteOffset)),
								(this._byteLength = this._byteOffset + t.byteLength))
						},
					}),
					(a.prototype.seek = function (t) {
						var e = Math.max(0, Math.min(this.byteLength, t))
						this.position = isNaN(e) || !isFinite(e) ? 0 : e
					}),
					(a.prototype.isEof = function () {
						return this.position >= this._byteLength
					}),
					(a.prototype.mapUint8Array = function (t) {
						this._realloc(1 * t)
						var e = new Uint8Array(this._buffer, this.byteOffset + this.position, t)
						return ((this.position += 1 * t), e)
					}),
					(a.prototype.readInt32Array = function (t, e) {
						t = null == t ? this.byteLength - this.position / 4 : t
						var i = new Int32Array(t)
						return (
							a.memcpy(
								i.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * i.BYTES_PER_ELEMENT,
							),
							a.arrayToNative(i, null == e ? this.endianness : e),
							(this.position += i.byteLength),
							i
						)
					}),
					(a.prototype.readInt16Array = function (t, e) {
						t = null == t ? this.byteLength - this.position / 2 : t
						var i = new Int16Array(t)
						return (
							a.memcpy(
								i.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * i.BYTES_PER_ELEMENT,
							),
							a.arrayToNative(i, null == e ? this.endianness : e),
							(this.position += i.byteLength),
							i
						)
					}),
					(a.prototype.readInt8Array = function (t) {
						t = null == t ? this.byteLength - this.position : t
						var e = new Int8Array(t)
						return (
							a.memcpy(
								e.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * e.BYTES_PER_ELEMENT,
							),
							(this.position += e.byteLength),
							e
						)
					}),
					(a.prototype.readUint32Array = function (t, e) {
						t = null == t ? this.byteLength - this.position / 4 : t
						var i = new Uint32Array(t)
						return (
							a.memcpy(
								i.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * i.BYTES_PER_ELEMENT,
							),
							a.arrayToNative(i, null == e ? this.endianness : e),
							(this.position += i.byteLength),
							i
						)
					}),
					(a.prototype.readUint16Array = function (t, e) {
						t = null == t ? this.byteLength - this.position / 2 : t
						var i = new Uint16Array(t)
						return (
							a.memcpy(
								i.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * i.BYTES_PER_ELEMENT,
							),
							a.arrayToNative(i, null == e ? this.endianness : e),
							(this.position += i.byteLength),
							i
						)
					}),
					(a.prototype.readUint8Array = function (t) {
						t = null == t ? this.byteLength - this.position : t
						var e = new Uint8Array(t)
						return (
							a.memcpy(
								e.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * e.BYTES_PER_ELEMENT,
							),
							(this.position += e.byteLength),
							e
						)
					}),
					(a.prototype.readFloat64Array = function (t, e) {
						t = null == t ? this.byteLength - this.position / 8 : t
						var i = new Float64Array(t)
						return (
							a.memcpy(
								i.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * i.BYTES_PER_ELEMENT,
							),
							a.arrayToNative(i, null == e ? this.endianness : e),
							(this.position += i.byteLength),
							i
						)
					}),
					(a.prototype.readFloat32Array = function (t, e) {
						t = null == t ? this.byteLength - this.position / 4 : t
						var i = new Float32Array(t)
						return (
							a.memcpy(
								i.buffer,
								0,
								this.buffer,
								this.byteOffset + this.position,
								t * i.BYTES_PER_ELEMENT,
							),
							a.arrayToNative(i, null == e ? this.endianness : e),
							(this.position += i.byteLength),
							i
						)
					}),
					(a.prototype.readInt32 = function (t) {
						var e = this._dataView.getInt32(this.position, null == t ? this.endianness : t)
						return ((this.position += 4), e)
					}),
					(a.prototype.readInt16 = function (t) {
						var e = this._dataView.getInt16(this.position, null == t ? this.endianness : t)
						return ((this.position += 2), e)
					}),
					(a.prototype.readInt8 = function () {
						var t = this._dataView.getInt8(this.position)
						return ((this.position += 1), t)
					}),
					(a.prototype.readUint32 = function (t) {
						var e = this._dataView.getUint32(this.position, null == t ? this.endianness : t)
						return ((this.position += 4), e)
					}),
					(a.prototype.readUint16 = function (t) {
						var e = this._dataView.getUint16(this.position, null == t ? this.endianness : t)
						return ((this.position += 2), e)
					}),
					(a.prototype.readUint8 = function () {
						var t = this._dataView.getUint8(this.position)
						return ((this.position += 1), t)
					}),
					(a.prototype.readFloat32 = function (t) {
						var e = this._dataView.getFloat32(this.position, null == t ? this.endianness : t)
						return ((this.position += 4), e)
					}),
					(a.prototype.readFloat64 = function (t) {
						var e = this._dataView.getFloat64(this.position, null == t ? this.endianness : t)
						return ((this.position += 8), e)
					}),
					(a.endianness = new Int8Array(new Int16Array([1]).buffer)[0] > 0),
					(a.memcpy = function (t, e, i, r, s) {
						var n = new Uint8Array(t, e, s),
							a = new Uint8Array(i, r, s)
						n.set(a)
					}),
					(a.arrayToNative = function (t, e) {
						return e == this.endianness ? t : this.flipArrayEndianness(t)
					}),
					(a.nativeToEndian = function (t, e) {
						return this.endianness == e ? t : this.flipArrayEndianness(t)
					}),
					(a.flipArrayEndianness = function (t) {
						for (
							var e = new Uint8Array(t.buffer, t.byteOffset, t.byteLength), i = 0;
							i < t.byteLength;
							i += t.BYTES_PER_ELEMENT
						)
							for (var r = i + t.BYTES_PER_ELEMENT - 1, s = i; r > s; r--, s++) {
								var n = e[s]
								;((e[s] = e[r]), (e[r] = n))
							}
						return t
					}),
					(a.prototype.failurePosition = 0),
					(String.fromCharCodeUint8 = function (t) {
						for (var e = [], i = 0; i < t.length; i++) e[i] = t[i]
						return String.fromCharCode.apply(null, e)
					}),
					(a.prototype.readString = function (t, e) {
						return null == e || "ASCII" == e
							? String.fromCharCodeUint8.apply(null, [
									this.mapUint8Array(null == t ? this.byteLength - this.position : t),
								])
							: new TextDecoder(e).decode(this.mapUint8Array(t))
					}),
					(a.prototype.readCString = function (t) {
						var e = this.byteLength - this.position,
							i = new Uint8Array(this._buffer, this._byteOffset + this.position),
							r = e
						null != t && (r = Math.min(t, e))
						for (var s = 0; s < r && 0 !== i[s]; s++);
						var n = String.fromCharCodeUint8.apply(null, [this.mapUint8Array(s)])
						return (null != t ? (this.position += r - s) : s != e && (this.position += 1), n)
					}))
				var o = Math.pow(2, 32)
				;((a.prototype.readInt64 = function () {
					return this.readInt32() * o + this.readUint32()
				}),
					(a.prototype.readUint64 = function () {
						return this.readUint32() * o + this.readUint32()
					}),
					(a.prototype.readInt64 = function () {
						return this.readUint32() * o + this.readUint32()
					}),
					(a.prototype.readUint24 = function () {
						return (this.readUint8() << 16) + (this.readUint8() << 8) + this.readUint8()
					}),
					(t.DataStream = a),
					(a.prototype.save = function (t) {
						var e = new Blob([this.buffer])
						if (!window.URL || !URL.createObjectURL) throw "DataStream.save: Can't create object URL."
						var i = window.URL.createObjectURL(e),
							r = document.createElement("a")
						;(document.body.appendChild(r),
							r.setAttribute("href", i),
							r.setAttribute("download", t),
							r.setAttribute("target", "_self"),
							r.click(),
							window.URL.revokeObjectURL(i))
					}),
					(a.prototype._dynamicSize = !0),
					Object.defineProperty(a.prototype, "dynamicSize", {
						get: function () {
							return this._dynamicSize
						},
						set: function (t) {
							;(t || this._trimAlloc(), (this._dynamicSize = t))
						},
					}),
					(a.prototype.shift = function (t) {
						var e = new ArrayBuffer(this._byteLength - t),
							i = new Uint8Array(e),
							r = new Uint8Array(this._buffer, t, i.length)
						;(i.set(r), (this.buffer = e), (this.position -= t))
					}),
					(a.prototype.writeInt32Array = function (t, e) {
						if (
							(this._realloc(4 * t.length),
							t instanceof Int32Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapInt32Array(t.length, e))
						else for (var i = 0; i < t.length; i++) this.writeInt32(t[i], e)
					}),
					(a.prototype.writeInt16Array = function (t, e) {
						if (
							(this._realloc(2 * t.length),
							t instanceof Int16Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapInt16Array(t.length, e))
						else for (var i = 0; i < t.length; i++) this.writeInt16(t[i], e)
					}),
					(a.prototype.writeInt8Array = function (t) {
						if (
							(this._realloc(1 * t.length),
							t instanceof Int8Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapInt8Array(t.length))
						else for (var e = 0; e < t.length; e++) this.writeInt8(t[e])
					}),
					(a.prototype.writeUint32Array = function (t, e) {
						if (
							(this._realloc(4 * t.length),
							t instanceof Uint32Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapUint32Array(t.length, e))
						else for (var i = 0; i < t.length; i++) this.writeUint32(t[i], e)
					}),
					(a.prototype.writeUint16Array = function (t, e) {
						if (
							(this._realloc(2 * t.length),
							t instanceof Uint16Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapUint16Array(t.length, e))
						else for (var i = 0; i < t.length; i++) this.writeUint16(t[i], e)
					}),
					(a.prototype.writeUint8Array = function (t) {
						if (
							(this._realloc(1 * t.length),
							t instanceof Uint8Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapUint8Array(t.length))
						else for (var e = 0; e < t.length; e++) this.writeUint8(t[e])
					}),
					(a.prototype.writeFloat64Array = function (t, e) {
						if (
							(this._realloc(8 * t.length),
							t instanceof Float64Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapFloat64Array(t.length, e))
						else for (var i = 0; i < t.length; i++) this.writeFloat64(t[i], e)
					}),
					(a.prototype.writeFloat32Array = function (t, e) {
						if (
							(this._realloc(4 * t.length),
							t instanceof Float32Array && this.byteOffset + (this.position % t.BYTES_PER_ELEMENT) === 0)
						)
							(a.memcpy(this._buffer, this.byteOffset + this.position, t.buffer, 0, t.byteLength),
								this.mapFloat32Array(t.length, e))
						else for (var i = 0; i < t.length; i++) this.writeFloat32(t[i], e)
					}),
					(a.prototype.writeInt32 = function (t, e) {
						;(this._realloc(4),
							this._dataView.setInt32(this.position, t, null == e ? this.endianness : e),
							(this.position += 4))
					}),
					(a.prototype.writeInt16 = function (t, e) {
						;(this._realloc(2),
							this._dataView.setInt16(this.position, t, null == e ? this.endianness : e),
							(this.position += 2))
					}),
					(a.prototype.writeInt8 = function (t) {
						;(this._realloc(1), this._dataView.setInt8(this.position, t), (this.position += 1))
					}),
					(a.prototype.writeUint32 = function (t, e) {
						;(this._realloc(4),
							this._dataView.setUint32(this.position, t, null == e ? this.endianness : e),
							(this.position += 4))
					}),
					(a.prototype.writeUint16 = function (t, e) {
						;(this._realloc(2),
							this._dataView.setUint16(this.position, t, null == e ? this.endianness : e),
							(this.position += 2))
					}),
					(a.prototype.writeUint8 = function (t) {
						;(this._realloc(1), this._dataView.setUint8(this.position, t), (this.position += 1))
					}),
					(a.prototype.writeFloat32 = function (t, e) {
						;(this._realloc(4),
							this._dataView.setFloat32(this.position, t, null == e ? this.endianness : e),
							(this.position += 4))
					}),
					(a.prototype.writeFloat64 = function (t, e) {
						;(this._realloc(8),
							this._dataView.setFloat64(this.position, t, null == e ? this.endianness : e),
							(this.position += 8))
					}),
					(a.prototype.writeUCS2String = function (t, e, i) {
						null == i && (i = t.length)
						for (var r = 0; r < t.length && r < i; r++) this.writeUint16(t.charCodeAt(r), e)
						for (; r < i; r++) this.writeUint16(0)
					}),
					(a.prototype.writeString = function (t, e, i) {
						var r = 0
						if (null == e || "ASCII" == e)
							if (null != i) {
								var s = Math.min(t.length, i)
								for (r = 0; r < s; r++) this.writeUint8(t.charCodeAt(r))
								for (; r < i; r++) this.writeUint8(0)
							} else for (r = 0; r < t.length; r++) this.writeUint8(t.charCodeAt(r))
						else this.writeUint8Array(new TextEncoder(e).encode(t.substring(0, i)))
					}),
					(a.prototype.writeCString = function (t, e) {
						var i = 0
						if (null != e) {
							var r = Math.min(t.length, e)
							for (i = 0; i < r; i++) this.writeUint8(t.charCodeAt(i))
							for (; i < e; i++) this.writeUint8(0)
						} else {
							for (i = 0; i < t.length; i++) this.writeUint8(t.charCodeAt(i))
							this.writeUint8(0)
						}
					}),
					(a.prototype.writeStruct = function (t, e) {
						for (var i = 0; i < t.length; i += 2) {
							var r = t[i + 1]
							this.writeType(r, e[t[i]], e)
						}
					}),
					(a.prototype.writeType = function (t, e, i) {
						var r
						if ("function" == typeof t) return t(this, e)
						if ("object" == typeof t && !(t instanceof Array)) return t.set(this, e, i)
						var s = null,
							n = "ASCII",
							o = this.position
						switch (
							("string" == typeof t &&
								/:/.test(t) &&
								((r = t.split(":")), (t = r[0]), (s = parseInt(r[1]))),
							"string" == typeof t &&
								/,/.test(t) &&
								((r = t.split(",")), (t = r[0]), (n = parseInt(r[1]))),
							t)
						) {
							case "uint8":
								this.writeUint8(e)
								break
							case "int8":
								this.writeInt8(e)
								break
							case "uint16":
								this.writeUint16(e, this.endianness)
								break
							case "int16":
								this.writeInt16(e, this.endianness)
								break
							case "uint32":
								this.writeUint32(e, this.endianness)
								break
							case "int32":
								this.writeInt32(e, this.endianness)
								break
							case "float32":
								this.writeFloat32(e, this.endianness)
								break
							case "float64":
								this.writeFloat64(e, this.endianness)
								break
							case "uint16be":
								this.writeUint16(e, a.BIG_ENDIAN)
								break
							case "int16be":
								this.writeInt16(e, a.BIG_ENDIAN)
								break
							case "uint32be":
								this.writeUint32(e, a.BIG_ENDIAN)
								break
							case "int32be":
								this.writeInt32(e, a.BIG_ENDIAN)
								break
							case "float32be":
								this.writeFloat32(e, a.BIG_ENDIAN)
								break
							case "float64be":
								this.writeFloat64(e, a.BIG_ENDIAN)
								break
							case "uint16le":
								this.writeUint16(e, a.LITTLE_ENDIAN)
								break
							case "int16le":
								this.writeInt16(e, a.LITTLE_ENDIAN)
								break
							case "uint32le":
								this.writeUint32(e, a.LITTLE_ENDIAN)
								break
							case "int32le":
								this.writeInt32(e, a.LITTLE_ENDIAN)
								break
							case "float32le":
								this.writeFloat32(e, a.LITTLE_ENDIAN)
								break
							case "float64le":
								this.writeFloat64(e, a.LITTLE_ENDIAN)
								break
							case "cstring":
								this.writeCString(e, s)
								break
							case "string":
								this.writeString(e, n, s)
								break
							case "u16string":
								this.writeUCS2String(e, this.endianness, s)
								break
							case "u16stringle":
								this.writeUCS2String(e, a.LITTLE_ENDIAN, s)
								break
							case "u16stringbe":
								this.writeUCS2String(e, a.BIG_ENDIAN, s)
								break
							default:
								if (3 == t.length) {
									for (var h = t[1], c = 0; c < e.length; c++) this.writeType(h, e[c])
									break
								}
								this.writeStruct(t, e)
						}
						null != s && ((this.position = o), this._realloc(s), (this.position = o + s))
					}),
					(a.prototype.writeUint64 = function (t) {
						var e = Math.floor(t / o)
						;(this.writeUint32(e), this.writeUint32(4294967295 & t))
					}),
					(a.prototype.writeUint24 = function (t) {
						;(this.writeUint8((16711680 & t) >> 16),
							this.writeUint8((65280 & t) >> 8),
							this.writeUint8(255 & t))
					}),
					(a.prototype.adjustUint32 = function (t, e) {
						var i = this.position
						;(this.seek(t), this.writeUint32(e), this.seek(i))
					}),
					(a.prototype.mapInt32Array = function (t, e) {
						this._realloc(4 * t)
						var i = new Int32Array(this._buffer, this.byteOffset + this.position, t)
						return (a.arrayToNative(i, null == e ? this.endianness : e), (this.position += 4 * t), i)
					}),
					(a.prototype.mapInt16Array = function (t, e) {
						this._realloc(2 * t)
						var i = new Int16Array(this._buffer, this.byteOffset + this.position, t)
						return (a.arrayToNative(i, null == e ? this.endianness : e), (this.position += 2 * t), i)
					}),
					(a.prototype.mapInt8Array = function (t) {
						this._realloc(1 * t)
						var e = new Int8Array(this._buffer, this.byteOffset + this.position, t)
						return ((this.position += 1 * t), e)
					}),
					(a.prototype.mapUint32Array = function (t, e) {
						this._realloc(4 * t)
						var i = new Uint32Array(this._buffer, this.byteOffset + this.position, t)
						return (a.arrayToNative(i, null == e ? this.endianness : e), (this.position += 4 * t), i)
					}),
					(a.prototype.mapUint16Array = function (t, e) {
						this._realloc(2 * t)
						var i = new Uint16Array(this._buffer, this.byteOffset + this.position, t)
						return (a.arrayToNative(i, null == e ? this.endianness : e), (this.position += 2 * t), i)
					}),
					(a.prototype.mapFloat64Array = function (t, e) {
						this._realloc(8 * t)
						var i = new Float64Array(this._buffer, this.byteOffset + this.position, t)
						return (a.arrayToNative(i, null == e ? this.endianness : e), (this.position += 8 * t), i)
					}),
					(a.prototype.mapFloat32Array = function (t, e) {
						this._realloc(4 * t)
						var i = new Float32Array(this._buffer, this.byteOffset + this.position, t)
						return (a.arrayToNative(i, null == e ? this.endianness : e), (this.position += 4 * t), i)
					}))
				var h = function (t) {
					;((this.buffers = []), (this.bufferIndex = -1), t && (this.insertBuffer(t), (this.bufferIndex = 0)))
				}
				;(((h.prototype = new a(new ArrayBuffer(), 0, a.BIG_ENDIAN)).initialized = function () {
					var t
					return (
						this.bufferIndex > -1 ||
						(this.buffers.length > 0
							? 0 === (t = this.buffers[0]).fileStart
								? ((this.buffer = t),
									(this.bufferIndex = 0),
									s.debug("MultiBufferStream", "Stream ready for parsing"),
									!0)
								: (s.warn("MultiBufferStream", "The first buffer should have a fileStart of 0"),
									this.logBufferLevel(),
									!1)
							: (s.warn("MultiBufferStream", "No buffer to start parsing from"),
								this.logBufferLevel(),
								!1))
					)
				}),
					(ArrayBuffer.concat = function (t, e) {
						s.debug(
							"ArrayBuffer",
							"Trying to create a new buffer of size: " + (t.byteLength + e.byteLength),
						)
						var i = new Uint8Array(t.byteLength + e.byteLength)
						return (i.set(new Uint8Array(t), 0), i.set(new Uint8Array(e), t.byteLength), i.buffer)
					}),
					(h.prototype.reduceBuffer = function (t, e, i) {
						var r
						return (
							(r = new Uint8Array(i)).set(new Uint8Array(t, e, i)),
							(r.buffer.fileStart = t.fileStart + e),
							(r.buffer.usedBytes = 0),
							r.buffer
						)
					}),
					(h.prototype.insertBuffer = function (t) {
						for (var e = !0, i = 0; i < this.buffers.length; i++) {
							var r = this.buffers[i]
							if (t.fileStart <= r.fileStart) {
								if (t.fileStart === r.fileStart) {
									if (t.byteLength > r.byteLength) {
										;(this.buffers.splice(i, 1), i--)
										continue
									}
									s.warn(
										"MultiBufferStream",
										"Buffer (fileStart: " +
											t.fileStart +
											" - Length: " +
											t.byteLength +
											") already appended, ignoring",
									)
								} else
									(t.fileStart + t.byteLength <= r.fileStart ||
										(t = this.reduceBuffer(t, 0, r.fileStart - t.fileStart)),
										s.debug(
											"MultiBufferStream",
											"Appending new buffer (fileStart: " +
												t.fileStart +
												" - Length: " +
												t.byteLength +
												")",
										),
										this.buffers.splice(i, 0, t),
										0 === i && (this.buffer = t))
								e = !1
								break
							}
							if (t.fileStart < r.fileStart + r.byteLength) {
								var n = r.fileStart + r.byteLength - t.fileStart,
									a = t.byteLength - n
								if (!(a > 0)) {
									e = !1
									break
								}
								t = this.reduceBuffer(t, n, a)
							}
						}
						e &&
							(s.debug(
								"MultiBufferStream",
								"Appending new buffer (fileStart: " + t.fileStart + " - Length: " + t.byteLength + ")",
							),
							this.buffers.push(t),
							0 === i && (this.buffer = t))
					}),
					(h.prototype.logBufferLevel = function (t) {
						var e,
							i,
							r,
							n,
							a,
							o = [],
							h = ""
						for (r = 0, n = 0, e = 0; e < this.buffers.length; e++)
							((i = this.buffers[e]),
								0 === e
									? ((a = {}),
										o.push(a),
										(a.start = i.fileStart),
										(a.end = i.fileStart + i.byteLength),
										(h += "[" + a.start + "-"))
									: a.end === i.fileStart
										? (a.end = i.fileStart + i.byteLength)
										: (((a = {}).start = i.fileStart),
											(h += o[o.length - 1].end - 1 + "], [" + a.start + "-"),
											(a.end = i.fileStart + i.byteLength),
											o.push(a)),
								(r += i.usedBytes),
								(n += i.byteLength))
						o.length > 0 && (h += a.end - 1 + "]")
						var c = t ? s.info : s.debug
						0 === this.buffers.length
							? c("MultiBufferStream", "No more buffer in memory")
							: c(
									"MultiBufferStream",
									this.buffers.length +
										" stored buffer(s) (" +
										r +
										"/" +
										n +
										" bytes), continuous ranges: " +
										h,
								)
					}),
					(h.prototype.cleanBuffers = function () {
						var t, e
						for (t = 0; t < this.buffers.length; t++)
							(e = this.buffers[t]).usedBytes === e.byteLength &&
								(s.debug("MultiBufferStream", "Removing buffer #" + t), this.buffers.splice(t, 1), t--)
					}),
					(h.prototype.mergeNextBuffer = function () {
						var t
						if (this.bufferIndex + 1 < this.buffers.length) {
							if (
								(t = this.buffers[this.bufferIndex + 1]).fileStart ===
								this.buffer.fileStart + this.buffer.byteLength
							) {
								var e = this.buffer.byteLength,
									i = this.buffer.usedBytes,
									r = this.buffer.fileStart
								return (
									(this.buffers[this.bufferIndex] = ArrayBuffer.concat(this.buffer, t)),
									(this.buffer = this.buffers[this.bufferIndex]),
									this.buffers.splice(this.bufferIndex + 1, 1),
									(this.buffer.usedBytes = i),
									(this.buffer.fileStart = r),
									s.debug(
										"ISOFile",
										"Concatenating buffer for box parsing (length: " +
											e +
											"->" +
											this.buffer.byteLength +
											")",
									),
									!0
								)
							}
							return !1
						}
						return !1
					}),
					(h.prototype.findPosition = function (t, e, i) {
						var r,
							n = null,
							a = -1
						for (
							r = !0 === t ? 0 : this.bufferIndex;
							r < this.buffers.length && (n = this.buffers[r]).fileStart <= e;

						)
							((a = r),
								i &&
									(n.fileStart + n.byteLength <= e
										? (n.usedBytes = n.byteLength)
										: (n.usedBytes = e - n.fileStart),
									this.logBufferLevel()),
								r++)
						return -1 !== a && (n = this.buffers[a]).fileStart + n.byteLength >= e
							? (s.debug("MultiBufferStream", "Found position in existing buffer #" + a), a)
							: -1
					}),
					(h.prototype.findEndContiguousBuf = function (t) {
						var e,
							i,
							r,
							s = void 0 !== t ? t : this.bufferIndex
						if (((i = this.buffers[s]), this.buffers.length > s + 1))
							for (
								e = s + 1;
								e < this.buffers.length &&
								(r = this.buffers[e]).fileStart === i.fileStart + i.byteLength;
								e++
							)
								i = r
						return i.fileStart + i.byteLength
					}),
					(h.prototype.getEndFilePositionAfter = function (t) {
						var e = this.findPosition(!0, t, !1)
						return -1 !== e ? this.findEndContiguousBuf(e) : t
					}),
					(h.prototype.addUsedBytes = function (t) {
						;((this.buffer.usedBytes += t), this.logBufferLevel())
					}),
					(h.prototype.setAllUsedBytes = function () {
						;((this.buffer.usedBytes = this.buffer.byteLength), this.logBufferLevel())
					}),
					(h.prototype.seek = function (t, e, i) {
						var r
						return -1 !== (r = this.findPosition(e, t, i))
							? ((this.buffer = this.buffers[r]),
								(this.bufferIndex = r),
								(this.position = t - this.buffer.fileStart),
								s.debug(
									"MultiBufferStream",
									"Repositioning parser at buffer position: " + this.position,
								),
								!0)
							: (s.debug("MultiBufferStream", "Position " + t + " not found in buffered data"), !1)
					}),
					(h.prototype.getPosition = function () {
						if (-1 === this.bufferIndex || null === this.buffers[this.bufferIndex])
							throw "Error accessing position in the MultiBufferStream"
						return this.buffers[this.bufferIndex].fileStart + this.position
					}),
					(h.prototype.getLength = function () {
						return this.byteLength
					}),
					(h.prototype.getEndPosition = function () {
						if (-1 === this.bufferIndex || null === this.buffers[this.bufferIndex])
							throw "Error accessing position in the MultiBufferStream"
						return this.buffers[this.bufferIndex].fileStart + this.byteLength
					}),
					(t.MultiBufferStream = h))
				var c = function () {
					var t = []
					;((t[3] = "ES_Descriptor"),
						(t[4] = "DecoderConfigDescriptor"),
						(t[5] = "DecoderSpecificInfo"),
						(t[6] = "SLConfigDescriptor"),
						(this.getDescriptorName = function (e) {
							return t[e]
						}))
					var e = this,
						i = {}
					return (
						(this.parseOneDescriptor = function (e) {
							var r,
								n,
								a,
								o = 0
							for (r = e.readUint8(), a = e.readUint8(); 128 & a; )
								((o = (o << 7) + (127 & a)), (a = e.readUint8()))
							return (
								(o = (o << 7) + (127 & a)),
								s.debug(
									"MPEG4DescriptorParser",
									"Found " +
										(t[r] || "Descriptor " + r) +
										", size " +
										o +
										" at position " +
										e.getPosition(),
								),
								(n = t[r] ? new i[t[r]](o) : new i.Descriptor(o)).parse(e),
								n
							)
						}),
						(i.Descriptor = function (t, e) {
							;((this.tag = t), (this.size = e), (this.descs = []))
						}),
						(i.Descriptor.prototype.parse = function (t) {
							this.data = t.readUint8Array(this.size)
						}),
						(i.Descriptor.prototype.findDescriptor = function (t) {
							for (var e = 0; e < this.descs.length; e++) if (this.descs[e].tag == t) return this.descs[e]
							return null
						}),
						(i.Descriptor.prototype.parseRemainingDescriptors = function (t) {
							for (var i = t.position; t.position < i + this.size; ) {
								var r = e.parseOneDescriptor(t)
								this.descs.push(r)
							}
						}),
						(i.ES_Descriptor = function (t) {
							i.Descriptor.call(this, 3, t)
						}),
						(i.ES_Descriptor.prototype = new i.Descriptor()),
						(i.ES_Descriptor.prototype.parse = function (t) {
							if (
								((this.ES_ID = t.readUint16()),
								(this.flags = t.readUint8()),
								(this.size -= 3),
								128 & this.flags
									? ((this.dependsOn_ES_ID = t.readUint16()), (this.size -= 2))
									: (this.dependsOn_ES_ID = 0),
								64 & this.flags)
							) {
								var e = t.readUint8()
								;((this.URL = t.readString(e)), (this.size -= e + 1))
							} else this.URL = ""
							;(32 & this.flags
								? ((this.OCR_ES_ID = t.readUint16()), (this.size -= 2))
								: (this.OCR_ES_ID = 0),
								this.parseRemainingDescriptors(t))
						}),
						(i.ES_Descriptor.prototype.getOTI = function (t) {
							var e = this.findDescriptor(4)
							return e ? e.oti : 0
						}),
						(i.ES_Descriptor.prototype.getAudioConfig = function (t) {
							var e = this.findDescriptor(4)
							if (!e) return null
							var i = e.findDescriptor(5)
							if (i && i.data) {
								var r = (248 & i.data[0]) >> 3
								return (
									31 === r &&
										i.data.length >= 2 &&
										(r = 32 + ((7 & i.data[0]) << 3) + ((224 & i.data[1]) >> 5)),
									r
								)
							}
							return null
						}),
						(i.DecoderConfigDescriptor = function (t) {
							i.Descriptor.call(this, 4, t)
						}),
						(i.DecoderConfigDescriptor.prototype = new i.Descriptor()),
						(i.DecoderConfigDescriptor.prototype.parse = function (t) {
							;((this.oti = t.readUint8()),
								(this.streamType = t.readUint8()),
								(this.upStream = !!((this.streamType >> 1) & 1)),
								(this.streamType = this.streamType >>> 2),
								(this.bufferSize = t.readUint24()),
								(this.maxBitrate = t.readUint32()),
								(this.avgBitrate = t.readUint32()),
								(this.size -= 13),
								this.parseRemainingDescriptors(t))
						}),
						(i.DecoderSpecificInfo = function (t) {
							i.Descriptor.call(this, 5, t)
						}),
						(i.DecoderSpecificInfo.prototype = new i.Descriptor()),
						(i.SLConfigDescriptor = function (t) {
							i.Descriptor.call(this, 6, t)
						}),
						(i.SLConfigDescriptor.prototype = new i.Descriptor()),
						this
					)
				}
				t.MPEG4DescriptorParser = c
				var u = {
					ERR_INVALID_DATA: -1,
					ERR_NOT_ENOUGH_DATA: 0,
					OK: 1,
					BASIC_BOXES: [
						{ type: "mdat", name: "MediaDataBox" },
						{ type: "idat", name: "ItemDataBox" },
						{ type: "free", name: "FreeSpaceBox" },
						{ type: "skip", name: "FreeSpaceBox" },
						{ type: "meco", name: "AdditionalMetadataContainerBox" },
						{ type: "strk", name: "SubTrackBox" },
					],
					FULL_BOXES: [
						{ type: "hmhd", name: "HintMediaHeaderBox" },
						{ type: "nmhd", name: "NullMediaHeaderBox" },
						{ type: "iods", name: "ObjectDescriptorBox" },
						{ type: "xml ", name: "XMLBox" },
						{ type: "bxml", name: "BinaryXMLBox" },
						{ type: "ipro", name: "ItemProtectionBox" },
						{ type: "mere", name: "MetaboxRelationBox" },
					],
					CONTAINER_BOXES: [
						[{ type: "moov", name: "CompressedMovieBox" }, ["trak", "pssh"]],
						[{ type: "trak", name: "TrackBox" }],
						[{ type: "edts", name: "EditBox" }],
						[{ type: "mdia", name: "MediaBox" }],
						[{ type: "minf", name: "MediaInformationBox" }],
						[{ type: "dinf", name: "DataInformationBox" }],
						[{ type: "stbl", name: "SampleTableBox" }, ["sgpd", "sbgp"]],
						[{ type: "mvex", name: "MovieExtendsBox" }, ["trex"]],
						[{ type: "moof", name: "CompressedMovieFragmentBox" }, ["traf"]],
						[{ type: "traf", name: "TrackFragmentBox" }, ["trun", "sgpd", "sbgp"]],
						[{ type: "vttc", name: "VTTCueBox" }],
						[{ type: "tref", name: "TrackReferenceBox" }],
						[{ type: "iref", name: "ItemReferenceBox" }],
						[{ type: "mfra", name: "MovieFragmentRandomAccessBox" }, ["tfra"]],
						[{ type: "meco", name: "AdditionalMetadataContainerBox" }],
						[{ type: "hnti", name: "trackhintinformation" }],
						[{ type: "hinf", name: "hintstatisticsbox" }],
						[{ type: "strk", name: "SubTrackBox" }],
						[{ type: "strd", name: "SubTrackDefinitionBox" }],
						[{ type: "sinf", name: "ProtectionSchemeInfoBox" }],
						[{ type: "rinf", name: "RestrictedSchemeInfoBox" }],
						[{ type: "schi", name: "SchemeInformationBox" }],
						[{ type: "trgr", name: "TrackGroupBox" }],
						[{ type: "udta", name: "UserDataBox" }, ["kind"]],
						[{ type: "iprp", name: "ItemPropertiesBox" }, ["ipma"]],
						[{ type: "ipco", name: "ItemPropertyContainerBox" }],
						[{ type: "grpl", name: "GroupsListBox" }],
						[{ type: "j2kH", name: "J2KHeaderInfoBox" }],
						[{ type: "etyp", name: "ExtendedTypeBox" }, ["tyco"]],
					],
					boxCodes: [],
					fullBoxCodes: [],
					containerBoxCodes: [],
					sampleEntryCodes: {},
					sampleGroupEntryCodes: [],
					trackGroupTypes: [],
					UUIDBoxes: {},
					UUIDs: [],
					initialize: function () {
						;((u.FullBox.prototype = new u.Box()),
							(u.ContainerBox.prototype = new u.Box()),
							(u.SampleEntry.prototype = new u.Box()),
							(u.TrackGroupTypeBox.prototype = new u.FullBox()),
							u.BASIC_BOXES.forEach(function (t) {
								u.createBoxCtor(t.type, t.name)
							}),
							u.FULL_BOXES.forEach(function (t) {
								u.createFullBoxCtor(t.type, t.name)
							}),
							u.CONTAINER_BOXES.forEach(function (t) {
								u.createContainerBoxCtor(t[0].type, t[0].name, null, t[1])
							}))
					},
					Box: function (t, e, i, r) {
						;((this.type = t), (this.box_name = i), (this.size = e), (this.uuid = r))
					},
					FullBox: function (t, e, i, r) {
						;(u.Box.call(this, t, e, i, r), (this.flags = 0), (this.version = 0))
					},
					ContainerBox: function (t, e, i, r) {
						;(u.Box.call(this, t, e, i, r), (this.boxes = []))
					},
					SampleEntry: function (t, e, i, r) {
						;(u.ContainerBox.call(this, t, e), (this.hdr_size = i), (this.start = r))
					},
					SampleGroupEntry: function (t) {
						this.grouping_type = t
					},
					TrackGroupTypeBox: function (t, e) {
						u.FullBox.call(this, t, e)
					},
					createBoxCtor: function (t, e, i) {
						;(u.boxCodes.push(t),
							(u[t + "Box"] = function (i) {
								u.Box.call(this, t, i, e)
							}),
							(u[t + "Box"].prototype = new u.Box()),
							i && (u[t + "Box"].prototype.parse = i))
					},
					createFullBoxCtor: function (t, e, i) {
						;((u[t + "Box"] = function (i) {
							u.FullBox.call(this, t, i, e)
						}),
							(u[t + "Box"].prototype = new u.FullBox()),
							(u[t + "Box"].prototype.parse = function (t) {
								;(this.parseFullHeader(t), i && i.call(this, t))
							}))
					},
					addSubBoxArrays: function (t) {
						if (t) {
							this.subBoxNames = t
							for (var e = t.length, i = 0; i < e; i++) this[t[i] + "s"] = []
						}
					},
					createContainerBoxCtor: function (t, e, i, r) {
						;((u[t + "Box"] = function (i) {
							;(u.ContainerBox.call(this, t, i, e), u.addSubBoxArrays.call(this, r))
						}),
							(u[t + "Box"].prototype = new u.ContainerBox()),
							i && (u[t + "Box"].prototype.parse = i))
					},
					createMediaSampleEntryCtor: function (t, e, i) {
						;((u.sampleEntryCodes[t] = []),
							(u[t + "SampleEntry"] = function (t, e) {
								;(u.SampleEntry.call(this, t, e), u.addSubBoxArrays.call(this, i))
							}),
							(u[t + "SampleEntry"].prototype = new u.SampleEntry()),
							e && (u[t + "SampleEntry"].prototype.parse = e))
					},
					createSampleEntryCtor: function (t, e, i, r) {
						;(u.sampleEntryCodes[t].push(e),
							(u[e + "SampleEntry"] = function (i) {
								;(u[t + "SampleEntry"].call(this, e, i), u.addSubBoxArrays.call(this, r))
							}),
							(u[e + "SampleEntry"].prototype = new u[t + "SampleEntry"]()),
							i && (u[e + "SampleEntry"].prototype.parse = i))
					},
					createEncryptedSampleEntryCtor: function (t, e, i) {
						u.createSampleEntryCtor.call(this, t, e, i, ["sinf"])
					},
					createSampleGroupCtor: function (t, e) {
						;((u[t + "SampleGroupEntry"] = function (e) {
							u.SampleGroupEntry.call(this, t, e)
						}),
							(u[t + "SampleGroupEntry"].prototype = new u.SampleGroupEntry()),
							e && (u[t + "SampleGroupEntry"].prototype.parse = e))
					},
					createTrackGroupCtor: function (t, e) {
						;((u[t + "TrackGroupTypeBox"] = function (e) {
							u.TrackGroupTypeBox.call(this, t, e)
						}),
							(u[t + "TrackGroupTypeBox"].prototype = new u.TrackGroupTypeBox()),
							e && (u[t + "TrackGroupTypeBox"].prototype.parse = e))
					},
					createUUIDBox: function (t, e, i, r, s) {
						;(u.UUIDs.push(t),
							(u.UUIDBoxes[t] = function (s) {
								i
									? u.FullBox.call(this, "uuid", s, e, t)
									: r
										? u.ContainerBox.call(this, "uuid", s, e, t)
										: u.Box.call(this, "uuid", s, e, t)
							}),
							(u.UUIDBoxes[t].prototype = i ? new u.FullBox() : r ? new u.ContainerBox() : new u.Box()),
							s &&
								(u.UUIDBoxes[t].prototype.parse = i
									? function (t) {
											;(this.parseFullHeader(t), s && s.call(this, t))
										}
									: s))
					},
				}
				function l(t) {
					var e = "<table class='inner-table'>"
					;((e += "<thead><tr><th>length</th><th>nalu_data</th></tr></thead>"), (e += "<tbody>"))
					for (var i = 0; i < t.length; i++) {
						var r = t[i]
						;((e += "<tr>"),
							(e += "<td>" + r.length + "</td>"),
							(e += "<td>"),
							(e += r.nalu.reduce(function (t, e) {
								return t + e.toString(16).padStart(2, "0")
							}, "0x")),
							(e += "</td></tr>"))
					}
					return (e += "</tbody></table>")
				}
				function p(t, e) {
					;((this.x = t), (this.y = e))
				}
				function d(t, e) {
					;((this.bad_pixel_row = t), (this.bad_pixel_column = e))
				}
				;(u.initialize(),
					(u.TKHD_FLAG_ENABLED = 1),
					(u.TKHD_FLAG_IN_MOVIE = 2),
					(u.TKHD_FLAG_IN_PREVIEW = 4),
					(u.TFHD_FLAG_BASE_DATA_OFFSET = 1),
					(u.TFHD_FLAG_SAMPLE_DESC = 2),
					(u.TFHD_FLAG_SAMPLE_DUR = 8),
					(u.TFHD_FLAG_SAMPLE_SIZE = 16),
					(u.TFHD_FLAG_SAMPLE_FLAGS = 32),
					(u.TFHD_FLAG_DUR_EMPTY = 65536),
					(u.TFHD_FLAG_DEFAULT_BASE_IS_MOOF = 131072),
					(u.TRUN_FLAGS_DATA_OFFSET = 1),
					(u.TRUN_FLAGS_FIRST_FLAG = 4),
					(u.TRUN_FLAGS_DURATION = 256),
					(u.TRUN_FLAGS_SIZE = 512),
					(u.TRUN_FLAGS_FLAGS = 1024),
					(u.TRUN_FLAGS_CTS_OFFSET = 2048),
					(u.Box.prototype.add = function (t) {
						return this.addBox(new u[t + "Box"]())
					}),
					(u.Box.prototype.addBox = function (t) {
						return (
							this.boxes.push(t),
							this[t.type + "s"] ? this[t.type + "s"].push(t) : (this[t.type] = t),
							t
						)
					}),
					(u.Box.prototype.set = function (t, e) {
						return ((this[t] = e), this)
					}),
					(u.Box.prototype.addEntry = function (t, e) {
						var i = e || "entries"
						return (this[i] || (this[i] = []), this[i].push(t), this)
					}),
					(t.BoxParser = u),
					(u.parseUUID = function (t) {
						return u.parseHex16(t)
					}),
					(u.parseHex16 = function (t) {
						for (var e = "", i = 0; i < 16; i++) {
							var r = t.readUint8().toString(16)
							e += 1 === r.length ? "0" + r : r
						}
						return e
					}),
					(u.parseOneBox = function (t, e, i) {
						var r,
							n,
							a,
							o = t.getPosition(),
							h = 0
						if (t.getEndPosition() - o < 8)
							return (
								s.debug("BoxParser", "Not enough data in stream to parse the type and size of the box"),
								{ code: u.ERR_NOT_ENOUGH_DATA }
							)
						if (i && i < 8)
							return (
								s.debug("BoxParser", "Not enough bytes left in the parent box to parse a new box"),
								{ code: u.ERR_NOT_ENOUGH_DATA }
							)
						var c = t.readUint32(),
							l = t.readString(4),
							p = l
						if (
							(s.debug("BoxParser", "Found box of type '" + l + "' and size " + c + " at position " + o),
							(h = 8),
							"uuid" == l)
						) {
							if (t.getEndPosition() - t.getPosition() < 16 || i - h < 16)
								return (
									t.seek(o),
									s.debug("BoxParser", "Not enough bytes left in the parent box to parse a UUID box"),
									{ code: u.ERR_NOT_ENOUGH_DATA }
								)
							;((h += 16), (p = a = u.parseUUID(t)))
						}
						if (1 == c) {
							if (t.getEndPosition() - t.getPosition() < 8 || (i && i - h < 8))
								return (
									t.seek(o),
									s.warn(
										"BoxParser",
										'Not enough data in stream to parse the extended size of the "' + l + '" box',
									),
									{ code: u.ERR_NOT_ENOUGH_DATA }
								)
							;((c = t.readUint64()), (h += 8))
						} else if (0 === c)
							if (i) c = i
							else if ("mdat" !== l)
								return (
									s.error("BoxParser", "Unlimited box size not supported for type: '" + l + "'"),
									(r = new u.Box(l, c)),
									{ code: u.OK, box: r, size: r.size }
								)
						return 0 !== c && c < h
							? (s.error(
									"BoxParser",
									"Box of type " + l + " has an invalid size " + c + " (too small to be a box)",
								),
								{ code: u.ERR_NOT_ENOUGH_DATA, type: l, size: c, hdr_size: h, start: o })
							: 0 !== c && i && c > i
								? (s.error(
										"BoxParser",
										"Box of type '" +
											l +
											"' has a size " +
											c +
											" greater than its container size " +
											i,
									),
									{ code: u.ERR_NOT_ENOUGH_DATA, type: l, size: c, hdr_size: h, start: o })
								: 0 !== c && o + c > t.getEndPosition()
									? (t.seek(o),
										s.info(
											"BoxParser",
											"Not enough data in stream to parse the entire '" + l + "' box",
										),
										{ code: u.ERR_NOT_ENOUGH_DATA, type: l, size: c, hdr_size: h, start: o })
									: e
										? { code: u.OK, type: l, size: c, hdr_size: h, start: o }
										: (u[l + "Box"]
												? (r = new u[l + "Box"](c))
												: "uuid" !== l
													? (s.warn("BoxParser", "Unknown box type: '" + l + "'"),
														((r = new u.Box(l, c)).has_unparsed_data = !0))
													: u.UUIDBoxes[a]
														? (r = new u.UUIDBoxes[a](c))
														: (s.warn("BoxParser", "Unknown uuid type: '" + a + "'"),
															((r = new u.Box(l, c)).uuid = a),
															(r.has_unparsed_data = !0)),
											(r.hdr_size = h),
											(r.start = o),
											r.write === u.Box.prototype.write &&
												"mdat" !== r.type &&
												(s.info(
													"BoxParser",
													"'" +
														p +
														"' box writing not yet implemented, keeping unparsed data in memory for later write",
												),
												r.parseDataAndRewind(t)),
											r.parse(t),
											(n = t.getPosition() - (r.start + r.size)) < 0
												? (s.warn(
														"BoxParser",
														"Parsing of box '" +
															p +
															"' did not read the entire indicated box data size (missing " +
															-n +
															" bytes), seeking forward",
													),
													t.seek(r.start + r.size))
												: n > 0 &&
													(s.error(
														"BoxParser",
														"Parsing of box '" +
															p +
															"' read " +
															n +
															" more bytes than the indicated box data size, seeking backwards",
													),
													0 !== r.size && t.seek(r.start + r.size)),
											{ code: u.OK, box: r, size: r.size })
					}),
					(u.Box.prototype.parse = function (t) {
						"mdat" != this.type
							? (this.data = t.readUint8Array(this.size - this.hdr_size))
							: 0 === this.size
								? t.seek(t.getEndPosition())
								: t.seek(this.start + this.size)
					}),
					(u.Box.prototype.parseDataAndRewind = function (t) {
						;((this.data = t.readUint8Array(this.size - this.hdr_size)),
							(t.position -= this.size - this.hdr_size))
					}),
					(u.FullBox.prototype.parseDataAndRewind = function (t) {
						;(this.parseFullHeader(t),
							(this.data = t.readUint8Array(this.size - this.hdr_size)),
							(this.hdr_size -= 4),
							(t.position -= this.size - this.hdr_size))
					}),
					(u.FullBox.prototype.parseFullHeader = function (t) {
						;((this.version = t.readUint8()), (this.flags = t.readUint24()), (this.hdr_size += 4))
					}),
					(u.FullBox.prototype.parse = function (t) {
						;(this.parseFullHeader(t), (this.data = t.readUint8Array(this.size - this.hdr_size)))
					}),
					(u.ContainerBox.prototype.parse = function (t) {
						for (var e, i; t.getPosition() < this.start + this.size; ) {
							if ((e = u.parseOneBox(t, !1, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							if (
								((i = e.box),
								this.boxes.push(i),
								this.subBoxNames && -1 != this.subBoxNames.indexOf(i.type))
							)
								this[this.subBoxNames[this.subBoxNames.indexOf(i.type)] + "s"].push(i)
							else {
								var r = "uuid" !== i.type ? i.type : i.uuid
								this[r]
									? s.warn("Box of type " + r + " already stored in field of this type")
									: (this[r] = i)
							}
						}
					}),
					(u.Box.prototype.parseLanguage = function (t) {
						this.language = t.readUint16()
						var e = []
						;((e[0] = (this.language >> 10) & 31),
							(e[1] = (this.language >> 5) & 31),
							(e[2] = 31 & this.language),
							(this.languageString = String.fromCharCode(e[0] + 96, e[1] + 96, e[2] + 96)))
					}),
					(u.SAMPLE_ENTRY_TYPE_VISUAL = "Visual"),
					(u.SAMPLE_ENTRY_TYPE_AUDIO = "Audio"),
					(u.SAMPLE_ENTRY_TYPE_HINT = "Hint"),
					(u.SAMPLE_ENTRY_TYPE_METADATA = "Metadata"),
					(u.SAMPLE_ENTRY_TYPE_SUBTITLE = "Subtitle"),
					(u.SAMPLE_ENTRY_TYPE_SYSTEM = "System"),
					(u.SAMPLE_ENTRY_TYPE_TEXT = "Text"),
					(u.SampleEntry.prototype.parseHeader = function (t) {
						;(t.readUint8Array(6), (this.data_reference_index = t.readUint16()), (this.hdr_size += 8))
					}),
					(u.SampleEntry.prototype.parse = function (t) {
						;(this.parseHeader(t), (this.data = t.readUint8Array(this.size - this.hdr_size)))
					}),
					(u.SampleEntry.prototype.parseDataAndRewind = function (t) {
						;(this.parseHeader(t),
							(this.data = t.readUint8Array(this.size - this.hdr_size)),
							(this.hdr_size -= 8),
							(t.position -= this.size - this.hdr_size))
					}),
					(u.SampleEntry.prototype.parseFooter = function (t) {
						u.ContainerBox.prototype.parse.call(this, t)
					}),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_HINT),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_METADATA),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SUBTITLE),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SYSTEM),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_TEXT),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, function (t) {
						var e
						;(this.parseHeader(t),
							t.readUint16(),
							t.readUint16(),
							t.readUint32Array(3),
							(this.width = t.readUint16()),
							(this.height = t.readUint16()),
							(this.horizresolution = t.readUint32()),
							(this.vertresolution = t.readUint32()),
							t.readUint32(),
							(this.frame_count = t.readUint16()),
							(e = Math.min(31, t.readUint8())),
							(this.compressorname = t.readString(e)),
							e < 31 && t.readString(31 - e),
							(this.depth = t.readUint16()),
							t.readUint16(),
							this.parseFooter(t))
					}),
					u.createMediaSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, function (t) {
						;(this.parseHeader(t),
							t.readUint32Array(2),
							(this.channel_count = t.readUint16()),
							(this.samplesize = t.readUint16()),
							t.readUint16(),
							t.readUint16(),
							(this.samplerate = t.readUint32() / 65536),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "avc1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "avc2"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "avc3"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "avc4"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "av01"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "dav1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "hvc1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "hev1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "hvt1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "lhe1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "dvh1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "dvhe"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "vvc1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "vvi1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "vvs1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "vvcN"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "vp08"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "vp09"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "avs3"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "j2ki"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "mjp2"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "mjpg"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "uncv"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "mp4a"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "ac-3"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "ac-4"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "ec-3"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "Opus"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "mha1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "mha2"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "mhm1"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "mhm2"),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "fLaC"),
					u.createEncryptedSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_VISUAL, "encv"),
					u.createEncryptedSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_AUDIO, "enca"),
					u.createEncryptedSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SUBTITLE, "encu"),
					u.createEncryptedSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SYSTEM, "encs"),
					u.createEncryptedSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_TEXT, "enct"),
					u.createEncryptedSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_METADATA, "encm"),
					u.createBoxCtor("a1lx", "AV1LayeredImageIndexingProperty", function (t) {
						var e = 16 * (1 + (1 & t.readUint8()))
						this.layer_size = []
						for (var i = 0; i < 3; i++) this.layer_size[i] = 16 == e ? t.readUint16() : t.readUint32()
					}),
					u.createBoxCtor("a1op", "OperatingPointSelectorProperty", function (t) {
						this.op_index = t.readUint8()
					}),
					u.createFullBoxCtor("auxC", "AuxiliaryTypeProperty", function (t) {
						this.aux_type = t.readCString()
						var e = this.size - this.hdr_size - (this.aux_type.length + 1)
						this.aux_subtype = t.readUint8Array(e)
					}),
					u.createBoxCtor("av1C", "AV1CodecConfigurationBox", function (t) {
						var e = t.readUint8()
						if (1 & ~(e >> 7)) s.error("av1C marker problem")
						else if (((this.version = 127 & e), 1 === this.version))
							if (
								((e = t.readUint8()),
								(this.seq_profile = (e >> 5) & 7),
								(this.seq_level_idx_0 = 31 & e),
								(e = t.readUint8()),
								(this.seq_tier_0 = (e >> 7) & 1),
								(this.high_bitdepth = (e >> 6) & 1),
								(this.twelve_bit = (e >> 5) & 1),
								(this.monochrome = (e >> 4) & 1),
								(this.chroma_subsampling_x = (e >> 3) & 1),
								(this.chroma_subsampling_y = (e >> 2) & 1),
								(this.chroma_sample_position = 3 & e),
								(e = t.readUint8()),
								(this.reserved_1 = (e >> 5) & 7),
								0 === this.reserved_1)
							) {
								if (
									((this.initial_presentation_delay_present = (e >> 4) & 1),
									1 === this.initial_presentation_delay_present)
								)
									this.initial_presentation_delay_minus_one = 15 & e
								else if (((this.reserved_2 = 15 & e), 0 !== this.reserved_2))
									return void s.error("av1C reserved_2 parsing problem")
								var i = this.size - this.hdr_size - 4
								this.configOBUs = t.readUint8Array(i)
							} else s.error("av1C reserved_1 parsing problem")
						else s.error("av1C version " + this.version + " not supported")
					}),
					u.createBoxCtor("avcC", "AVCConfigurationBox", function (t) {
						var e, i
						for (
							this.configurationVersion = t.readUint8(),
								this.AVCProfileIndication = t.readUint8(),
								this.profile_compatibility = t.readUint8(),
								this.AVCLevelIndication = t.readUint8(),
								this.lengthSizeMinusOne = 3 & t.readUint8(),
								this.nb_SPS_nalus = 31 & t.readUint8(),
								i = this.size - this.hdr_size - 6,
								this.SPS = [],
								this.SPS.toString = function () {
									return l(this)
								},
								e = 0;
							e < this.nb_SPS_nalus;
							e++
						)
							((this.SPS[e] = {}),
								(this.SPS[e].length = t.readUint16()),
								(this.SPS[e].nalu = t.readUint8Array(this.SPS[e].length)),
								(i -= 2 + this.SPS[e].length))
						for (
							this.nb_PPS_nalus = t.readUint8(),
								i--,
								this.PPS = [],
								this.PPS.toString = function () {
									return l(this)
								},
								e = 0;
							e < this.nb_PPS_nalus;
							e++
						)
							((this.PPS[e] = {}),
								(this.PPS[e].length = t.readUint16()),
								(this.PPS[e].nalu = t.readUint8Array(this.PPS[e].length)),
								(i -= 2 + this.PPS[e].length))
						i > 0 && (this.ext = t.readUint8Array(i))
					}),
					u.createBoxCtor("btrt", "BitRateBox", function (t) {
						;((this.bufferSizeDB = t.readUint32()),
							(this.maxBitrate = t.readUint32()),
							(this.avgBitrate = t.readUint32()))
					}),
					u.createFullBoxCtor("ccst", "CodingConstraintsBox", function (t) {
						var e = t.readUint8()
						;((this.all_ref_pics_intra = !(128 & ~e)),
							(this.intra_pred_used = !(64 & ~e)),
							(this.max_ref_per_pic = (63 & e) >> 2),
							t.readUint24())
					}),
					u.createBoxCtor("cdef", "ComponentDefinitionBox", function (t) {
						var e
						for (
							this.channel_count = t.readUint16(),
								this.channel_indexes = [],
								this.channel_types = [],
								this.channel_associations = [],
								e = 0;
							e < this.channel_count;
							e++
						)
							(this.channel_indexes.push(t.readUint16()),
								this.channel_types.push(t.readUint16()),
								this.channel_associations.push(t.readUint16()))
					}),
					u.createBoxCtor("clap", "CleanApertureBox", function (t) {
						;((this.cleanApertureWidthN = t.readUint32()),
							(this.cleanApertureWidthD = t.readUint32()),
							(this.cleanApertureHeightN = t.readUint32()),
							(this.cleanApertureHeightD = t.readUint32()),
							(this.horizOffN = t.readUint32()),
							(this.horizOffD = t.readUint32()),
							(this.vertOffN = t.readUint32()),
							(this.vertOffD = t.readUint32()))
					}),
					u.createBoxCtor("clli", "ContentLightLevelBox", function (t) {
						;((this.max_content_light_level = t.readUint16()),
							(this.max_pic_average_light_level = t.readUint16()))
					}),
					u.createFullBoxCtor("cmex", "CameraExtrinsicMatrixProperty", function (t) {
						;(1 & this.flags && (this.pos_x = t.readInt32()),
							2 & this.flags && (this.pos_y = t.readInt32()),
							4 & this.flags && (this.pos_z = t.readInt32()),
							8 & this.flags &&
								(0 == this.version
									? 16 & this.flags
										? ((this.quat_x = t.readInt32()),
											(this.quat_y = t.readInt32()),
											(this.quat_z = t.readInt32()))
										: ((this.quat_x = t.readInt16()),
											(this.quat_y = t.readInt16()),
											(this.quat_z = t.readInt16()))
									: this.version),
							32 & this.flags && (this.id = t.readUint32()))
					}),
					u.createFullBoxCtor("cmin", "CameraIntrinsicMatrixProperty", function (t) {
						;((this.focal_length_x = t.readInt32()),
							(this.principal_point_x = t.readInt32()),
							(this.principal_point_y = t.readInt32()),
							1 & this.flags &&
								((this.focal_length_y = t.readInt32()), (this.skew_factor = t.readInt32())))
					}),
					u.createBoxCtor("cmpd", "ComponentDefinitionBox", function (t) {
						for (
							this.component_count = t.readUint32(),
								this.component_types = [],
								this.component_type_urls = [],
								i = 0;
							i < this.component_count;
							i++
						) {
							var e = t.readUint16()
							;(this.component_types.push(e),
								e >= 32768 && this.component_type_urls.push(t.readCString()))
						}
					}),
					u.createFullBoxCtor("co64", "ChunkLargeOffsetBox", function (t) {
						var e, i
						if (((e = t.readUint32()), (this.chunk_offsets = []), 0 === this.version))
							for (i = 0; i < e; i++) this.chunk_offsets.push(t.readUint64())
					}),
					u.createFullBoxCtor("CoLL", "ContentLightLevelBox", function (t) {
						;((this.maxCLL = t.readUint16()), (this.maxFALL = t.readUint16()))
					}),
					u.createBoxCtor("colr", "ColourInformationBox", function (t) {
						if (((this.colour_type = t.readString(4)), "nclx" === this.colour_type)) {
							;((this.colour_primaries = t.readUint16()),
								(this.transfer_characteristics = t.readUint16()),
								(this.matrix_coefficients = t.readUint16()))
							var e = t.readUint8()
							this.full_range_flag = e >> 7
						} else
							("rICC" === this.colour_type || "prof" === this.colour_type) &&
								(this.ICC_profile = t.readUint8Array(this.size - 4))
					}),
					u.createFullBoxCtor("cprt", "CopyrightBox", function (t) {
						;(this.parseLanguage(t), (this.notice = t.readCString()))
					}),
					u.createFullBoxCtor("cslg", "CompositionToDecodeBox", function (t) {
						0 === this.version &&
							((this.compositionToDTSShift = t.readInt32()),
							(this.leastDecodeToDisplayDelta = t.readInt32()),
							(this.greatestDecodeToDisplayDelta = t.readInt32()),
							(this.compositionStartTime = t.readInt32()),
							(this.compositionEndTime = t.readInt32()))
					}),
					u.createFullBoxCtor("ctts", "CompositionOffsetBox", function (t) {
						var e, i
						if (
							((e = t.readUint32()),
							(this.sample_counts = []),
							(this.sample_offsets = []),
							0 === this.version)
						)
							for (i = 0; i < e; i++) {
								this.sample_counts.push(t.readUint32())
								var r = t.readInt32()
								;(r < 0 && s.warn("BoxParser", "ctts box uses negative values without using version 1"),
									this.sample_offsets.push(r))
							}
						else if (1 == this.version)
							for (i = 0; i < e; i++)
								(this.sample_counts.push(t.readUint32()), this.sample_offsets.push(t.readInt32()))
					}),
					u.createBoxCtor("dac3", "AC3SpecificBox", function (t) {
						var e = t.readUint8(),
							i = t.readUint8(),
							r = t.readUint8()
						;((this.fscod = e >> 6),
							(this.bsid = (e >> 1) & 31),
							(this.bsmod = ((1 & e) << 2) | ((i >> 6) & 3)),
							(this.acmod = (i >> 3) & 7),
							(this.lfeon = (i >> 2) & 1),
							(this.bit_rate_code = (3 & i) | ((r >> 5) & 7)))
					}),
					u.createBoxCtor("dec3", "EC3SpecificBox", function (t) {
						var e = t.readUint16()
						;((this.data_rate = e >> 3), (this.num_ind_sub = 7 & e), (this.ind_subs = []))
						for (var i = 0; i < this.num_ind_sub + 1; i++) {
							var r = {}
							this.ind_subs.push(r)
							var s = t.readUint8(),
								n = t.readUint8(),
								a = t.readUint8()
							;((r.fscod = s >> 6),
								(r.bsid = (s >> 1) & 31),
								(r.bsmod = ((1 & s) << 4) | ((n >> 4) & 15)),
								(r.acmod = (n >> 1) & 7),
								(r.lfeon = 1 & n),
								(r.num_dep_sub = (a >> 1) & 15),
								r.num_dep_sub > 0 && (r.chan_loc = ((1 & a) << 8) | t.readUint8()))
						}
					}),
					u.createFullBoxCtor("dfLa", "FLACSpecificBox", function (t) {
						for (
							var e = [],
								i = [
									"STREAMINFO",
									"PADDING",
									"APPLICATION",
									"SEEKTABLE",
									"VORBIS_COMMENT",
									"CUESHEET",
									"PICTURE",
									"RESERVED",
								];
							;

						) {
							var r = t.readUint8(),
								s = Math.min(127 & r, i.length - 1)
							if (
								(s
									? t.readUint8Array(t.readUint24())
									: (t.readUint8Array(13),
										(this.samplerate = t.readUint32() >> 12),
										t.readUint8Array(20)),
								e.push(i[s]),
								128 & r)
							)
								break
						}
						this.numMetadataBlocks = e.length + " (" + e.join(", ") + ")"
					}),
					u.createBoxCtor("dimm", "hintimmediateBytesSent", function (t) {
						this.bytessent = t.readUint64()
					}),
					u.createBoxCtor("dmax", "hintlongestpacket", function (t) {
						this.time = t.readUint32()
					}),
					u.createBoxCtor("dmed", "hintmediaBytesSent", function (t) {
						this.bytessent = t.readUint64()
					}),
					u.createBoxCtor("dOps", "OpusSpecificBox", function (t) {
						if (
							((this.Version = t.readUint8()),
							(this.OutputChannelCount = t.readUint8()),
							(this.PreSkip = t.readUint16()),
							(this.InputSampleRate = t.readUint32()),
							(this.OutputGain = t.readInt16()),
							(this.ChannelMappingFamily = t.readUint8()),
							0 !== this.ChannelMappingFamily)
						) {
							;((this.StreamCount = t.readUint8()),
								(this.CoupledCount = t.readUint8()),
								(this.ChannelMapping = []))
							for (var e = 0; e < this.OutputChannelCount; e++) this.ChannelMapping[e] = t.readUint8()
						}
					}),
					u.createFullBoxCtor("dref", "DataReferenceBox", function (t) {
						var e, i
						this.entries = []
						for (var r = t.readUint32(), s = 0; s < r; s++) {
							if ((e = u.parseOneBox(t, !1, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							;((i = e.box), this.entries.push(i))
						}
					}),
					u.createBoxCtor("drep", "hintrepeatedBytesSent", function (t) {
						this.bytessent = t.readUint64()
					}),
					u.createFullBoxCtor("elng", "ExtendedLanguageBox", function (t) {
						this.extended_language = t.readString(this.size - this.hdr_size)
					}),
					u.createFullBoxCtor("elst", "EditListBox", function (t) {
						this.entries = []
						for (var e = t.readUint32(), i = 0; i < e; i++) {
							var r = {}
							;(this.entries.push(r),
								1 === this.version
									? ((r.segment_duration = t.readUint64()), (r.media_time = t.readInt64()))
									: ((r.segment_duration = t.readUint32()), (r.media_time = t.readInt32())),
								(r.media_rate_integer = t.readInt16()),
								(r.media_rate_fraction = t.readInt16()))
						}
					}),
					u.createFullBoxCtor("emsg", "EventMessageBox", function (t) {
						1 == this.version
							? ((this.timescale = t.readUint32()),
								(this.presentation_time = t.readUint64()),
								(this.event_duration = t.readUint32()),
								(this.id = t.readUint32()),
								(this.scheme_id_uri = t.readCString()),
								(this.value = t.readCString()))
							: ((this.scheme_id_uri = t.readCString()),
								(this.value = t.readCString()),
								(this.timescale = t.readUint32()),
								(this.presentation_time_delta = t.readUint32()),
								(this.event_duration = t.readUint32()),
								(this.id = t.readUint32()))
						var e =
							this.size - this.hdr_size - (16 + (this.scheme_id_uri.length + 1) + (this.value.length + 1))
						;(1 == this.version && (e -= 4), (this.message_data = t.readUint8Array(e)))
					}),
					(u.createEntityToGroupCtor = function (t, e) {
						;((u[t + "Box"] = function (e) {
							u.FullBox.call(this, t, e)
						}),
							(u[t + "Box"].prototype = new u.FullBox()),
							(u[t + "Box"].prototype.parse = function (t) {
								if ((this.parseFullHeader(t), e)) e.call(this, t)
								else
									for (
										this.group_id = t.readUint32(),
											this.num_entities_in_group = t.readUint32(),
											this.entity_ids = [],
											i = 0;
										i < this.num_entities_in_group;
										i++
									) {
										var r = t.readUint32()
										this.entity_ids.push(r)
									}
							}))
					}),
					u.createEntityToGroupCtor("aebr"),
					u.createEntityToGroupCtor("afbr"),
					u.createEntityToGroupCtor("albc"),
					u.createEntityToGroupCtor("altr"),
					u.createEntityToGroupCtor("brst"),
					u.createEntityToGroupCtor("dobr"),
					u.createEntityToGroupCtor("eqiv"),
					u.createEntityToGroupCtor("favc"),
					u.createEntityToGroupCtor("fobr"),
					u.createEntityToGroupCtor("iaug"),
					u.createEntityToGroupCtor("pano"),
					u.createEntityToGroupCtor("slid"),
					u.createEntityToGroupCtor("ster"),
					u.createEntityToGroupCtor("tsyn"),
					u.createEntityToGroupCtor("wbbr"),
					u.createEntityToGroupCtor("prgr"),
					u.createEntityToGroupCtor("pymd", function (t) {
						;((this.group_id = t.readUint32()),
							(this.num_entities_in_group = t.readUint32()),
							(this.entity_ids = []))
						for (var e = 0; e < this.num_entities_in_group; e++) {
							var i = t.readUint32()
							this.entity_ids.push(i)
						}
						for (
							this.tile_size_x = t.readUint16(),
								this.tile_size_y = t.readUint16(),
								this.layer_binning = [],
								this.tiles_in_layer_column_minus1 = [],
								this.tiles_in_layer_row_minus1 = [],
								e = 0;
							e < this.num_entities_in_group;
							e++
						)
							((this.layer_binning[e] = t.readUint16()),
								(this.tiles_in_layer_row_minus1[e] = t.readUint16()),
								(this.tiles_in_layer_column_minus1[e] = t.readUint16()))
					}),
					u.createFullBoxCtor("esds", "ElementaryStreamDescriptorBox", function (t) {
						var e = t.readUint8Array(this.size - this.hdr_size)
						if (void 0 !== c) {
							var i = new c()
							this.esd = i.parseOneDescriptor(new a(e.buffer, 0, a.BIG_ENDIAN))
						}
					}),
					u.createBoxCtor("fiel", "FieldHandlingBox", function (t) {
						;((this.fieldCount = t.readUint8()), (this.fieldOrdering = t.readUint8()))
					}),
					u.createBoxCtor("frma", "OriginalFormatBox", function (t) {
						this.data_format = t.readString(4)
					}),
					u.createBoxCtor("ftyp", "FileTypeBox", function (t) {
						var e = this.size - this.hdr_size
						;((this.major_brand = t.readString(4)),
							(this.minor_version = t.readUint32()),
							(e -= 8),
							(this.compatible_brands = []))
						for (var i = 0; e >= 4; ) ((this.compatible_brands[i] = t.readString(4)), (e -= 4), i++)
					}),
					u.createFullBoxCtor("hdlr", "HandlerBox", function (t) {
						0 === this.version &&
							(t.readUint32(),
							(this.handler = t.readString(4)),
							t.readUint32Array(3),
							(this.name = t.readString(this.size - this.hdr_size - 20)),
							"\0" === this.name[this.name.length - 1] && (this.name = this.name.slice(0, -1)))
					}),
					u.createBoxCtor("hvcC", "HEVCConfigurationBox", function (t) {
						var e, i, r, s
						;((this.configurationVersion = t.readUint8()),
							(s = t.readUint8()),
							(this.general_profile_space = s >> 6),
							(this.general_tier_flag = (32 & s) >> 5),
							(this.general_profile_idc = 31 & s),
							(this.general_profile_compatibility = t.readUint32()),
							(this.general_constraint_indicator = t.readUint8Array(6)),
							(this.general_level_idc = t.readUint8()),
							(this.min_spatial_segmentation_idc = 4095 & t.readUint16()),
							(this.parallelismType = 3 & t.readUint8()),
							(this.chroma_format_idc = 3 & t.readUint8()),
							(this.bit_depth_luma_minus8 = 7 & t.readUint8()),
							(this.bit_depth_chroma_minus8 = 7 & t.readUint8()),
							(this.avgFrameRate = t.readUint16()),
							(s = t.readUint8()),
							(this.constantFrameRate = s >> 6),
							(this.numTemporalLayers = (13 & s) >> 3),
							(this.temporalIdNested = (4 & s) >> 2),
							(this.lengthSizeMinusOne = 3 & s),
							(this.nalu_arrays = []),
							(this.nalu_arrays.toString = function () {
								var t = "<table class='inner-table'>"
								;((t +=
									"<thead><tr><th>completeness</th><th>nalu_type</th><th>nalu_data</th></tr></thead>"),
									(t += "<tbody>"))
								for (var e = 0; e < this.length; e++) {
									var i = this[e]
									;((t += "<tr>"),
										(t += "<td rowspan='" + i.length + "'>" + i.completeness + "</td>"),
										(t += "<td rowspan='" + i.length + "'>" + i.nalu_type + "</td>"))
									for (var r = 0; r < i.length; r++)
										(0 !== r && (t += "<tr>"),
											(t += "<td>"),
											(t += i[r].data.reduce(function (t, e) {
												return t + e.toString(16).padStart(2, "0")
											}, "0x")),
											(t += "</td></tr>"))
								}
								return (t += "</tbody></table>")
							}))
						var n = t.readUint8()
						for (e = 0; e < n; e++) {
							var a = []
							;(this.nalu_arrays.push(a),
								(s = t.readUint8()),
								(a.completeness = (128 & s) >> 7),
								(a.nalu_type = 63 & s))
							var o = t.readUint16()
							for (i = 0; i < o; i++) {
								var h = {}
								;(a.push(h), (r = t.readUint16()), (h.data = t.readUint8Array(r)))
							}
						}
					}),
					u.createFullBoxCtor("iinf", "ItemInfoBox", function (t) {
						var e
						;(0 === this.version
							? (this.entry_count = t.readUint16())
							: (this.entry_count = t.readUint32()),
							(this.item_infos = []))
						for (var i = 0; i < this.entry_count; i++) {
							if ((e = u.parseOneBox(t, !1, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							;("infe" !== e.box.type && s.error("BoxParser", "Expected 'infe' box, got " + e.box.type),
								(this.item_infos[i] = e.box))
						}
					}),
					u.createFullBoxCtor("iloc", "ItemLocationBox", function (t) {
						var e
						;((e = t.readUint8()),
							(this.offset_size = (e >> 4) & 15),
							(this.length_size = 15 & e),
							(e = t.readUint8()),
							(this.base_offset_size = (e >> 4) & 15),
							1 === this.version || 2 === this.version
								? (this.index_size = 15 & e)
								: (this.index_size = 0),
							(this.items = []))
						var i = 0
						if (this.version < 2) i = t.readUint16()
						else {
							if (2 !== this.version) throw "version of iloc box not supported"
							i = t.readUint32()
						}
						for (var r = 0; r < i; r++) {
							var s = {}
							if ((this.items.push(s), this.version < 2)) s.item_ID = t.readUint16()
							else {
								if (2 !== this.version) throw "version of iloc box not supported"
								s.item_ID = t.readUint32()
							}
							switch (
								(1 === this.version || 2 === this.version
									? (s.construction_method = 15 & t.readUint16())
									: (s.construction_method = 0),
								(s.data_reference_index = t.readUint16()),
								this.base_offset_size)
							) {
								case 0:
									s.base_offset = 0
									break
								case 4:
									s.base_offset = t.readUint32()
									break
								case 8:
									s.base_offset = t.readUint64()
									break
								default:
									throw "Error reading base offset size"
							}
							var n = t.readUint16()
							s.extents = []
							for (var a = 0; a < n; a++) {
								var o = {}
								if ((s.extents.push(o), 1 === this.version || 2 === this.version))
									switch (this.index_size) {
										case 0:
											o.extent_index = 0
											break
										case 4:
											o.extent_index = t.readUint32()
											break
										case 8:
											o.extent_index = t.readUint64()
											break
										default:
											throw "Error reading extent index"
									}
								switch (this.offset_size) {
									case 0:
										o.extent_offset = 0
										break
									case 4:
										o.extent_offset = t.readUint32()
										break
									case 8:
										o.extent_offset = t.readUint64()
										break
									default:
										throw "Error reading extent index"
								}
								switch (this.length_size) {
									case 0:
										o.extent_length = 0
										break
									case 4:
										o.extent_length = t.readUint32()
										break
									case 8:
										o.extent_length = t.readUint64()
										break
									default:
										throw "Error reading extent index"
								}
							}
						}
					}),
					u.createBoxCtor("imir", "ImageMirror", function (t) {
						var e = t.readUint8()
						;((this.reserved = e >> 7), (this.axis = 1 & e))
					}),
					u.createFullBoxCtor("infe", "ItemInfoEntry", function (t) {
						if (
							((0 !== this.version && 1 !== this.version) ||
								((this.item_ID = t.readUint16()),
								(this.item_protection_index = t.readUint16()),
								(this.item_name = t.readCString()),
								(this.content_type = t.readCString()),
								(this.content_encoding = t.readCString())),
							1 === this.version)
						)
							return (
								(this.extension_type = t.readString(4)),
								s.warn("BoxParser", "Cannot parse extension type"),
								void t.seek(this.start + this.size)
							)
						this.version >= 2 &&
							(2 === this.version
								? (this.item_ID = t.readUint16())
								: 3 === this.version && (this.item_ID = t.readUint32()),
							(this.item_protection_index = t.readUint16()),
							(this.item_type = t.readString(4)),
							(this.item_name = t.readCString()),
							"mime" === this.item_type
								? ((this.content_type = t.readCString()), (this.content_encoding = t.readCString()))
								: "uri " === this.item_type && (this.item_uri_type = t.readCString()))
					}),
					u.createFullBoxCtor("ipma", "ItemPropertyAssociationBox", function (t) {
						var e, i
						for (entry_count = t.readUint32(), this.associations = [], e = 0; e < entry_count; e++) {
							var r = {}
							;(this.associations.push(r),
								this.version < 1 ? (r.id = t.readUint16()) : (r.id = t.readUint32()))
							var s = t.readUint8()
							for (r.props = [], i = 0; i < s; i++) {
								var n = t.readUint8(),
									a = {}
								;(r.props.push(a),
									(a.essential = (128 & n) >> 7 == 1),
									1 & this.flags
										? (a.property_index = ((127 & n) << 8) | t.readUint8())
										: (a.property_index = 127 & n))
							}
						}
					}),
					u.createFullBoxCtor("iref", "ItemReferenceBox", function (t) {
						var e, i
						for (this.references = []; t.getPosition() < this.start + this.size; ) {
							if ((e = u.parseOneBox(t, !0, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							;((i =
								0 === this.version
									? new u.SingleItemTypeReferenceBox(e.type, e.size, e.hdr_size, e.start)
									: new u.SingleItemTypeReferenceBoxLarge(e.type, e.size, e.hdr_size, e.start))
								.write === u.Box.prototype.write &&
								"mdat" !== i.type &&
								(s.warn(
									"BoxParser",
									i.type +
										" box writing not yet implemented, keeping unparsed data in memory for later write",
								),
								i.parseDataAndRewind(t)),
								i.parse(t),
								this.references.push(i))
						}
					}),
					u.createBoxCtor("irot", "ImageRotation", function (t) {
						this.angle = 3 & t.readUint8()
					}),
					u.createFullBoxCtor("ispe", "ImageSpatialExtentsProperty", function (t) {
						;((this.image_width = t.readUint32()), (this.image_height = t.readUint32()))
					}),
					u.createFullBoxCtor("kind", "KindBox", function (t) {
						;((this.schemeURI = t.readCString()), (this.value = t.readCString()))
					}),
					u.createFullBoxCtor("leva", "LevelAssignmentBox", function (t) {
						var e = t.readUint8()
						this.levels = []
						for (var i = 0; i < e; i++) {
							var r = {}
							;((this.levels[i] = r), (r.track_ID = t.readUint32()))
							var n = t.readUint8()
							switch (((r.padding_flag = n >> 7), (r.assignment_type = 127 & n), r.assignment_type)) {
								case 0:
									r.grouping_type = t.readString(4)
									break
								case 1:
									;((r.grouping_type = t.readString(4)), (r.grouping_type_parameter = t.readUint32()))
									break
								case 2:
								case 3:
									break
								case 4:
									r.sub_track_id = t.readUint32()
									break
								default:
									s.warn("BoxParser", "Unknown leva assignement type")
							}
						}
					}),
					u.createBoxCtor("lhvC", "LHEVCConfigurationBox", function (t) {
						var e, i, r
						;((this.configurationVersion = t.readUint8()),
							(this.min_spatial_segmentation_idc = 4095 & t.readUint16()),
							(this.parallelismType = 3 & t.readUint8()),
							(r = t.readUint8()),
							(this.numTemporalLayers = (13 & r) >> 3),
							(this.temporalIdNested = (4 & r) >> 2),
							(this.lengthSizeMinusOne = 3 & r),
							(this.nalu_arrays = []),
							(this.nalu_arrays.toString = function () {
								var t = "<table class='inner-table'>"
								;((t +=
									"<thead><tr><th>completeness</th><th>nalu_type</th><th>nalu_data</th></tr></thead>"),
									(t += "<tbody>"))
								for (var e = 0; e < this.length; e++) {
									var i = this[e]
									;((t += "<tr>"),
										(t += "<td rowspan='" + i.length + "'>" + i.completeness + "</td>"),
										(t += "<td rowspan='" + i.length + "'>" + i.nalu_type + "</td>"))
									for (var r = 0; r < i.length; r++)
										(0 !== r && (t += "<tr>"),
											(t += "<td>"),
											(t += i[r].data.reduce(function (t, e) {
												return t + e.toString(16).padStart(2, "0")
											}, "0x")),
											(t += "</td></tr>"))
								}
								return (t += "</tbody></table>")
							}))
						var s = t.readUint8()
						for (e = 0; e < s; e++) {
							var n = []
							;(this.nalu_arrays.push(n),
								(r = t.readUint8()),
								(n.completeness = (128 & r) >> 7),
								(n.nalu_type = 63 & r))
							var a = t.readUint16()
							for (i = 0; i < a; i++) {
								var o = {}
								n.push(o)
								var h = t.readUint16()
								o.data = t.readUint8Array(h)
							}
						}
					}),
					u.createBoxCtor("lsel", "LayerSelectorProperty", function (t) {
						this.layer_id = t.readUint16()
					}),
					u.createBoxCtor("maxr", "hintmaxrate", function (t) {
						;((this.period = t.readUint32()), (this.bytes = t.readUint32()))
					}),
					(p.prototype.toString = function () {
						return "(" + this.x + "," + this.y + ")"
					}),
					u.createBoxCtor("mdcv", "MasteringDisplayColourVolumeBox", function (t) {
						;((this.display_primaries = []),
							(this.display_primaries[0] = new p(t.readUint16(), t.readUint16())),
							(this.display_primaries[1] = new p(t.readUint16(), t.readUint16())),
							(this.display_primaries[2] = new p(t.readUint16(), t.readUint16())),
							(this.white_point = new p(t.readUint16(), t.readUint16())),
							(this.max_display_mastering_luminance = t.readUint32()),
							(this.min_display_mastering_luminance = t.readUint32()))
					}),
					u.createFullBoxCtor("mdhd", "MediaHeaderBox", function (t) {
						;(1 == this.version
							? ((this.creation_time = t.readUint64()),
								(this.modification_time = t.readUint64()),
								(this.timescale = t.readUint32()),
								(this.duration = t.readUint64()))
							: ((this.creation_time = t.readUint32()),
								(this.modification_time = t.readUint32()),
								(this.timescale = t.readUint32()),
								(this.duration = t.readUint32())),
							this.parseLanguage(t),
							t.readUint16())
					}),
					u.createFullBoxCtor("mehd", "MovieExtendsHeaderBox", function (t) {
						;(1 & this.flags &&
							(s.warn("BoxParser", "mehd box incorrectly uses flags set to 1, converting version to 1"),
							(this.version = 1)),
							1 == this.version
								? (this.fragment_duration = t.readUint64())
								: (this.fragment_duration = t.readUint32()))
					}),
					u.createFullBoxCtor("meta", "MetaBox", function (t) {
						;((this.boxes = []), u.ContainerBox.prototype.parse.call(this, t))
					}),
					u.createFullBoxCtor("mfhd", "MovieFragmentHeaderBox", function (t) {
						this.sequence_number = t.readUint32()
					}),
					u.createFullBoxCtor("mfro", "MovieFragmentRandomAccessOffsetBox", function (t) {
						this._size = t.readUint32()
					}),
					u.createFullBoxCtor("mskC", "MaskConfigurationProperty", function (t) {
						this.bits_per_pixel = t.readUint8()
					}),
					u.createFullBoxCtor("mvhd", "MovieHeaderBox", function (t) {
						;(1 == this.version
							? ((this.creation_time = t.readUint64()),
								(this.modification_time = t.readUint64()),
								(this.timescale = t.readUint32()),
								(this.duration = t.readUint64()))
							: ((this.creation_time = t.readUint32()),
								(this.modification_time = t.readUint32()),
								(this.timescale = t.readUint32()),
								(this.duration = t.readUint32())),
							(this.rate = t.readUint32()),
							(this.volume = t.readUint16() >> 8),
							t.readUint16(),
							t.readUint32Array(2),
							(this.matrix = t.readUint32Array(9)),
							t.readUint32Array(6),
							(this.next_track_id = t.readUint32()))
					}),
					u.createBoxCtor("npck", "hintPacketsSent", function (t) {
						this.packetssent = t.readUint32()
					}),
					u.createBoxCtor("nump", "hintPacketsSent", function (t) {
						this.packetssent = t.readUint64()
					}),
					u.createFullBoxCtor("padb", "PaddingBitsBox", function (t) {
						var e = t.readUint32()
						this.padbits = []
						for (var i = 0; i < Math.floor((e + 1) / 2); i++) this.padbits = t.readUint8()
					}),
					u.createBoxCtor("pasp", "PixelAspectRatioBox", function (t) {
						;((this.hSpacing = t.readUint32()), (this.vSpacing = t.readUint32()))
					}),
					u.createBoxCtor("payl", "CuePayloadBox", function (t) {
						this.text = t.readString(this.size - this.hdr_size)
					}),
					u.createBoxCtor("payt", "hintpayloadID", function (t) {
						this.payloadID = t.readUint32()
						var e = t.readUint8()
						this.rtpmap_string = t.readString(e)
					}),
					u.createFullBoxCtor("pdin", "ProgressiveDownloadInfoBox", function (t) {
						var e = (this.size - this.hdr_size) / 8
						;((this.rate = []), (this.initial_delay = []))
						for (var i = 0; i < e; i++)
							((this.rate[i] = t.readUint32()), (this.initial_delay[i] = t.readUint32()))
					}),
					u.createFullBoxCtor("pitm", "PrimaryItemBox", function (t) {
						0 === this.version ? (this.item_id = t.readUint16()) : (this.item_id = t.readUint32())
					}),
					u.createFullBoxCtor("pixi", "PixelInformationProperty", function (t) {
						var e
						for (
							this.num_channels = t.readUint8(), this.bits_per_channels = [], e = 0;
							e < this.num_channels;
							e++
						)
							this.bits_per_channels[e] = t.readUint8()
					}),
					u.createBoxCtor("pmax", "hintlargestpacket", function (t) {
						this.bytes = t.readUint32()
					}),
					u.createFullBoxCtor("prdi", "ProgressiveDerivedImageItemInformationProperty", function (t) {
						if (((this.step_count = t.readUint16()), (this.item_count = []), 2 & this.flags))
							for (var e = 0; e < this.step_count; e++) this.item_count[e] = t.readUint16()
					}),
					u.createFullBoxCtor("prft", "ProducerReferenceTimeBox", function (t) {
						;((this.ref_track_id = t.readUint32()),
							(this.ntp_timestamp = t.readUint64()),
							0 === this.version
								? (this.media_time = t.readUint32())
								: (this.media_time = t.readUint64()))
					}),
					u.createFullBoxCtor("pssh", "ProtectionSystemSpecificHeaderBox", function (t) {
						if (((this.system_id = u.parseHex16(t)), this.version > 0)) {
							var e = t.readUint32()
							this.kid = []
							for (var i = 0; i < e; i++) this.kid[i] = u.parseHex16(t)
						}
						var r = t.readUint32()
						r > 0 && (this.data = t.readUint8Array(r))
					}),
					u.createFullBoxCtor("clef", "TrackCleanApertureDimensionsBox", function (t) {
						;((this.width = t.readUint32()), (this.height = t.readUint32()))
					}),
					u.createFullBoxCtor("enof", "TrackEncodedPixelsDimensionsBox", function (t) {
						;((this.width = t.readUint32()), (this.height = t.readUint32()))
					}),
					u.createFullBoxCtor("prof", "TrackProductionApertureDimensionsBox", function (t) {
						;((this.width = t.readUint32()), (this.height = t.readUint32()))
					}),
					u.createContainerBoxCtor("tapt", "TrackApertureModeDimensionsBox", null, ["clef", "prof", "enof"]),
					u.createBoxCtor("rtp ", "rtpmoviehintinformation", function (t) {
						;((this.descriptionformat = t.readString(4)),
							(this.sdptext = t.readString(this.size - this.hdr_size - 4)))
					}),
					u.createFullBoxCtor("saio", "SampleAuxiliaryInformationOffsetsBox", function (t) {
						1 & this.flags &&
							((this.aux_info_type = t.readString(4)), (this.aux_info_type_parameter = t.readUint32()))
						var e = t.readUint32()
						this.offset = []
						for (var i = 0; i < e; i++)
							0 === this.version ? (this.offset[i] = t.readUint32()) : (this.offset[i] = t.readUint64())
					}),
					u.createFullBoxCtor("saiz", "SampleAuxiliaryInformationSizesBox", function (t) {
						if (
							(1 & this.flags &&
								((this.aux_info_type = t.readString(4)),
								(this.aux_info_type_parameter = t.readUint32())),
							(this.default_sample_info_size = t.readUint8()),
							(this.sample_count = t.readUint32()),
							(this.sample_info_size = []),
							0 === this.default_sample_info_size)
						)
							for (var e = 0; e < this.sample_count; e++) this.sample_info_size[e] = t.readUint8()
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_METADATA, "mett", function (t) {
						;(this.parseHeader(t),
							(this.content_encoding = t.readCString()),
							(this.mime_format = t.readCString()),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_METADATA, "metx", function (t) {
						;(this.parseHeader(t),
							(this.content_encoding = t.readCString()),
							(this.namespace = t.readCString()),
							(this.schema_location = t.readCString()),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SUBTITLE, "sbtt", function (t) {
						;(this.parseHeader(t),
							(this.content_encoding = t.readCString()),
							(this.mime_format = t.readCString()),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SUBTITLE, "stpp", function (t) {
						;(this.parseHeader(t),
							(this.namespace = t.readCString()),
							(this.schema_location = t.readCString()),
							(this.auxiliary_mime_types = t.readCString()),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SUBTITLE, "stxt", function (t) {
						;(this.parseHeader(t),
							(this.content_encoding = t.readCString()),
							(this.mime_format = t.readCString()),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_SUBTITLE, "tx3g", function (t) {
						;(this.parseHeader(t),
							(this.displayFlags = t.readUint32()),
							(this.horizontal_justification = t.readInt8()),
							(this.vertical_justification = t.readInt8()),
							(this.bg_color_rgba = t.readUint8Array(4)),
							(this.box_record = t.readInt16Array(4)),
							(this.style_record = t.readUint8Array(12)),
							this.parseFooter(t))
					}),
					u.createSampleEntryCtor(u.SAMPLE_ENTRY_TYPE_METADATA, "wvtt", function (t) {
						;(this.parseHeader(t), this.parseFooter(t))
					}),
					u.createSampleGroupCtor("alst", function (t) {
						var e,
							i = t.readUint16()
						for (this.first_output_sample = t.readUint16(), this.sample_offset = [], e = 0; e < i; e++)
							this.sample_offset[e] = t.readUint32()
						var r = this.description_length - 4 - 4 * i
						for (this.num_output_samples = [], this.num_total_samples = [], e = 0; e < r / 4; e++)
							((this.num_output_samples[e] = t.readUint16()),
								(this.num_total_samples[e] = t.readUint16()))
					}),
					u.createSampleGroupCtor("avll", function (t) {
						;((this.layerNumber = t.readUint8()),
							(this.accurateStatisticsFlag = t.readUint8()),
							(this.avgBitRate = t.readUint16()),
							(this.avgFrameRate = t.readUint16()))
					}),
					u.createSampleGroupCtor("avss", function (t) {
						;((this.subSequenceIdentifier = t.readUint16()), (this.layerNumber = t.readUint8()))
						var e = t.readUint8()
						;((this.durationFlag = e >> 7),
							(this.avgRateFlag = (e >> 6) & 1),
							this.durationFlag && (this.duration = t.readUint32()),
							this.avgRateFlag &&
								((this.accurateStatisticsFlag = t.readUint8()),
								(this.avgBitRate = t.readUint16()),
								(this.avgFrameRate = t.readUint16())),
							(this.dependency = []))
						for (var i = t.readUint8(), r = 0; r < i; r++) {
							var s = {}
							;(this.dependency.push(s),
								(s.subSeqDirectionFlag = t.readUint8()),
								(s.layerNumber = t.readUint8()),
								(s.subSequenceIdentifier = t.readUint16()))
						}
					}),
					u.createSampleGroupCtor("dtrt", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("mvif", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("prol", function (t) {
						this.roll_distance = t.readInt16()
					}),
					u.createSampleGroupCtor("rap ", function (t) {
						var e = t.readUint8()
						;((this.num_leading_samples_known = e >> 7), (this.num_leading_samples = 127 & e))
					}),
					u.createSampleGroupCtor("rash", function (t) {
						if (
							((this.operation_point_count = t.readUint16()),
							this.description_length !==
								2 + (1 === this.operation_point_count ? 2 : 6 * this.operation_point_count) + 9)
						)
							(s.warn("BoxParser", "Mismatch in " + this.grouping_type + " sample group length"),
								(this.data = t.readUint8Array(this.description_length - 2)))
						else {
							if (1 === this.operation_point_count) this.target_rate_share = t.readUint16()
							else {
								;((this.target_rate_share = []), (this.available_bitrate = []))
								for (var e = 0; e < this.operation_point_count; e++)
									((this.available_bitrate[e] = t.readUint32()),
										(this.target_rate_share[e] = t.readUint16()))
							}
							;((this.maximum_bitrate = t.readUint32()),
								(this.minimum_bitrate = t.readUint32()),
								(this.discard_priority = t.readUint8()))
						}
					}),
					u.createSampleGroupCtor("roll", function (t) {
						this.roll_distance = t.readInt16()
					}),
					(u.SampleGroupEntry.prototype.parse = function (t) {
						;(s.warn("BoxParser", "Unknown Sample Group type: " + this.grouping_type),
							(this.data = t.readUint8Array(this.description_length)))
					}),
					u.createSampleGroupCtor("scif", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("scnm", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("seig", function (t) {
						this.reserved = t.readUint8()
						var e = t.readUint8()
						;((this.crypt_byte_block = e >> 4),
							(this.skip_byte_block = 15 & e),
							(this.isProtected = t.readUint8()),
							(this.Per_Sample_IV_Size = t.readUint8()),
							(this.KID = u.parseHex16(t)),
							(this.constant_IV_size = 0),
							(this.constant_IV = 0),
							1 === this.isProtected &&
								0 === this.Per_Sample_IV_Size &&
								((this.constant_IV_size = t.readUint8()),
								(this.constant_IV = t.readUint8Array(this.constant_IV_size))))
					}),
					u.createSampleGroupCtor("stsa", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("sync", function (t) {
						var e = t.readUint8()
						this.NAL_unit_type = 63 & e
					}),
					u.createSampleGroupCtor("tele", function (t) {
						var e = t.readUint8()
						this.level_independently_decodable = e >> 7
					}),
					u.createSampleGroupCtor("tsas", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("tscl", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createSampleGroupCtor("vipr", function (t) {
						s.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed")
					}),
					u.createFullBoxCtor("sbgp", "SampleToGroupBox", function (t) {
						;((this.grouping_type = t.readString(4)),
							1 === this.version
								? (this.grouping_type_parameter = t.readUint32())
								: (this.grouping_type_parameter = 0),
							(this.entries = []))
						for (var e = t.readUint32(), i = 0; i < e; i++) {
							var r = {}
							;(this.entries.push(r),
								(r.sample_count = t.readInt32()),
								(r.group_description_index = t.readInt32()))
						}
					}),
					(d.prototype.toString = function () {
						return "[row: " + this.bad_pixel_row + ", column: " + this.bad_pixel_column + "]"
					}),
					u.createFullBoxCtor("sbpm", "SensorBadPixelsMapBox", function (t) {
						var e
						for (
							this.component_count = t.readUint16(), this.component_index = [], e = 0;
							e < this.component_count;
							e++
						)
							this.component_index.push(t.readUint16())
						var i = t.readUint8()
						for (
							this.correction_applied = !(128 & ~i),
								this.num_bad_rows = t.readUint32(),
								this.num_bad_cols = t.readUint32(),
								this.num_bad_pixels = t.readUint32(),
								this.bad_rows = [],
								this.bad_columns = [],
								this.bad_pixels = [],
								e = 0;
							e < this.num_bad_rows;
							e++
						)
							this.bad_rows.push(t.readUint32())
						for (e = 0; e < this.num_bad_cols; e++) this.bad_columns.push(t.readUint32())
						for (e = 0; e < this.num_bad_pixels; e++) {
							var r = t.readUint32(),
								s = t.readUint32()
							this.bad_pixels.push(new d(r, s))
						}
					}),
					u.createFullBoxCtor("schm", "SchemeTypeBox", function (t) {
						;((this.scheme_type = t.readString(4)),
							(this.scheme_version = t.readUint32()),
							1 & this.flags && (this.scheme_uri = t.readString(this.size - this.hdr_size - 8)))
					}),
					u.createBoxCtor("sdp ", "rtptracksdphintinformation", function (t) {
						this.sdptext = t.readString(this.size - this.hdr_size)
					}),
					u.createFullBoxCtor("sdtp", "SampleDependencyTypeBox", function (t) {
						var e,
							i = this.size - this.hdr_size
						;((this.is_leading = []),
							(this.sample_depends_on = []),
							(this.sample_is_depended_on = []),
							(this.sample_has_redundancy = []))
						for (var r = 0; r < i; r++)
							((e = t.readUint8()),
								(this.is_leading[r] = e >> 6),
								(this.sample_depends_on[r] = (e >> 4) & 3),
								(this.sample_is_depended_on[r] = (e >> 2) & 3),
								(this.sample_has_redundancy[r] = 3 & e))
					}),
					u.createFullBoxCtor("senc", "SampleEncryptionBox"),
					u.createFullBoxCtor("sgpd", "SampleGroupDescriptionBox", function (t) {
						;((this.grouping_type = t.readString(4)),
							s.debug("BoxParser", "Found Sample Groups of type " + this.grouping_type),
							1 === this.version ? (this.default_length = t.readUint32()) : (this.default_length = 0),
							this.version >= 2 && (this.default_group_description_index = t.readUint32()),
							(this.entries = []))
						for (var e = t.readUint32(), i = 0; i < e; i++) {
							var r
							;((r = u[this.grouping_type + "SampleGroupEntry"]
								? new u[this.grouping_type + "SampleGroupEntry"](this.grouping_type)
								: new u.SampleGroupEntry(this.grouping_type)),
								this.entries.push(r),
								1 === this.version && 0 === this.default_length
									? (r.description_length = t.readUint32())
									: (r.description_length = this.default_length),
								r.write === u.SampleGroupEntry.prototype.write &&
									(s.info(
										"BoxParser",
										"SampleGroup for type " +
											this.grouping_type +
											" writing not yet implemented, keeping unparsed data in memory for later write",
									),
									(r.data = t.readUint8Array(r.description_length)),
									(t.position -= r.description_length)),
								r.parse(t))
						}
					}),
					u.createFullBoxCtor("sidx", "CompressedSegmentIndexBox", function (t) {
						;((this.reference_ID = t.readUint32()),
							(this.timescale = t.readUint32()),
							0 === this.version
								? ((this.earliest_presentation_time = t.readUint32()),
									(this.first_offset = t.readUint32()))
								: ((this.earliest_presentation_time = t.readUint64()),
									(this.first_offset = t.readUint64())),
							t.readUint16(),
							(this.references = []))
						for (var e = t.readUint16(), i = 0; i < e; i++) {
							var r = {}
							this.references.push(r)
							var s = t.readUint32()
							;((r.reference_type = (s >> 31) & 1),
								(r.referenced_size = 2147483647 & s),
								(r.subsegment_duration = t.readUint32()),
								(s = t.readUint32()),
								(r.starts_with_SAP = (s >> 31) & 1),
								(r.SAP_type = (s >> 28) & 7),
								(r.SAP_delta_time = 268435455 & s))
						}
					}),
					(u.SingleItemTypeReferenceBox = function (t, e, i, r) {
						;(u.Box.call(this, t, e), (this.hdr_size = i), (this.start = r))
					}),
					(u.SingleItemTypeReferenceBox.prototype = new u.Box()),
					(u.SingleItemTypeReferenceBox.prototype.parse = function (t) {
						this.from_item_ID = t.readUint16()
						var e = t.readUint16()
						this.references = []
						for (var i = 0; i < e; i++)
							((this.references[i] = {}), (this.references[i].to_item_ID = t.readUint16()))
					}),
					(u.SingleItemTypeReferenceBoxLarge = function (t, e, i, r) {
						;(u.Box.call(this, t, e), (this.hdr_size = i), (this.start = r))
					}),
					(u.SingleItemTypeReferenceBoxLarge.prototype = new u.Box()),
					(u.SingleItemTypeReferenceBoxLarge.prototype.parse = function (t) {
						this.from_item_ID = t.readUint32()
						var e = t.readUint16()
						this.references = []
						for (var i = 0; i < e; i++)
							((this.references[i] = {}), (this.references[i].to_item_ID = t.readUint32()))
					}),
					u.createFullBoxCtor("SmDm", "SMPTE2086MasteringDisplayMetadataBox", function (t) {
						;((this.primaryRChromaticity_x = t.readUint16()),
							(this.primaryRChromaticity_y = t.readUint16()),
							(this.primaryGChromaticity_x = t.readUint16()),
							(this.primaryGChromaticity_y = t.readUint16()),
							(this.primaryBChromaticity_x = t.readUint16()),
							(this.primaryBChromaticity_y = t.readUint16()),
							(this.whitePointChromaticity_x = t.readUint16()),
							(this.whitePointChromaticity_y = t.readUint16()),
							(this.luminanceMax = t.readUint32()),
							(this.luminanceMin = t.readUint32()))
					}),
					u.createFullBoxCtor("smhd", "SoundMediaHeaderBox", function (t) {
						;((this.balance = t.readUint16()), t.readUint16())
					}),
					u.createFullBoxCtor("ssix", "CompressedSubsegmentIndexBox", function (t) {
						this.subsegments = []
						for (var e = t.readUint32(), i = 0; i < e; i++) {
							var r = {}
							;(this.subsegments.push(r), (r.ranges = []))
							for (var s = t.readUint32(), n = 0; n < s; n++) {
								var a = {}
								;(r.ranges.push(a), (a.level = t.readUint8()), (a.range_size = t.readUint24()))
							}
						}
					}),
					u.createFullBoxCtor("stco", "ChunkOffsetBox", function (t) {
						var e
						if (((e = t.readUint32()), (this.chunk_offsets = []), 0 === this.version))
							for (var i = 0; i < e; i++) this.chunk_offsets.push(t.readUint32())
					}),
					u.createFullBoxCtor("stdp", "DegradationPriorityBox", function (t) {
						var e = (this.size - this.hdr_size) / 2
						this.priority = []
						for (var i = 0; i < e; i++) this.priority[i] = t.readUint16()
					}),
					u.createFullBoxCtor("sthd", "SubtitleMediaHeaderBox"),
					u.createFullBoxCtor("stri", "SubTrackInformationBox", function (t) {
						;((this.switch_group = t.readUint16()),
							(this.alternate_group = t.readUint16()),
							(this.sub_track_id = t.readUint32()))
						var e = (this.size - this.hdr_size - 8) / 4
						this.attribute_list = []
						for (var i = 0; i < e; i++) this.attribute_list[i] = t.readUint32()
					}),
					u.createFullBoxCtor("stsc", "SampleToChunkBox", function (t) {
						var e, i
						if (
							((e = t.readUint32()),
							(this.first_chunk = []),
							(this.samples_per_chunk = []),
							(this.sample_description_index = []),
							0 === this.version)
						)
							for (i = 0; i < e; i++)
								(this.first_chunk.push(t.readUint32()),
									this.samples_per_chunk.push(t.readUint32()),
									this.sample_description_index.push(t.readUint32()))
					}),
					u.createFullBoxCtor("stsd", "SampleDescriptionBox", function (t) {
						var e, i, r, n
						for (this.entries = [], r = t.readUint32(), e = 1; e <= r; e++) {
							if ((i = u.parseOneBox(t, !0, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							;(u[i.type + "SampleEntry"]
								? (((n = new u[i.type + "SampleEntry"](i.size)).hdr_size = i.hdr_size),
									(n.start = i.start))
								: (s.warn("BoxParser", "Unknown sample entry type: " + i.type),
									(n = new u.SampleEntry(i.type, i.size, i.hdr_size, i.start))),
								n.write === u.SampleEntry.prototype.write &&
									(s.info(
										"BoxParser",
										"SampleEntry " +
											n.type +
											" box writing not yet implemented, keeping unparsed data in memory for later write",
									),
									n.parseDataAndRewind(t)),
								n.parse(t),
								this.entries.push(n))
						}
					}),
					u.createFullBoxCtor("stsg", "SubTrackSampleGroupBox", function (t) {
						this.grouping_type = t.readUint32()
						var e = t.readUint16()
						this.group_description_index = []
						for (var i = 0; i < e; i++) this.group_description_index[i] = t.readUint32()
					}),
					u.createFullBoxCtor("stsh", "ShadowSyncSampleBox", function (t) {
						var e, i
						if (
							((e = t.readUint32()),
							(this.shadowed_sample_numbers = []),
							(this.sync_sample_numbers = []),
							0 === this.version)
						)
							for (i = 0; i < e; i++)
								(this.shadowed_sample_numbers.push(t.readUint32()),
									this.sync_sample_numbers.push(t.readUint32()))
					}),
					u.createFullBoxCtor("stss", "SyncSampleBox", function (t) {
						var e, i
						if (((i = t.readUint32()), 0 === this.version))
							for (this.sample_numbers = [], e = 0; e < i; e++) this.sample_numbers.push(t.readUint32())
					}),
					u.createFullBoxCtor("stsz", "SampleSizeBox", function (t) {
						var e
						if (((this.sample_sizes = []), 0 === this.version))
							for (
								this.sample_size = t.readUint32(), this.sample_count = t.readUint32(), e = 0;
								e < this.sample_count;
								e++
							)
								0 === this.sample_size
									? this.sample_sizes.push(t.readUint32())
									: (this.sample_sizes[e] = this.sample_size)
					}),
					u.createFullBoxCtor("stts", "TimeToSampleBox", function (t) {
						var e, i, r
						if (
							((e = t.readUint32()),
							(this.sample_counts = []),
							(this.sample_deltas = []),
							0 === this.version)
						)
							for (i = 0; i < e; i++)
								(this.sample_counts.push(t.readUint32()),
									(r = t.readInt32()) < 0 &&
										(s.warn(
											"BoxParser",
											"File uses negative stts sample delta, using value 1 instead, sync may be lost!",
										),
										(r = 1)),
									this.sample_deltas.push(r))
					}),
					u.createFullBoxCtor("stvi", "StereoVideoBox", function (t) {
						var e = t.readUint32()
						;((this.single_view_allowed = 3 & e), (this.stereo_scheme = t.readUint32()))
						var i,
							r,
							s = t.readUint32()
						for (
							this.stereo_indication_type = t.readString(s), this.boxes = [];
							t.getPosition() < this.start + this.size;

						) {
							if ((i = u.parseOneBox(t, !1, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							;((r = i.box), this.boxes.push(r), (this[r.type] = r))
						}
					}),
					u.createBoxCtor("styp", "SegmentTypeBox", function (t) {
						u.ftypBox.prototype.parse.call(this, t)
					}),
					u.createFullBoxCtor("stz2", "CompactSampleSizeBox", function (t) {
						var e, i
						if (((this.sample_sizes = []), 0 === this.version))
							if (
								((this.reserved = t.readUint24()),
								(this.field_size = t.readUint8()),
								(i = t.readUint32()),
								4 === this.field_size)
							)
								for (e = 0; e < i; e += 2) {
									var r = t.readUint8()
									;((this.sample_sizes[e] = (r >> 4) & 15), (this.sample_sizes[e + 1] = 15 & r))
								}
							else if (8 === this.field_size) for (e = 0; e < i; e++) this.sample_sizes[e] = t.readUint8()
							else if (16 === this.field_size)
								for (e = 0; e < i; e++) this.sample_sizes[e] = t.readUint16()
							else s.error("BoxParser", "Error in length field in stz2 box")
					}),
					u.createFullBoxCtor("subs", "SubSampleInformationBox", function (t) {
						var e, i, r, s
						for (r = t.readUint32(), this.entries = [], e = 0; e < r; e++) {
							var n = {}
							if (
								((this.entries[e] = n),
								(n.sample_delta = t.readUint32()),
								(n.subsamples = []),
								(s = t.readUint16()) > 0)
							)
								for (i = 0; i < s; i++) {
									var a = {}
									;(n.subsamples.push(a),
										1 == this.version ? (a.size = t.readUint32()) : (a.size = t.readUint16()),
										(a.priority = t.readUint8()),
										(a.discardable = t.readUint8()),
										(a.codec_specific_parameters = t.readUint32()))
								}
						}
					}),
					u.createFullBoxCtor("tenc", "TrackEncryptionBox", function (t) {
						if ((t.readUint8(), 0 === this.version)) t.readUint8()
						else {
							var e = t.readUint8()
							;((this.default_crypt_byte_block = (e >> 4) & 15), (this.default_skip_byte_block = 15 & e))
						}
						;((this.default_isProtected = t.readUint8()),
							(this.default_Per_Sample_IV_Size = t.readUint8()),
							(this.default_KID = u.parseHex16(t)),
							1 === this.default_isProtected &&
								0 === this.default_Per_Sample_IV_Size &&
								((this.default_constant_IV_size = t.readUint8()),
								(this.default_constant_IV = t.readUint8Array(this.default_constant_IV_size))))
					}),
					u.createFullBoxCtor("tfdt", "TrackFragmentBaseMediaDecodeTimeBox", function (t) {
						1 == this.version
							? (this.baseMediaDecodeTime = t.readUint64())
							: (this.baseMediaDecodeTime = t.readUint32())
					}),
					u.createFullBoxCtor("tfhd", "TrackFragmentHeaderBox", function (t) {
						var e = 0
						;((this.track_id = t.readUint32()),
							this.size - this.hdr_size > e && this.flags & u.TFHD_FLAG_BASE_DATA_OFFSET
								? ((this.base_data_offset = t.readUint64()), (e += 8))
								: (this.base_data_offset = 0),
							this.size - this.hdr_size > e && this.flags & u.TFHD_FLAG_SAMPLE_DESC
								? ((this.default_sample_description_index = t.readUint32()), (e += 4))
								: (this.default_sample_description_index = 0),
							this.size - this.hdr_size > e && this.flags & u.TFHD_FLAG_SAMPLE_DUR
								? ((this.default_sample_duration = t.readUint32()), (e += 4))
								: (this.default_sample_duration = 0),
							this.size - this.hdr_size > e && this.flags & u.TFHD_FLAG_SAMPLE_SIZE
								? ((this.default_sample_size = t.readUint32()), (e += 4))
								: (this.default_sample_size = 0),
							this.size - this.hdr_size > e && this.flags & u.TFHD_FLAG_SAMPLE_FLAGS
								? ((this.default_sample_flags = t.readUint32()), (e += 4))
								: (this.default_sample_flags = 0))
					}),
					u.createFullBoxCtor("tfra", "TrackFragmentRandomAccessBox", function (t) {
						;((this.track_ID = t.readUint32()), t.readUint24())
						var e = t.readUint8()
						;((this.length_size_of_traf_num = (e >> 4) & 3),
							(this.length_size_of_trun_num = (e >> 2) & 3),
							(this.length_size_of_sample_num = 3 & e),
							(this.entries = []))
						for (var i = t.readUint32(), r = 0; r < i; r++)
							(1 === this.version
								? ((this.time = t.readUint64()), (this.moof_offset = t.readUint64()))
								: ((this.time = t.readUint32()), (this.moof_offset = t.readUint32())),
								(this.traf_number = t["readUint" + 8 * (this.length_size_of_traf_num + 1)]()),
								(this.trun_number = t["readUint" + 8 * (this.length_size_of_trun_num + 1)]()),
								(this.sample_number = t["readUint" + 8 * (this.length_size_of_sample_num + 1)]()))
					}),
					u.createFullBoxCtor("tkhd", "TrackHeaderBox", function (t) {
						;(1 == this.version
							? ((this.creation_time = t.readUint64()),
								(this.modification_time = t.readUint64()),
								(this.track_id = t.readUint32()),
								t.readUint32(),
								(this.duration = t.readUint64()))
							: ((this.creation_time = t.readUint32()),
								(this.modification_time = t.readUint32()),
								(this.track_id = t.readUint32()),
								t.readUint32(),
								(this.duration = t.readUint32())),
							t.readUint32Array(2),
							(this.layer = t.readInt16()),
							(this.alternate_group = t.readInt16()),
							(this.volume = t.readInt16() >> 8),
							t.readUint16(),
							(this.matrix = t.readInt32Array(9)),
							(this.width = t.readUint32()),
							(this.height = t.readUint32()))
					}),
					u.createBoxCtor("tmax", "hintmaxrelativetime", function (t) {
						this.time = t.readUint32()
					}),
					u.createBoxCtor("tmin", "hintminrelativetime", function (t) {
						this.time = t.readUint32()
					}),
					u.createBoxCtor("totl", "hintBytesSent", function (t) {
						this.bytessent = t.readUint32()
					}),
					u.createBoxCtor("tpay", "hintBytesSent", function (t) {
						this.bytessent = t.readUint32()
					}),
					u.createBoxCtor("tpyl", "hintBytesSent", function (t) {
						this.bytessent = t.readUint64()
					}),
					(u.TrackGroupTypeBox.prototype.parse = function (t) {
						;(this.parseFullHeader(t), (this.track_group_id = t.readUint32()))
					}),
					u.createTrackGroupCtor("msrc"),
					(u.TrackReferenceTypeBox = function (t, e, i, r) {
						;(u.Box.call(this, t, e), (this.hdr_size = i), (this.start = r))
					}),
					(u.TrackReferenceTypeBox.prototype = new u.Box()),
					(u.TrackReferenceTypeBox.prototype.parse = function (t) {
						this.track_ids = t.readUint32Array((this.size - this.hdr_size) / 4)
					}),
					(u.trefBox.prototype.parse = function (t) {
						for (var e, i; t.getPosition() < this.start + this.size; ) {
							if ((e = u.parseOneBox(t, !0, this.size - (t.getPosition() - this.start))).code !== u.OK)
								return
							;((i = new u.TrackReferenceTypeBox(e.type, e.size, e.hdr_size, e.start)).write ===
								u.Box.prototype.write &&
								"mdat" !== i.type &&
								(s.info(
									"BoxParser",
									"TrackReference " +
										i.type +
										" box writing not yet implemented, keeping unparsed data in memory for later write",
								),
								i.parseDataAndRewind(t)),
								i.parse(t),
								this.boxes.push(i))
						}
					}),
					u.createFullBoxCtor("trep", "TrackExtensionPropertiesBox", function (t) {
						for (
							this.track_ID = t.readUint32(), this.boxes = [];
							t.getPosition() < this.start + this.size;

						) {
							if (
								((ret = u.parseOneBox(t, !1, this.size - (t.getPosition() - this.start))),
								ret.code !== u.OK)
							)
								return
							;((box = ret.box), this.boxes.push(box))
						}
					}),
					u.createFullBoxCtor("trex", "TrackExtendsBox", function (t) {
						;((this.track_id = t.readUint32()),
							(this.default_sample_description_index = t.readUint32()),
							(this.default_sample_duration = t.readUint32()),
							(this.default_sample_size = t.readUint32()),
							(this.default_sample_flags = t.readUint32()))
					}),
					u.createBoxCtor("trpy", "hintBytesSent", function (t) {
						this.bytessent = t.readUint64()
					}),
					u.createFullBoxCtor("trun", "TrackRunBox", function (t) {
						var e = 0
						if (
							((this.sample_count = t.readUint32()),
							(e += 4),
							this.size - this.hdr_size > e && this.flags & u.TRUN_FLAGS_DATA_OFFSET
								? ((this.data_offset = t.readInt32()), (e += 4))
								: (this.data_offset = 0),
							this.size - this.hdr_size > e && this.flags & u.TRUN_FLAGS_FIRST_FLAG
								? ((this.first_sample_flags = t.readUint32()), (e += 4))
								: (this.first_sample_flags = 0),
							(this.sample_duration = []),
							(this.sample_size = []),
							(this.sample_flags = []),
							(this.sample_composition_time_offset = []),
							this.size - this.hdr_size > e)
						)
							for (var i = 0; i < this.sample_count; i++)
								(this.flags & u.TRUN_FLAGS_DURATION && (this.sample_duration[i] = t.readUint32()),
									this.flags & u.TRUN_FLAGS_SIZE && (this.sample_size[i] = t.readUint32()),
									this.flags & u.TRUN_FLAGS_FLAGS && (this.sample_flags[i] = t.readUint32()),
									this.flags & u.TRUN_FLAGS_CTS_OFFSET &&
										(0 === this.version
											? (this.sample_composition_time_offset[i] = t.readUint32())
											: (this.sample_composition_time_offset[i] = t.readInt32())))
					}),
					u.createFullBoxCtor("tsel", "TrackSelectionBox", function (t) {
						this.switch_group = t.readUint32()
						var e = (this.size - this.hdr_size - 4) / 4
						this.attribute_list = []
						for (var i = 0; i < e; i++) this.attribute_list[i] = t.readUint32()
					}),
					u.createFullBoxCtor("txtC", "TextConfigBox", function (t) {
						this.config = t.readCString()
					}),
					u.createBoxCtor("tyco", "TypeCombinationBox", function (t) {
						var e = (this.size - this.hdr_size) / 4
						this.compatible_brands = []
						for (var i = 0; i < e; i++) this.compatible_brands[i] = t.readString(4)
					}),
					u.createFullBoxCtor("udes", "UserDescriptionProperty", function (t) {
						;((this.lang = t.readCString()),
							(this.name = t.readCString()),
							(this.description = t.readCString()),
							(this.tags = t.readCString()))
					}),
					u.createFullBoxCtor("uncC", "UncompressedFrameConfigBox", function (t) {
						var e
						if (((this.profile = t.readString(4)), 1 == this.version));
						else if (0 == this.version) {
							for (
								this.component_count = t.readUint32(),
									this.component_index = [],
									this.component_bit_depth_minus_one = [],
									this.component_format = [],
									this.component_align_size = [],
									e = 0;
								e < this.component_count;
								e++
							)
								(this.component_index.push(t.readUint16()),
									this.component_bit_depth_minus_one.push(t.readUint8()),
									this.component_format.push(t.readUint8()),
									this.component_align_size.push(t.readUint8()))
							;((this.sampling_type = t.readUint8()),
								(this.interleave_type = t.readUint8()),
								(this.block_size = t.readUint8()))
							var i = t.readUint8()
							;((this.component_little_endian = (i >> 7) & 1),
								(this.block_pad_lsb = (i >> 6) & 1),
								(this.block_little_endian = (i >> 5) & 1),
								(this.block_reversed = (i >> 4) & 1),
								(this.pad_unknown = (i >> 3) & 1),
								(this.pixel_size = t.readUint32()),
								(this.row_align_size = t.readUint32()),
								(this.tile_align_size = t.readUint32()),
								(this.num_tile_cols_minus_one = t.readUint32()),
								(this.num_tile_rows_minus_one = t.readUint32()))
						}
					}),
					u.createFullBoxCtor("url ", "DataEntryUrlBox", function (t) {
						1 !== this.flags && (this.location = t.readCString())
					}),
					u.createFullBoxCtor("urn ", "DataEntryUrnBox", function (t) {
						;((this.name = t.readCString()),
							this.size - this.hdr_size - this.name.length - 1 > 0 && (this.location = t.readCString()))
					}),
					u.createUUIDBox("a5d40b30e81411ddba2f0800200c9a66", "LiveServerManifestBox", !0, !1, function (t) {
						this.LiveServerManifest = t
							.readString(this.size - this.hdr_size)
							.replace(/&/g, "&amp;")
							.replace(/</g, "&lt;")
							.replace(/>/g, "&gt;")
							.replace(/"/g, "&quot;")
							.replace(/'/g, "&#039;")
					}),
					u.createUUIDBox(
						"d08a4f1810f34a82b6c832d8aba183d3",
						"PiffProtectionSystemSpecificHeaderBox",
						!0,
						!1,
						function (t) {
							this.system_id = u.parseHex16(t)
							var e = t.readUint32()
							e > 0 && (this.data = t.readUint8Array(e))
						},
					),
					u.createUUIDBox("a2394f525a9b4f14a2446c427c648df4", "PiffSampleEncryptionBox", !0, !1),
					u.createUUIDBox("8974dbce7be74c5184f97148f9882554", "PiffTrackEncryptionBox", !0, !1, function (t) {
						;((this.default_AlgorithmID = t.readUint24()),
							(this.default_IV_size = t.readUint8()),
							(this.default_KID = u.parseHex16(t)))
					}),
					u.createUUIDBox("d4807ef2ca3946958e5426cb9e46a79f", "TfrfBox", !0, !1, function (t) {
						;((this.fragment_count = t.readUint8()), (this.entries = []))
						for (var e = 0; e < this.fragment_count; e++) {
							var i = {},
								r = 0,
								s = 0
							;(1 === this.version
								? ((r = t.readUint64()), (s = t.readUint64()))
								: ((r = t.readUint32()), (s = t.readUint32())),
								(i.absolute_time = r),
								(i.absolute_duration = s),
								this.entries.push(i))
						}
					}),
					u.createUUIDBox("6d1d9b0542d544e680e2141daff757b2", "TfxdBox", !0, !1, function (t) {
						1 === this.version
							? ((this.absolute_time = t.readUint64()), (this.duration = t.readUint64()))
							: ((this.absolute_time = t.readUint32()), (this.duration = t.readUint32()))
					}),
					u.createFullBoxCtor("vmhd", "VideoMediaHeaderBox", function (t) {
						;((this.graphicsmode = t.readUint16()), (this.opcolor = t.readUint16Array(3)))
					}),
					u.createFullBoxCtor("vpcC", "VPCodecConfigurationRecord", function (t) {
						var e
						1 === this.version
							? ((this.profile = t.readUint8()),
								(this.level = t.readUint8()),
								(e = t.readUint8()),
								(this.bitDepth = e >> 4),
								(this.chromaSubsampling = (e >> 1) & 7),
								(this.videoFullRangeFlag = 1 & e),
								(this.colourPrimaries = t.readUint8()),
								(this.transferCharacteristics = t.readUint8()),
								(this.matrixCoefficients = t.readUint8()),
								(this.codecIntializationDataSize = t.readUint16()),
								(this.codecIntializationData = t.readUint8Array(this.codecIntializationDataSize)))
							: ((this.profile = t.readUint8()),
								(this.level = t.readUint8()),
								(e = t.readUint8()),
								(this.bitDepth = (e >> 4) & 15),
								(this.colorSpace = 15 & e),
								(e = t.readUint8()),
								(this.chromaSubsampling = (e >> 4) & 15),
								(this.transferFunction = (e >> 1) & 7),
								(this.videoFullRangeFlag = 1 & e),
								(this.codecIntializationDataSize = t.readUint16()),
								(this.codecIntializationData = t.readUint8Array(this.codecIntializationDataSize)))
					}),
					u.createBoxCtor("vttC", "WebVTTConfigurationBox", function (t) {
						this.text = t.readString(this.size - this.hdr_size)
					}),
					u.createFullBoxCtor("vvcC", "VvcConfigurationBox", function (t) {
						var e,
							i,
							r = {
								held_bits: void 0,
								num_held_bits: 0,
								stream_read_1_bytes: function (t) {
									;((this.held_bits = t.readUint8()), (this.num_held_bits = 8))
								},
								stream_read_2_bytes: function (t) {
									;((this.held_bits = t.readUint16()), (this.num_held_bits = 16))
								},
								extract_bits: function (t) {
									var e = (this.held_bits >> (this.num_held_bits - t)) & ((1 << t) - 1)
									return ((this.num_held_bits -= t), e)
								},
							}
						if (
							(r.stream_read_1_bytes(t),
							r.extract_bits(5),
							(this.lengthSizeMinusOne = r.extract_bits(2)),
							(this.ptl_present_flag = r.extract_bits(1)),
							this.ptl_present_flag)
						) {
							if (
								(r.stream_read_2_bytes(t),
								(this.ols_idx = r.extract_bits(9)),
								(this.num_sublayers = r.extract_bits(3)),
								(this.constant_frame_rate = r.extract_bits(2)),
								(this.chroma_format_idc = r.extract_bits(2)),
								r.stream_read_1_bytes(t),
								(this.bit_depth_minus8 = r.extract_bits(3)),
								r.extract_bits(5),
								r.stream_read_2_bytes(t),
								r.extract_bits(2),
								(this.num_bytes_constraint_info = r.extract_bits(6)),
								(this.general_profile_idc = r.extract_bits(7)),
								(this.general_tier_flag = r.extract_bits(1)),
								(this.general_level_idc = t.readUint8()),
								r.stream_read_1_bytes(t),
								(this.ptl_frame_only_constraint_flag = r.extract_bits(1)),
								(this.ptl_multilayer_enabled_flag = r.extract_bits(1)),
								(this.general_constraint_info = new Uint8Array(this.num_bytes_constraint_info)),
								this.num_bytes_constraint_info)
							) {
								for (e = 0; e < this.num_bytes_constraint_info - 1; e++) {
									var s = r.extract_bits(6)
									r.stream_read_1_bytes(t)
									var n = r.extract_bits(2)
									this.general_constraint_info[e] = (s << 2) | n
								}
								this.general_constraint_info[this.num_bytes_constraint_info - 1] = r.extract_bits(6)
							} else r.extract_bits(6)
							if (this.num_sublayers > 1) {
								for (
									r.stream_read_1_bytes(t),
										this.ptl_sublayer_present_mask = 0,
										i = this.num_sublayers - 2;
									i >= 0;
									--i
								) {
									var a = r.extract_bits(1)
									this.ptl_sublayer_present_mask |= a << i
								}
								for (i = this.num_sublayers; i <= 8 && this.num_sublayers > 1; ++i) r.extract_bits(1)
								for (this.sublayer_level_idc = [], i = this.num_sublayers - 2; i >= 0; --i)
									this.ptl_sublayer_present_mask & (1 << i) &&
										(this.sublayer_level_idc[i] = t.readUint8())
							}
							if (
								((this.ptl_num_sub_profiles = t.readUint8()),
								(this.general_sub_profile_idc = []),
								this.ptl_num_sub_profiles)
							)
								for (e = 0; e < this.ptl_num_sub_profiles; e++)
									this.general_sub_profile_idc.push(t.readUint32())
							;((this.max_picture_width = t.readUint16()),
								(this.max_picture_height = t.readUint16()),
								(this.avg_frame_rate = t.readUint16()))
						}
						this.nalu_arrays = []
						var o = t.readUint8()
						for (e = 0; e < o; e++) {
							var h = []
							;(this.nalu_arrays.push(h),
								r.stream_read_1_bytes(t),
								(h.completeness = r.extract_bits(1)),
								r.extract_bits(2),
								(h.nalu_type = r.extract_bits(5)))
							var c = 1
							for (13 != h.nalu_type && 12 != h.nalu_type && (c = t.readUint16()), i = 0; i < c; i++) {
								var u = t.readUint16()
								h.push({ data: t.readUint8Array(u), length: u })
							}
						}
					}),
					u.createFullBoxCtor("vvnC", "VvcNALUConfigBox", function (t) {
						var e = strm.readUint8()
						this.lengthSizeMinusOne = 3 & e
					}),
					(u.SampleEntry.prototype.isVideo = function () {
						return !1
					}),
					(u.SampleEntry.prototype.isAudio = function () {
						return !1
					}),
					(u.SampleEntry.prototype.isSubtitle = function () {
						return !1
					}),
					(u.SampleEntry.prototype.isMetadata = function () {
						return !1
					}),
					(u.SampleEntry.prototype.isHint = function () {
						return !1
					}),
					(u.SampleEntry.prototype.getCodec = function () {
						return this.type.replace(".", "")
					}),
					(u.SampleEntry.prototype.getWidth = function () {
						return ""
					}),
					(u.SampleEntry.prototype.getHeight = function () {
						return ""
					}),
					(u.SampleEntry.prototype.getChannelCount = function () {
						return ""
					}),
					(u.SampleEntry.prototype.getSampleRate = function () {
						return ""
					}),
					(u.SampleEntry.prototype.getSampleSize = function () {
						return ""
					}),
					(u.VisualSampleEntry.prototype.isVideo = function () {
						return !0
					}),
					(u.VisualSampleEntry.prototype.getWidth = function () {
						return this.width
					}),
					(u.VisualSampleEntry.prototype.getHeight = function () {
						return this.height
					}),
					(u.AudioSampleEntry.prototype.isAudio = function () {
						return !0
					}),
					(u.AudioSampleEntry.prototype.getChannelCount = function () {
						return this.channel_count
					}),
					(u.AudioSampleEntry.prototype.getSampleRate = function () {
						return this.samplerate
					}),
					(u.AudioSampleEntry.prototype.getSampleSize = function () {
						return this.samplesize
					}),
					(u.SubtitleSampleEntry.prototype.isSubtitle = function () {
						return !0
					}),
					(u.MetadataSampleEntry.prototype.isMetadata = function () {
						return !0
					}),
					(u.decimalToHex = function (t, e) {
						var i = Number(t).toString(16)
						for (e = null == e ? (e = 2) : e; i.length < e; ) i = "0" + i
						return i
					}),
					(u.avc1SampleEntry.prototype.getCodec =
						u.avc2SampleEntry.prototype.getCodec =
						u.avc3SampleEntry.prototype.getCodec =
						u.avc4SampleEntry.prototype.getCodec =
							function () {
								var t = u.SampleEntry.prototype.getCodec.call(this)
								return this.avcC
									? t +
											"." +
											u.decimalToHex(this.avcC.AVCProfileIndication) +
											u.decimalToHex(this.avcC.profile_compatibility) +
											u.decimalToHex(this.avcC.AVCLevelIndication)
									: t
							}),
					(u.hev1SampleEntry.prototype.getCodec = u.hvc1SampleEntry.prototype.getCodec =
						function () {
							var t,
								e = u.SampleEntry.prototype.getCodec.call(this)
							if (this.hvcC) {
								switch (((e += "."), this.hvcC.general_profile_space)) {
									case 0:
										e += ""
										break
									case 1:
										e += "A"
										break
									case 2:
										e += "B"
										break
									case 3:
										e += "C"
								}
								;((e += this.hvcC.general_profile_idc), (e += "."))
								var i = this.hvcC.general_profile_compatibility,
									r = 0
								for (t = 0; t < 32 && ((r |= 1 & i), 31 != t); t++) ((r <<= 1), (i >>= 1))
								;((e += u.decimalToHex(r, 0)),
									(e += "."),
									0 === this.hvcC.general_tier_flag ? (e += "L") : (e += "H"),
									(e += this.hvcC.general_level_idc))
								var s = !1,
									n = ""
								for (t = 5; t >= 0; t--)
									(this.hvcC.general_constraint_indicator[t] || s) &&
										((n = "." + u.decimalToHex(this.hvcC.general_constraint_indicator[t], 0) + n),
										(s = !0))
								e += n
							}
							return e
						}),
					(u.vvc1SampleEntry.prototype.getCodec = u.vvi1SampleEntry.prototype.getCodec =
						function () {
							var t,
								e = u.SampleEntry.prototype.getCodec.call(this)
							if (this.vvcC) {
								;((e += "." + this.vvcC.general_profile_idc),
									this.vvcC.general_tier_flag ? (e += ".H") : (e += ".L"),
									(e += this.vvcC.general_level_idc))
								var i = ""
								if (this.vvcC.general_constraint_info) {
									var r,
										s = [],
										n = 0
									for (
										n |= this.vvcC.ptl_frame_only_constraint << 7,
											n |= this.vvcC.ptl_multilayer_enabled << 6,
											t = 0;
										t < this.vvcC.general_constraint_info.length;
										++t
									)
										((n |= (this.vvcC.general_constraint_info[t] >> 2) & 63),
											s.push(n),
											n && (r = t),
											(n = (this.vvcC.general_constraint_info[t] >> 2) & 3))
									if (void 0 === r) i = ".CA"
									else {
										i = ".C"
										var a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
											o = 0,
											h = 0
										for (t = 0; t <= r; ++t)
											for (o = (o << 8) | s[t], h += 8; h >= 5; )
												((i += a[(o >> (h - 5)) & 31]), (o &= (1 << (h -= 5)) - 1))
										h && (i += a[31 & (o <<= 5 - h)])
									}
								}
								e += i
							}
							return e
						}),
					(u.mp4aSampleEntry.prototype.getCodec = function () {
						var t = u.SampleEntry.prototype.getCodec.call(this)
						if (this.esds && this.esds.esd) {
							var e = this.esds.esd.getOTI(),
								i = this.esds.esd.getAudioConfig()
							return t + "." + u.decimalToHex(e) + (i ? "." + i : "")
						}
						return t
					}),
					(u.stxtSampleEntry.prototype.getCodec = function () {
						var t = u.SampleEntry.prototype.getCodec.call(this)
						return this.mime_format ? t + "." + this.mime_format : t
					}),
					(u.vp08SampleEntry.prototype.getCodec = u.vp09SampleEntry.prototype.getCodec =
						function () {
							var t = u.SampleEntry.prototype.getCodec.call(this),
								e = this.vpcC.level
							0 == e && (e = "00")
							var i = this.vpcC.bitDepth
							return (8 == i && (i = "08"), t + ".0" + this.vpcC.profile + "." + e + "." + i)
						}),
					(u.av01SampleEntry.prototype.getCodec = function () {
						var t,
							e = u.SampleEntry.prototype.getCodec.call(this),
							i = this.av1C.seq_level_idx_0
						return (
							i < 10 && (i = "0" + i),
							2 === this.av1C.seq_profile && 1 === this.av1C.high_bitdepth
								? (t = 1 === this.av1C.twelve_bit ? "12" : "10")
								: this.av1C.seq_profile <= 2 && (t = 1 === this.av1C.high_bitdepth ? "10" : "08"),
							e + "." + this.av1C.seq_profile + "." + i + (this.av1C.seq_tier_0 ? "H" : "M") + "." + t
						)
					}),
					(u.Box.prototype.writeHeader = function (t, e) {
						;((this.size += 8),
							this.size > o && (this.size += 8),
							"uuid" === this.type && (this.size += 16),
							s.debug(
								"BoxWriter",
								"Writing box " +
									this.type +
									" of size: " +
									this.size +
									" at position " +
									t.getPosition() +
									(e || ""),
							),
							this.size > o
								? t.writeUint32(1)
								: ((this.sizePosition = t.getPosition()), t.writeUint32(this.size)),
							t.writeString(this.type, null, 4),
							"uuid" === this.type && t.writeUint8Array(this.uuid),
							this.size > o && t.writeUint64(this.size))
					}),
					(u.FullBox.prototype.writeHeader = function (t) {
						;((this.size += 4),
							u.Box.prototype.writeHeader.call(this, t, " v=" + this.version + " f=" + this.flags),
							t.writeUint8(this.version),
							t.writeUint24(this.flags))
					}),
					(u.Box.prototype.write = function (t) {
						"mdat" === this.type
							? this.data &&
								((this.size = this.data.length), this.writeHeader(t), t.writeUint8Array(this.data))
							: ((this.size = this.data ? this.data.length : 0),
								this.writeHeader(t),
								this.data && t.writeUint8Array(this.data))
					}),
					(u.ContainerBox.prototype.write = function (t) {
						;((this.size = 0), this.writeHeader(t))
						for (var e = 0; e < this.boxes.length; e++)
							this.boxes[e] && (this.boxes[e].write(t), (this.size += this.boxes[e].size))
						;(s.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size),
							t.adjustUint32(this.sizePosition, this.size))
					}),
					(u.TrackReferenceTypeBox.prototype.write = function (t) {
						;((this.size = 4 * this.track_ids.length),
							this.writeHeader(t),
							t.writeUint32Array(this.track_ids))
					}),
					(u.avcCBox.prototype.write = function (t) {
						var e
						for (this.size = 7, e = 0; e < this.SPS.length; e++) this.size += 2 + this.SPS[e].length
						for (e = 0; e < this.PPS.length; e++) this.size += 2 + this.PPS[e].length
						for (
							this.ext && (this.size += this.ext.length),
								this.writeHeader(t),
								t.writeUint8(this.configurationVersion),
								t.writeUint8(this.AVCProfileIndication),
								t.writeUint8(this.profile_compatibility),
								t.writeUint8(this.AVCLevelIndication),
								t.writeUint8(this.lengthSizeMinusOne + 252),
								t.writeUint8(this.SPS.length + 224),
								e = 0;
							e < this.SPS.length;
							e++
						)
							(t.writeUint16(this.SPS[e].length), t.writeUint8Array(this.SPS[e].nalu))
						for (t.writeUint8(this.PPS.length), e = 0; e < this.PPS.length; e++)
							(t.writeUint16(this.PPS[e].length), t.writeUint8Array(this.PPS[e].nalu))
						this.ext && t.writeUint8Array(this.ext)
					}),
					(u.co64Box.prototype.write = function (t) {
						var e
						for (
							this.version = 0,
								this.flags = 0,
								this.size = 4 + 8 * this.chunk_offsets.length,
								this.writeHeader(t),
								t.writeUint32(this.chunk_offsets.length),
								e = 0;
							e < this.chunk_offsets.length;
							e++
						)
							t.writeUint64(this.chunk_offsets[e])
					}),
					(u.cslgBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 20),
							this.writeHeader(t),
							t.writeInt32(this.compositionToDTSShift),
							t.writeInt32(this.leastDecodeToDisplayDelta),
							t.writeInt32(this.greatestDecodeToDisplayDelta),
							t.writeInt32(this.compositionStartTime),
							t.writeInt32(this.compositionEndTime))
					}),
					(u.cttsBox.prototype.write = function (t) {
						var e
						for (
							this.version = 0,
								this.flags = 0,
								this.size = 4 + 8 * this.sample_counts.length,
								this.writeHeader(t),
								t.writeUint32(this.sample_counts.length),
								e = 0;
							e < this.sample_counts.length;
							e++
						)
							(t.writeUint32(this.sample_counts[e]),
								1 === this.version
									? t.writeInt32(this.sample_offsets[e])
									: t.writeUint32(this.sample_offsets[e]))
					}),
					(u.drefBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 4),
							this.writeHeader(t),
							t.writeUint32(this.entries.length))
						for (var e = 0; e < this.entries.length; e++)
							(this.entries[e].write(t), (this.size += this.entries[e].size))
						;(s.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size),
							t.adjustUint32(this.sizePosition, this.size))
					}),
					(u.elngBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = this.extended_language.length),
							this.writeHeader(t),
							t.writeString(this.extended_language))
					}),
					(u.elstBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 4 + 12 * this.entries.length),
							this.writeHeader(t),
							t.writeUint32(this.entries.length))
						for (var e = 0; e < this.entries.length; e++) {
							var i = this.entries[e]
							;(t.writeUint32(i.segment_duration),
								t.writeInt32(i.media_time),
								t.writeInt16(i.media_rate_integer),
								t.writeInt16(i.media_rate_fraction))
						}
					}),
					(u.emsgBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size =
								16 +
								this.message_data.length +
								(this.scheme_id_uri.length + 1) +
								(this.value.length + 1)),
							this.writeHeader(t),
							t.writeCString(this.scheme_id_uri),
							t.writeCString(this.value),
							t.writeUint32(this.timescale),
							t.writeUint32(this.presentation_time_delta),
							t.writeUint32(this.event_duration),
							t.writeUint32(this.id),
							t.writeUint8Array(this.message_data))
					}),
					(u.ftypBox.prototype.write = function (t) {
						;((this.size = 8 + 4 * this.compatible_brands.length),
							this.writeHeader(t),
							t.writeString(this.major_brand, null, 4),
							t.writeUint32(this.minor_version))
						for (var e = 0; e < this.compatible_brands.length; e++)
							t.writeString(this.compatible_brands[e], null, 4)
					}),
					(u.hdlrBox.prototype.write = function (t) {
						;((this.size = 20 + this.name.length + 1),
							(this.version = 0),
							(this.flags = 0),
							this.writeHeader(t),
							t.writeUint32(0),
							t.writeString(this.handler, null, 4),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeCString(this.name))
					}),
					(u.hvcCBox.prototype.write = function (t) {
						var e, i
						for (this.size = 23, e = 0; e < this.nalu_arrays.length; e++)
							for (this.size += 3, i = 0; i < this.nalu_arrays[e].length; i++)
								this.size += 2 + this.nalu_arrays[e][i].data.length
						for (
							this.writeHeader(t),
								t.writeUint8(this.configurationVersion),
								t.writeUint8(
									(this.general_profile_space << 6) +
										(this.general_tier_flag << 5) +
										this.general_profile_idc,
								),
								t.writeUint32(this.general_profile_compatibility),
								t.writeUint8Array(this.general_constraint_indicator),
								t.writeUint8(this.general_level_idc),
								t.writeUint16(this.min_spatial_segmentation_idc + (15 << 24)),
								t.writeUint8(this.parallelismType + 252),
								t.writeUint8(this.chroma_format_idc + 252),
								t.writeUint8(this.bit_depth_luma_minus8 + 248),
								t.writeUint8(this.bit_depth_chroma_minus8 + 248),
								t.writeUint16(this.avgFrameRate),
								t.writeUint8(
									(this.constantFrameRate << 6) +
										(this.numTemporalLayers << 3) +
										(this.temporalIdNested << 2) +
										this.lengthSizeMinusOne,
								),
								t.writeUint8(this.nalu_arrays.length),
								e = 0;
							e < this.nalu_arrays.length;
							e++
						)
							for (
								t.writeUint8((this.nalu_arrays[e].completeness << 7) + this.nalu_arrays[e].nalu_type),
									t.writeUint16(this.nalu_arrays[e].length),
									i = 0;
								i < this.nalu_arrays[e].length;
								i++
							)
								(t.writeUint16(this.nalu_arrays[e][i].data.length),
									t.writeUint8Array(this.nalu_arrays[e][i].data))
					}),
					(u.kindBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = this.schemeURI.length + 1 + (this.value.length + 1)),
							this.writeHeader(t),
							t.writeCString(this.schemeURI),
							t.writeCString(this.value))
					}),
					(u.mdhdBox.prototype.write = function (t) {
						;((this.size = 20),
							(this.flags = 0),
							(this.version = 0),
							this.writeHeader(t),
							t.writeUint32(this.creation_time),
							t.writeUint32(this.modification_time),
							t.writeUint32(this.timescale),
							t.writeUint32(this.duration),
							t.writeUint16(this.language),
							t.writeUint16(0))
					}),
					(u.mehdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 4),
							this.writeHeader(t),
							t.writeUint32(this.fragment_duration))
					}),
					(u.mfhdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 4),
							this.writeHeader(t),
							t.writeUint32(this.sequence_number))
					}),
					(u.mvhdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 96),
							this.writeHeader(t),
							t.writeUint32(this.creation_time),
							t.writeUint32(this.modification_time),
							t.writeUint32(this.timescale),
							t.writeUint32(this.duration),
							t.writeUint32(this.rate),
							t.writeUint16(this.volume << 8),
							t.writeUint16(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32Array(this.matrix),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(this.next_track_id))
					}),
					(u.SampleEntry.prototype.writeHeader = function (t) {
						;((this.size = 8),
							u.Box.prototype.writeHeader.call(this, t),
							t.writeUint8(0),
							t.writeUint8(0),
							t.writeUint8(0),
							t.writeUint8(0),
							t.writeUint8(0),
							t.writeUint8(0),
							t.writeUint16(this.data_reference_index))
					}),
					(u.SampleEntry.prototype.writeFooter = function (t) {
						for (var e = 0; e < this.boxes.length; e++)
							(this.boxes[e].write(t), (this.size += this.boxes[e].size))
						;(s.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size),
							t.adjustUint32(this.sizePosition, this.size))
					}),
					(u.SampleEntry.prototype.write = function (t) {
						;(this.writeHeader(t),
							t.writeUint8Array(this.data),
							(this.size += this.data.length),
							s.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size),
							t.adjustUint32(this.sizePosition, this.size))
					}),
					(u.VisualSampleEntry.prototype.write = function (t) {
						;(this.writeHeader(t),
							(this.size += 70),
							t.writeUint16(0),
							t.writeUint16(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint16(this.width),
							t.writeUint16(this.height),
							t.writeUint32(this.horizresolution),
							t.writeUint32(this.vertresolution),
							t.writeUint32(0),
							t.writeUint16(this.frame_count),
							t.writeUint8(Math.min(31, this.compressorname.length)),
							t.writeString(this.compressorname, null, 31),
							t.writeUint16(this.depth),
							t.writeInt16(-1),
							this.writeFooter(t))
					}),
					(u.AudioSampleEntry.prototype.write = function (t) {
						;(this.writeHeader(t),
							(this.size += 20),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeUint16(this.channel_count),
							t.writeUint16(this.samplesize),
							t.writeUint16(0),
							t.writeUint16(0),
							t.writeUint32(this.samplerate << 16),
							this.writeFooter(t))
					}),
					(u.stppSampleEntry.prototype.write = function (t) {
						;(this.writeHeader(t),
							(this.size +=
								this.namespace.length +
								1 +
								this.schema_location.length +
								1 +
								this.auxiliary_mime_types.length +
								1),
							t.writeCString(this.namespace),
							t.writeCString(this.schema_location),
							t.writeCString(this.auxiliary_mime_types),
							this.writeFooter(t))
					}),
					(u.SampleGroupEntry.prototype.write = function (t) {
						t.writeUint8Array(this.data)
					}),
					(u.sbgpBox.prototype.write = function (t) {
						;((this.version = 1),
							(this.flags = 0),
							(this.size = 12 + 8 * this.entries.length),
							this.writeHeader(t),
							t.writeString(this.grouping_type, null, 4),
							t.writeUint32(this.grouping_type_parameter),
							t.writeUint32(this.entries.length))
						for (var e = 0; e < this.entries.length; e++) {
							var i = this.entries[e]
							;(t.writeInt32(i.sample_count), t.writeInt32(i.group_description_index))
						}
					}),
					(u.sgpdBox.prototype.write = function (t) {
						var e, i
						for (this.flags = 0, this.size = 12, e = 0; e < this.entries.length; e++)
							((i = this.entries[e]),
								1 === this.version &&
									(0 === this.default_length && (this.size += 4), (this.size += i.data.length)))
						for (
							this.writeHeader(t),
								t.writeString(this.grouping_type, null, 4),
								1 === this.version && t.writeUint32(this.default_length),
								this.version >= 2 && t.writeUint32(this.default_sample_description_index),
								t.writeUint32(this.entries.length),
								e = 0;
							e < this.entries.length;
							e++
						)
							((i = this.entries[e]),
								1 === this.version && 0 === this.default_length && t.writeUint32(i.description_length),
								i.write(t))
					}),
					(u.sidxBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 20 + 12 * this.references.length),
							this.writeHeader(t),
							t.writeUint32(this.reference_ID),
							t.writeUint32(this.timescale),
							t.writeUint32(this.earliest_presentation_time),
							t.writeUint32(this.first_offset),
							t.writeUint16(0),
							t.writeUint16(this.references.length))
						for (var e = 0; e < this.references.length; e++) {
							var i = this.references[e]
							;(t.writeUint32((i.reference_type << 31) | i.referenced_size),
								t.writeUint32(i.subsegment_duration),
								t.writeUint32((i.starts_with_SAP << 31) | (i.SAP_type << 28) | i.SAP_delta_time))
						}
					}),
					(u.smhdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 1),
							(this.size = 4),
							this.writeHeader(t),
							t.writeUint16(this.balance),
							t.writeUint16(0))
					}),
					(u.stcoBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 4 + 4 * this.chunk_offsets.length),
							this.writeHeader(t),
							t.writeUint32(this.chunk_offsets.length),
							t.writeUint32Array(this.chunk_offsets))
					}),
					(u.stscBox.prototype.write = function (t) {
						var e
						for (
							this.version = 0,
								this.flags = 0,
								this.size = 4 + 12 * this.first_chunk.length,
								this.writeHeader(t),
								t.writeUint32(this.first_chunk.length),
								e = 0;
							e < this.first_chunk.length;
							e++
						)
							(t.writeUint32(this.first_chunk[e]),
								t.writeUint32(this.samples_per_chunk[e]),
								t.writeUint32(this.sample_description_index[e]))
					}),
					(u.stsdBox.prototype.write = function (t) {
						var e
						for (
							this.version = 0,
								this.flags = 0,
								this.size = 0,
								this.writeHeader(t),
								t.writeUint32(this.entries.length),
								this.size += 4,
								e = 0;
							e < this.entries.length;
							e++
						)
							(this.entries[e].write(t), (this.size += this.entries[e].size))
						;(s.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size),
							t.adjustUint32(this.sizePosition, this.size))
					}),
					(u.stshBox.prototype.write = function (t) {
						var e
						for (
							this.version = 0,
								this.flags = 0,
								this.size = 4 + 8 * this.shadowed_sample_numbers.length,
								this.writeHeader(t),
								t.writeUint32(this.shadowed_sample_numbers.length),
								e = 0;
							e < this.shadowed_sample_numbers.length;
							e++
						)
							(t.writeUint32(this.shadowed_sample_numbers[e]), t.writeUint32(this.sync_sample_numbers[e]))
					}),
					(u.stssBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 4 + 4 * this.sample_numbers.length),
							this.writeHeader(t),
							t.writeUint32(this.sample_numbers.length),
							t.writeUint32Array(this.sample_numbers))
					}),
					(u.stszBox.prototype.write = function (t) {
						var e,
							i = !0
						if (((this.version = 0), (this.flags = 0), this.sample_sizes.length > 0))
							for (e = 0; e + 1 < this.sample_sizes.length; ) {
								if (this.sample_sizes[e + 1] !== this.sample_sizes[0]) {
									i = !1
									break
								}
								e++
							}
						else i = !1
						;((this.size = 8),
							i || (this.size += 4 * this.sample_sizes.length),
							this.writeHeader(t),
							i ? t.writeUint32(this.sample_sizes[0]) : t.writeUint32(0),
							t.writeUint32(this.sample_sizes.length),
							i || t.writeUint32Array(this.sample_sizes))
					}),
					(u.sttsBox.prototype.write = function (t) {
						var e
						for (
							this.version = 0,
								this.flags = 0,
								this.size = 4 + 8 * this.sample_counts.length,
								this.writeHeader(t),
								t.writeUint32(this.sample_counts.length),
								e = 0;
							e < this.sample_counts.length;
							e++
						)
							(t.writeUint32(this.sample_counts[e]), t.writeUint32(this.sample_deltas[e]))
					}),
					(u.tfdtBox.prototype.write = function (t) {
						var e = Math.pow(2, 32) - 1
						;((this.version = this.baseMediaDecodeTime > e ? 1 : 0),
							(this.flags = 0),
							(this.size = 4),
							1 === this.version && (this.size += 4),
							this.writeHeader(t),
							1 === this.version
								? t.writeUint64(this.baseMediaDecodeTime)
								: t.writeUint32(this.baseMediaDecodeTime))
					}),
					(u.tfhdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.size = 4),
							this.flags & u.TFHD_FLAG_BASE_DATA_OFFSET && (this.size += 8),
							this.flags & u.TFHD_FLAG_SAMPLE_DESC && (this.size += 4),
							this.flags & u.TFHD_FLAG_SAMPLE_DUR && (this.size += 4),
							this.flags & u.TFHD_FLAG_SAMPLE_SIZE && (this.size += 4),
							this.flags & u.TFHD_FLAG_SAMPLE_FLAGS && (this.size += 4),
							this.writeHeader(t),
							t.writeUint32(this.track_id),
							this.flags & u.TFHD_FLAG_BASE_DATA_OFFSET && t.writeUint64(this.base_data_offset),
							this.flags & u.TFHD_FLAG_SAMPLE_DESC &&
								t.writeUint32(this.default_sample_description_index),
							this.flags & u.TFHD_FLAG_SAMPLE_DUR && t.writeUint32(this.default_sample_duration),
							this.flags & u.TFHD_FLAG_SAMPLE_SIZE && t.writeUint32(this.default_sample_size),
							this.flags & u.TFHD_FLAG_SAMPLE_FLAGS && t.writeUint32(this.default_sample_flags))
					}),
					(u.tkhdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.size = 80),
							this.writeHeader(t),
							t.writeUint32(this.creation_time),
							t.writeUint32(this.modification_time),
							t.writeUint32(this.track_id),
							t.writeUint32(0),
							t.writeUint32(this.duration),
							t.writeUint32(0),
							t.writeUint32(0),
							t.writeInt16(this.layer),
							t.writeInt16(this.alternate_group),
							t.writeInt16(this.volume << 8),
							t.writeUint16(0),
							t.writeInt32Array(this.matrix),
							t.writeUint32(this.width),
							t.writeUint32(this.height))
					}),
					(u.trexBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = 20),
							this.writeHeader(t),
							t.writeUint32(this.track_id),
							t.writeUint32(this.default_sample_description_index),
							t.writeUint32(this.default_sample_duration),
							t.writeUint32(this.default_sample_size),
							t.writeUint32(this.default_sample_flags))
					}),
					(u.trunBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.size = 4),
							this.flags & u.TRUN_FLAGS_DATA_OFFSET && (this.size += 4),
							this.flags & u.TRUN_FLAGS_FIRST_FLAG && (this.size += 4),
							this.flags & u.TRUN_FLAGS_DURATION && (this.size += 4 * this.sample_duration.length),
							this.flags & u.TRUN_FLAGS_SIZE && (this.size += 4 * this.sample_size.length),
							this.flags & u.TRUN_FLAGS_FLAGS && (this.size += 4 * this.sample_flags.length),
							this.flags & u.TRUN_FLAGS_CTS_OFFSET &&
								(this.size += 4 * this.sample_composition_time_offset.length),
							this.writeHeader(t),
							t.writeUint32(this.sample_count),
							this.flags & u.TRUN_FLAGS_DATA_OFFSET &&
								((this.data_offset_position = t.getPosition()), t.writeInt32(this.data_offset)),
							this.flags & u.TRUN_FLAGS_FIRST_FLAG && t.writeUint32(this.first_sample_flags))
						for (var e = 0; e < this.sample_count; e++)
							(this.flags & u.TRUN_FLAGS_DURATION && t.writeUint32(this.sample_duration[e]),
								this.flags & u.TRUN_FLAGS_SIZE && t.writeUint32(this.sample_size[e]),
								this.flags & u.TRUN_FLAGS_FLAGS && t.writeUint32(this.sample_flags[e]),
								this.flags & u.TRUN_FLAGS_CTS_OFFSET &&
									(0 === this.version
										? t.writeUint32(this.sample_composition_time_offset[e])
										: t.writeInt32(this.sample_composition_time_offset[e])))
					}),
					(u["url Box"].prototype.write = function (t) {
						;((this.version = 0),
							this.location
								? ((this.flags = 0), (this.size = this.location.length + 1))
								: ((this.flags = 1), (this.size = 0)),
							this.writeHeader(t),
							this.location && t.writeCString(this.location))
					}),
					(u["urn Box"].prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 0),
							(this.size = this.name.length + 1 + (this.location ? this.location.length + 1 : 0)),
							this.writeHeader(t),
							t.writeCString(this.name),
							this.location && t.writeCString(this.location))
					}),
					(u.vmhdBox.prototype.write = function (t) {
						;((this.version = 0),
							(this.flags = 1),
							(this.size = 8),
							this.writeHeader(t),
							t.writeUint16(this.graphicsmode),
							t.writeUint16Array(this.opcolor))
					}),
					(u.cttsBox.prototype.unpack = function (t) {
						var e, i, r
						for (r = 0, e = 0; e < this.sample_counts.length; e++)
							for (i = 0; i < this.sample_counts[e]; i++)
								((t[r].pts = t[r].dts + this.sample_offsets[e]), r++)
					}),
					(u.sttsBox.prototype.unpack = function (t) {
						var e, i, r
						for (r = 0, e = 0; e < this.sample_counts.length; e++)
							for (i = 0; i < this.sample_counts[e]; i++)
								((t[r].dts = 0 === r ? 0 : t[r - 1].dts + this.sample_deltas[e]), r++)
					}),
					(u.stcoBox.prototype.unpack = function (t) {
						var e
						for (e = 0; e < this.chunk_offsets.length; e++) t[e].offset = this.chunk_offsets[e]
					}),
					(u.stscBox.prototype.unpack = function (t) {
						var e, i, r, s, n
						for (s = 0, n = 0, e = 0; e < this.first_chunk.length; e++)
							for (i = 0; i < (e + 1 < this.first_chunk.length ? this.first_chunk[e + 1] : 1 / 0); i++)
								for (n++, r = 0; r < this.samples_per_chunk[e]; r++) {
									if (!t[s]) return
									;((t[s].description_index = this.sample_description_index[e]),
										(t[s].chunk_index = n),
										s++)
								}
					}),
					(u.stszBox.prototype.unpack = function (t) {
						var e
						for (e = 0; e < this.sample_sizes.length; e++) t[e].size = this.sample_sizes[e]
					}),
					(u.DIFF_BOXES_PROP_NAMES = [
						"boxes",
						"entries",
						"references",
						"subsamples",
						"items",
						"item_infos",
						"extents",
						"associations",
						"subsegments",
						"ranges",
						"seekLists",
						"seekPoints",
						"esd",
						"levels",
					]),
					(u.DIFF_PRIMITIVE_ARRAY_PROP_NAMES = [
						"compatible_brands",
						"matrix",
						"opcolor",
						"sample_counts",
						"sample_deltas",
						"first_chunk",
						"samples_per_chunk",
						"sample_sizes",
						"chunk_offsets",
						"sample_offsets",
						"sample_description_index",
						"sample_duration",
					]),
					(u.boxEqualFields = function (t, e) {
						if (t && !e) return !1
						var i
						for (i in t)
							if (
								!(
									u.DIFF_BOXES_PROP_NAMES.indexOf(i) > -1 ||
									t[i] instanceof u.Box ||
									e[i] instanceof u.Box ||
									void 0 === t[i] ||
									void 0 === e[i] ||
									"function" == typeof t[i] ||
									"function" == typeof e[i] ||
									(t.subBoxNames && t.subBoxNames.indexOf(i.slice(0, 4)) > -1) ||
									(e.subBoxNames && e.subBoxNames.indexOf(i.slice(0, 4)) > -1) ||
									"data" === i ||
									"start" === i ||
									"size" === i ||
									"creation_time" === i ||
									"modification_time" === i ||
									u.DIFF_PRIMITIVE_ARRAY_PROP_NAMES.indexOf(i) > -1 ||
									t[i] === e[i]
								)
							)
								return !1
						return !0
					}),
					(u.boxEqual = function (t, e) {
						if (!u.boxEqualFields(t, e)) return !1
						for (var i = 0; i < u.DIFF_BOXES_PROP_NAMES.length; i++) {
							var r = u.DIFF_BOXES_PROP_NAMES[i]
							if (t[r] && e[r] && !u.boxEqual(t[r], e[r])) return !1
						}
						return !0
					}))
				var f = function () {}
				;((f.prototype.parseSample = function (t) {
					var e,
						i,
						r = new n(t.buffer)
					for (e = []; !r.isEos(); )
						(i = u.parseOneBox(r, !1)).code === u.OK && "vttc" === i.box.type && e.push(i.box)
					return e
				}),
					(f.prototype.getText = function (t, e, i) {
						function r(t, e, i) {
							return ((i = i || "0"), (t += "").length >= e ? t : new Array(e - t.length + 1).join(i) + t)
						}
						function s(t) {
							var e = Math.floor(t / 3600),
								i = Math.floor((t - 3600 * e) / 60),
								s = Math.floor(t - 3600 * e - 60 * i),
								n = Math.floor(1e3 * (t - 3600 * e - 60 * i - s))
							return r(e, 2) + ":" + r(i, 2) + ":" + r(s, 2) + "." + r(n, 3)
						}
						for (var n = this.parseSample(i), a = "", o = 0; o < n.length; o++) {
							var h = n[o]
							;((a += s(t) + " --\x3e " + s(e) + "\r\n"), (a += h.payl.text))
						}
						return a
					}))
				var m = function () {}
				m.prototype.parseSample = function (t) {
					var e,
						i = { resources: [] },
						r = new n(t.data.buffer)
					if (t.subsamples && 0 !== t.subsamples.length) {
						if (((i.documentString = r.readString(t.subsamples[0].size)), t.subsamples.length > 1))
							for (e = 1; e < t.subsamples.length; e++)
								i.resources[e] = r.readUint8Array(t.subsamples[e].size)
					} else i.documentString = r.readString(t.data.length)
					return (
						"undefined" != typeof DOMParser &&
							(i.document = new DOMParser().parseFromString(i.documentString, "application/xml")),
						i
					)
				}
				var _ = function () {}
				;((_.prototype.parseSample = function (t) {
					return new n(t.data.buffer).readString(t.data.length)
				}),
					(_.prototype.parseConfig = function (t) {
						var e = new n(t.buffer)
						return (e.readUint32(), e.readCString())
					}),
					(t.VTTin4Parser = f),
					(t.XMLSubtitlein4Parser = m),
					(t.Textin4Parser = _))
				var g = function (t) {
					;((this.stream = t || new h()),
						(this.boxes = []),
						(this.mdats = []),
						(this.moofs = []),
						(this.isProgressive = !1),
						(this.moovStartFound = !1),
						(this.onMoovStart = null),
						(this.moovStartSent = !1),
						(this.onReady = null),
						(this.readySent = !1),
						(this.onSegment = null),
						(this.onSamples = null),
						(this.onError = null),
						(this.sampleListBuilt = !1),
						(this.fragmentedTracks = []),
						(this.extractedTracks = []),
						(this.isFragmentationInitialized = !1),
						(this.sampleProcessingStarted = !1),
						(this.nextMoofNumber = 0),
						(this.itemListBuilt = !1),
						(this.items = []),
						(this.entity_groups = []),
						(this.onSidx = null),
						(this.sidxSent = !1))
				}
				;((g.prototype.setSegmentOptions = function (t, e, i) {
					var r = this.getTrackById(t)
					if (r) {
						var s = {}
						;(this.fragmentedTracks.push(s),
							(s.id = t),
							(s.user = e),
							(s.trak = r),
							(r.nextSample = 0),
							(s.segmentStream = null),
							(s.nb_samples = 1e3),
							(s.rapAlignement = !0),
							i &&
								(i.nbSamples && (s.nb_samples = i.nbSamples),
								i.rapAlignement && (s.rapAlignement = i.rapAlignement)))
					}
				}),
					(g.prototype.unsetSegmentOptions = function (t) {
						for (var e = -1, i = 0; i < this.fragmentedTracks.length; i++)
							this.fragmentedTracks[i].id == t && (e = i)
						e > -1 && this.fragmentedTracks.splice(e, 1)
					}),
					(g.prototype.setExtractionOptions = function (t, e, i) {
						var r = this.getTrackById(t)
						if (r) {
							var s = {}
							;(this.extractedTracks.push(s),
								(s.id = t),
								(s.user = e),
								(s.trak = r),
								(r.nextSample = 0),
								(s.nb_samples = 1e3),
								(s.samples = []),
								i && i.nbSamples && (s.nb_samples = i.nbSamples))
						}
					}),
					(g.prototype.unsetExtractionOptions = function (t) {
						for (var e = -1, i = 0; i < this.extractedTracks.length; i++)
							this.extractedTracks[i].id == t && (e = i)
						e > -1 && this.extractedTracks.splice(e, 1)
					}),
					(g.prototype.parse = function () {
						var t, e
						if (!this.restoreParsePosition || this.restoreParsePosition())
							for (;;) {
								if (this.hasIncompleteMdat && this.hasIncompleteMdat()) {
									if (this.processIncompleteMdat()) continue
									return
								}
								if (
									(this.saveParsePosition && this.saveParsePosition(),
									(t = u.parseOneBox(this.stream, !1)).code === u.ERR_NOT_ENOUGH_DATA)
								) {
									if (this.processIncompleteBox) {
										if (this.processIncompleteBox(t)) continue
										return
									}
									return
								}
								var i
								switch (((i = "uuid" !== (e = t.box).type ? e.type : e.uuid), this.boxes.push(e), i)) {
									case "mdat":
										this.mdats.push(e)
										break
									case "moof":
										this.moofs.push(e)
										break
									case "moov":
										;((this.moovStartFound = !0),
											0 === this.mdats.length && (this.isProgressive = !0))
									default:
										;(void 0 !== this[i] &&
											s.warn(
												"ISOFile",
												"Duplicate Box of type: " + i + ", overriding previous occurrence",
											),
											(this[i] = e))
								}
								this.updateUsedBytes && this.updateUsedBytes(e, t)
							}
					}),
					(g.prototype.checkBuffer = function (t) {
						if (null == t) throw "Buffer must be defined and non empty"
						if (void 0 === t.fileStart) throw "Buffer must have a fileStart property"
						return 0 === t.byteLength
							? (s.warn("ISOFile", "Ignoring empty buffer (fileStart: " + t.fileStart + ")"),
								this.stream.logBufferLevel(),
								!1)
							: (s.info("ISOFile", "Processing buffer (fileStart: " + t.fileStart + ")"),
								(t.usedBytes = 0),
								this.stream.insertBuffer(t),
								this.stream.logBufferLevel(),
								!!this.stream.initialized() || (s.warn("ISOFile", "Not ready to start parsing"), !1))
					}),
					(g.prototype.appendBuffer = function (t, e) {
						var i
						if (this.checkBuffer(t))
							return (
								this.parse(),
								this.moovStartFound &&
									!this.moovStartSent &&
									((this.moovStartSent = !0), this.onMoovStart && this.onMoovStart()),
								this.moov
									? (this.sampleListBuilt || (this.buildSampleLists(), (this.sampleListBuilt = !0)),
										this.updateSampleLists(),
										this.onReady &&
											!this.readySent &&
											((this.readySent = !0), this.onReady(this.getInfo())),
										this.processSamples(e),
										this.nextSeekPosition
											? ((i = this.nextSeekPosition), (this.nextSeekPosition = void 0))
											: (i = this.nextParsePosition),
										this.stream.getEndFilePositionAfter &&
											(i = this.stream.getEndFilePositionAfter(i)))
									: (i = this.nextParsePosition ? this.nextParsePosition : 0),
								this.sidx &&
									this.onSidx &&
									!this.sidxSent &&
									(this.onSidx(this.sidx), (this.sidxSent = !0)),
								this.meta &&
									(this.flattenItemInfo &&
										!this.itemListBuilt &&
										(this.flattenItemInfo(), (this.itemListBuilt = !0)),
									this.processItems && this.processItems(this.onItem)),
								this.stream.cleanBuffers &&
									(s.info(
										"ISOFile",
										"Done processing buffer (fileStart: " +
											t.fileStart +
											") - next buffer to fetch should have a fileStart position of " +
											i,
									),
									this.stream.logBufferLevel(),
									this.stream.cleanBuffers(),
									this.stream.logBufferLevel(!0),
									s.info(
										"ISOFile",
										"Sample data size in memory: " + this.getAllocatedSampleDataSize(),
									)),
								i
							)
					}),
					(g.prototype.getInfo = function () {
						var t,
							e,
							i,
							r,
							s,
							n,
							a = {},
							o = new Date("1904-01-01T00:00:00Z").getTime()
						if (this.moov)
							for (
								a.hasMoov = !0,
									a.duration = this.moov.mvhd.duration,
									a.timescale = this.moov.mvhd.timescale,
									a.isFragmented = null != this.moov.mvex,
									a.isFragmented &&
										this.moov.mvex.mehd &&
										(a.fragment_duration = this.moov.mvex.mehd.fragment_duration),
									a.isProgressive = this.isProgressive,
									a.hasIOD = null != this.moov.iods,
									a.brands = [],
									a.brands.push(this.ftyp.major_brand),
									a.brands = a.brands.concat(this.ftyp.compatible_brands),
									a.created = new Date(o + 1e3 * this.moov.mvhd.creation_time),
									a.modified = new Date(o + 1e3 * this.moov.mvhd.modification_time),
									a.tracks = [],
									a.audioTracks = [],
									a.videoTracks = [],
									a.subtitleTracks = [],
									a.metadataTracks = [],
									a.hintTracks = [],
									a.otherTracks = [],
									t = 0;
								t < this.moov.traks.length;
								t++
							) {
								if (
									((n = (i = this.moov.traks[t]).mdia.minf.stbl.stsd.entries[0]),
									(r = {}),
									a.tracks.push(r),
									(r.id = i.tkhd.track_id),
									(r.name = i.mdia.hdlr.name),
									(r.references = []),
									i.tref)
								)
									for (e = 0; e < i.tref.boxes.length; e++)
										((s = {}),
											r.references.push(s),
											(s.type = i.tref.boxes[e].type),
											(s.track_ids = i.tref.boxes[e].track_ids))
								;(i.edts && (r.edits = i.edts.elst.entries),
									(r.created = new Date(o + 1e3 * i.tkhd.creation_time)),
									(r.modified = new Date(o + 1e3 * i.tkhd.modification_time)),
									(r.movie_duration = i.tkhd.duration),
									(r.movie_timescale = a.timescale),
									(r.layer = i.tkhd.layer),
									(r.alternate_group = i.tkhd.alternate_group),
									(r.volume = i.tkhd.volume),
									(r.matrix = i.tkhd.matrix),
									(r.track_width = i.tkhd.width / 65536),
									(r.track_height = i.tkhd.height / 65536),
									(r.timescale = i.mdia.mdhd.timescale),
									(r.cts_shift = i.mdia.minf.stbl.cslg),
									(r.duration = i.mdia.mdhd.duration),
									(r.samples_duration = i.samples_duration),
									(r.codec = n.getCodec()),
									(r.kind =
										i.udta && i.udta.kinds.length ? i.udta.kinds[0] : { schemeURI: "", value: "" }),
									(r.language = i.mdia.elng
										? i.mdia.elng.extended_language
										: i.mdia.mdhd.languageString),
									(r.nb_samples = i.samples.length),
									(r.size = i.samples_size),
									(r.bitrate = (8 * r.size * r.timescale) / r.samples_duration),
									n.isAudio()
										? ((r.type = "audio"),
											a.audioTracks.push(r),
											(r.audio = {}),
											(r.audio.sample_rate = n.getSampleRate()),
											(r.audio.channel_count = n.getChannelCount()),
											(r.audio.sample_size = n.getSampleSize()))
										: n.isVideo()
											? ((r.type = "video"),
												a.videoTracks.push(r),
												(r.video = {}),
												(r.video.width = n.getWidth()),
												(r.video.height = n.getHeight()))
											: n.isSubtitle()
												? ((r.type = "subtitles"), a.subtitleTracks.push(r))
												: n.isHint()
													? ((r.type = "metadata"), a.hintTracks.push(r))
													: n.isMetadata()
														? ((r.type = "metadata"), a.metadataTracks.push(r))
														: ((r.type = "metadata"), a.otherTracks.push(r)))
							}
						else a.hasMoov = !1
						if (((a.mime = ""), a.hasMoov && a.tracks)) {
							for (
								a.videoTracks && a.videoTracks.length > 0
									? (a.mime += 'video/mp4; codecs="')
									: a.audioTracks && a.audioTracks.length > 0
										? (a.mime += 'audio/mp4; codecs="')
										: (a.mime += 'application/mp4; codecs="'),
									t = 0;
								t < a.tracks.length;
								t++
							)
								(0 !== t && (a.mime += ","), (a.mime += a.tracks[t].codec))
							;((a.mime += '"; profiles="'),
								(a.mime += this.ftyp.compatible_brands.join()),
								(a.mime += '"'))
						}
						return a
					}),
					(g.prototype.setNextSeekPositionFromSample = function (t) {
						t &&
							(this.nextSeekPosition
								? (this.nextSeekPosition = Math.min(t.offset + t.alreadyRead, this.nextSeekPosition))
								: (this.nextSeekPosition = t.offset + t.alreadyRead))
					}),
					(g.prototype.processSamples = function (t) {
						var e, i
						if (this.sampleProcessingStarted) {
							if (this.isFragmentationInitialized && null !== this.onSegment)
								for (e = 0; e < this.fragmentedTracks.length; e++) {
									var r = this.fragmentedTracks[e]
									for (
										i = r.trak;
										i.nextSample < i.samples.length && this.sampleProcessingStarted;

									) {
										s.debug(
											"ISOFile",
											"Creating media fragment on track #" + r.id + " for sample " + i.nextSample,
										)
										var n = this.createFragment(r.id, i.nextSample, r.segmentStream)
										if (!n) break
										if (
											((r.segmentStream = n),
											i.nextSample++,
											(i.nextSample % r.nb_samples === 0 ||
												t ||
												i.nextSample >= i.samples.length) &&
												(s.info(
													"ISOFile",
													"Sending fragmented data on track #" +
														r.id +
														" for samples [" +
														Math.max(0, i.nextSample - r.nb_samples) +
														"," +
														(i.nextSample - 1) +
														"]",
												),
												s.info(
													"ISOFile",
													"Sample data size in memory: " + this.getAllocatedSampleDataSize(),
												),
												this.onSegment &&
													this.onSegment(
														r.id,
														r.user,
														r.segmentStream.buffer,
														i.nextSample,
														t || i.nextSample >= i.samples.length,
													),
												(r.segmentStream = null),
												r !== this.fragmentedTracks[e]))
										)
											break
									}
								}
							if (null !== this.onSamples)
								for (e = 0; e < this.extractedTracks.length; e++) {
									var a = this.extractedTracks[e]
									for (
										i = a.trak;
										i.nextSample < i.samples.length && this.sampleProcessingStarted;

									) {
										s.debug("ISOFile", "Exporting on track #" + a.id + " sample #" + i.nextSample)
										var o = this.getSample(i, i.nextSample)
										if (!o) {
											this.setNextSeekPositionFromSample(i.samples[i.nextSample])
											break
										}
										if (
											(i.nextSample++,
											a.samples.push(o),
											(i.nextSample % a.nb_samples === 0 || i.nextSample >= i.samples.length) &&
												(s.debug(
													"ISOFile",
													"Sending samples on track #" + a.id + " for sample " + i.nextSample,
												),
												this.onSamples && this.onSamples(a.id, a.user, a.samples),
												(a.samples = []),
												a !== this.extractedTracks[e]))
										)
											break
									}
								}
						}
					}),
					(g.prototype.getBox = function (t) {
						var e = this.getBoxes(t, !0)
						return e.length ? e[0] : null
					}),
					(g.prototype.getBoxes = function (t, e) {
						var i = []
						return (g._sweep.call(this, t, i, e), i)
					}),
					(g._sweep = function (t, e, i) {
						for (var r in (this.type && this.type == t && e.push(this), this.boxes)) {
							if (e.length && i) return
							g._sweep.call(this.boxes[r], t, e, i)
						}
					}),
					(g.prototype.getTrackSamplesInfo = function (t) {
						var e = this.getTrackById(t)
						return e ? e.samples : void 0
					}),
					(g.prototype.getTrackSample = function (t, e) {
						var i = this.getTrackById(t)
						return this.getSample(i, e)
					}),
					(g.prototype.releaseUsedSamples = function (t, e) {
						var i = 0,
							r = this.getTrackById(t)
						r.lastValidSample || (r.lastValidSample = 0)
						for (var n = r.lastValidSample; n < e; n++) i += this.releaseSample(r, n)
						;(s.info(
							"ISOFile",
							"Track #" +
								t +
								" released samples up to " +
								e +
								" (released size: " +
								i +
								", remaining: " +
								this.samplesDataSize +
								")",
						),
							(r.lastValidSample = e))
					}),
					(g.prototype.start = function () {
						;((this.sampleProcessingStarted = !0), this.processSamples(!1))
					}),
					(g.prototype.stop = function () {
						this.sampleProcessingStarted = !1
					}),
					(g.prototype.flush = function () {
						;(s.info("ISOFile", "Flushing remaining samples"),
							this.updateSampleLists(),
							this.processSamples(!0),
							this.stream.cleanBuffers(),
							this.stream.logBufferLevel(!0))
					}),
					(g.prototype.seekTrack = function (t, e, i) {
						var r,
							n,
							a,
							o,
							h = 0,
							c = 0
						if (0 === i.samples.length)
							return (
								s.info(
									"ISOFile",
									"No sample in track, cannot seek! Using time " +
										s.getDurationString(0, 1) +
										" and offset: 0",
								),
								{ offset: 0, time: 0 }
							)
						for (r = 0; r < i.samples.length; r++) {
							if (((n = i.samples[r]), 0 === r)) ((c = 0), (o = n.timescale))
							else if (n.cts > t * n.timescale) {
								c = r - 1
								break
							}
							e && n.is_sync && (h = r)
						}
						for (
							e && (c = h), t = i.samples[c].cts, i.nextSample = c;
							i.samples[c].alreadyRead === i.samples[c].size && i.samples[c + 1];

						)
							c++
						return (
							(a = i.samples[c].offset + i.samples[c].alreadyRead),
							s.info(
								"ISOFile",
								"Seeking to " +
									(e ? "RAP" : "") +
									" sample #" +
									i.nextSample +
									" on track " +
									i.tkhd.track_id +
									", time " +
									s.getDurationString(t, o) +
									" and offset: " +
									a,
							),
							{ offset: a, time: t / o }
						)
					}),
					(g.prototype.getTrackDuration = function (t) {
						var e
						return t.samples
							? ((e = t.samples[t.samples.length - 1]).cts + e.duration) / e.timescale
							: 1 / 0
					}),
					(g.prototype.seek = function (t, e) {
						var i,
							r,
							n,
							a = this.moov,
							o = { offset: 1 / 0, time: 1 / 0 }
						if (this.moov) {
							for (n = 0; n < a.traks.length; n++)
								((i = a.traks[n]),
									t > this.getTrackDuration(i) ||
										((r = this.seekTrack(t, e, i)).offset < o.offset && (o.offset = r.offset),
										r.time < o.time && (o.time = r.time)))
							return (
								s.info(
									"ISOFile",
									"Seeking at time " +
										s.getDurationString(o.time, 1) +
										" needs a buffer with a fileStart position of " +
										o.offset,
								),
								o.offset === 1 / 0
									? (o = { offset: this.nextParsePosition, time: 0 })
									: (o.offset = this.stream.getEndFilePositionAfter(o.offset)),
								s.info(
									"ISOFile",
									"Adjusted seek position (after checking data already in buffer): " + o.offset,
								),
								o
							)
						}
						throw "Cannot seek: moov not received!"
					}),
					(g.prototype.equal = function (t) {
						for (var e = 0; e < this.boxes.length && e < t.boxes.length; ) {
							var i = this.boxes[e],
								r = t.boxes[e]
							if (!u.boxEqual(i, r)) return !1
							e++
						}
						return !0
					}),
					(t.ISOFile = g),
					(g.prototype.lastBoxStartPosition = 0),
					(g.prototype.parsingMdat = null),
					(g.prototype.nextParsePosition = 0),
					(g.prototype.discardMdatData = !1),
					(g.prototype.processIncompleteBox = function (t) {
						var e
						return "mdat" === t.type
							? ((e = new u[t.type + "Box"](t.size)),
								(this.parsingMdat = e),
								this.boxes.push(e),
								this.mdats.push(e),
								(e.start = t.start),
								(e.hdr_size = t.hdr_size),
								this.stream.addUsedBytes(e.hdr_size),
								(this.lastBoxStartPosition = e.start + e.size),
								this.stream.seek(e.start + e.size, !1, this.discardMdatData)
									? ((this.parsingMdat = null), !0)
									: (this.moovStartFound
											? (this.nextParsePosition = this.stream.findEndContiguousBuf())
											: (this.nextParsePosition = e.start + e.size),
										!1))
							: ("moov" === t.type &&
									((this.moovStartFound = !0), 0 === this.mdats.length && (this.isProgressive = !0)),
								this.stream.mergeNextBuffer && this.stream.mergeNextBuffer()
									? ((this.nextParsePosition = this.stream.getEndPosition()), !0)
									: (t.type
											? this.moovStartFound
												? (this.nextParsePosition = this.stream.getEndPosition())
												: (this.nextParsePosition = this.stream.getPosition() + t.size)
											: (this.nextParsePosition = this.stream.getEndPosition()),
										!1))
					}),
					(g.prototype.hasIncompleteMdat = function () {
						return null !== this.parsingMdat
					}),
					(g.prototype.processIncompleteMdat = function () {
						var t
						return (
							(t = this.parsingMdat),
							this.stream.seek(t.start + t.size, !1, this.discardMdatData)
								? (s.debug("ISOFile", "Found 'mdat' end in buffered data"),
									(this.parsingMdat = null),
									!0)
								: ((this.nextParsePosition = this.stream.findEndContiguousBuf()), !1)
						)
					}),
					(g.prototype.restoreParsePosition = function () {
						return this.stream.seek(this.lastBoxStartPosition, !0, this.discardMdatData)
					}),
					(g.prototype.saveParsePosition = function () {
						this.lastBoxStartPosition = this.stream.getPosition()
					}),
					(g.prototype.updateUsedBytes = function (t, e) {
						this.stream.addUsedBytes &&
							("mdat" === t.type
								? (this.stream.addUsedBytes(t.hdr_size),
									this.discardMdatData && this.stream.addUsedBytes(t.size - t.hdr_size))
								: this.stream.addUsedBytes(t.size))
					}),
					(g.prototype.add = u.Box.prototype.add),
					(g.prototype.addBox = u.Box.prototype.addBox),
					(g.prototype.init = function (t) {
						var e = t || {}
						this.add("ftyp")
							.set("major_brand", (e.brands && e.brands[0]) || "iso4")
							.set("minor_version", 0)
							.set("compatible_brands", e.brands || ["iso4"])
						var i = this.add("moov")
						return (
							i
								.add("mvhd")
								.set("timescale", e.timescale || 600)
								.set("rate", e.rate || 65536)
								.set("creation_time", 0)
								.set("modification_time", 0)
								.set("duration", e.duration || 0)
								.set("volume", e.width ? 0 : 256)
								.set("matrix", [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824])
								.set("next_track_id", 1),
							i.add("mvex"),
							this
						)
					}),
					(g.prototype.addTrack = function (t) {
						this.moov || this.init(t)
						var e = t || {}
						;((e.width = e.width || 320),
							(e.height = e.height || 320),
							(e.id = e.id || this.moov.mvhd.next_track_id),
							(e.type = e.type || "avc1"))
						var i = this.moov.add("trak")
						;((this.moov.mvhd.next_track_id = e.id + 1),
							i
								.add("tkhd")
								.set("flags", u.TKHD_FLAG_ENABLED | u.TKHD_FLAG_IN_MOVIE | u.TKHD_FLAG_IN_PREVIEW)
								.set("creation_time", 0)
								.set("modification_time", 0)
								.set("track_id", e.id)
								.set("duration", e.duration || 0)
								.set("layer", e.layer || 0)
								.set("alternate_group", 0)
								.set("volume", 1)
								.set("matrix", [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824])
								.set("width", e.width << 16)
								.set("height", e.height << 16))
						var r = i.add("mdia")
						;(r
							.add("mdhd")
							.set("creation_time", 0)
							.set("modification_time", 0)
							.set("timescale", e.timescale || 1)
							.set("duration", e.media_duration || 0)
							.set("language", e.language || "und"),
							r
								.add("hdlr")
								.set("handler", e.hdlr || "vide")
								.set("name", e.name || "Track created with MP4Box.js"),
							r.add("elng").set("extended_language", e.language || "fr-FR"))
						var s = r.add("minf")
						if (void 0 !== u[e.type + "SampleEntry"]) {
							var a = new u[e.type + "SampleEntry"]()
							a.data_reference_index = 1
							var o = ""
							for (var h in u.sampleEntryCodes)
								for (var c = u.sampleEntryCodes[h], l = 0; l < c.length; l++)
									if (c.indexOf(e.type) > -1) {
										o = h
										break
									}
							switch (o) {
								case "Visual":
									if (
										(s.add("vmhd").set("graphicsmode", 0).set("opcolor", [0, 0, 0]),
										a
											.set("width", e.width)
											.set("height", e.height)
											.set("horizresolution", 72 << 16)
											.set("vertresolution", 72 << 16)
											.set("frame_count", 1)
											.set("compressorname", e.type + " Compressor")
											.set("depth", 24),
										e.avcDecoderConfigRecord)
									) {
										var p = new u.avcCBox()
										;(p.parse(new n(e.avcDecoderConfigRecord)), a.addBox(p))
									} else if (e.hevcDecoderConfigRecord) {
										var d = new u.hvcCBox()
										;(d.parse(new n(e.hevcDecoderConfigRecord)), a.addBox(d))
									}
									break
								case "Audio":
									;(s.add("smhd").set("balance", e.balance || 0),
										a
											.set("channel_count", e.channel_count || 2)
											.set("samplesize", e.samplesize || 16)
											.set("samplerate", e.samplerate || 65536))
									break
								case "Hint":
									s.add("hmhd")
									break
								case "Subtitle":
									;(s.add("sthd"),
										"stpp" === e.type &&
											a
												.set("namespace", e.namespace || "nonamespace")
												.set("schema_location", e.schema_location || "")
												.set("auxiliary_mime_types", e.auxiliary_mime_types || ""))
									break
								default:
									s.add("nmhd")
							}
							;(e.description && a.addBox(e.description),
								e.description_boxes &&
									e.description_boxes.forEach(function (t) {
										a.addBox(t)
									}),
								s.add("dinf").add("dref").addEntry(new u["url Box"]().set("flags", 1)))
							var f = s.add("stbl")
							return (
								f.add("stsd").addEntry(a),
								f.add("stts").set("sample_counts", []).set("sample_deltas", []),
								f
									.add("stsc")
									.set("first_chunk", [])
									.set("samples_per_chunk", [])
									.set("sample_description_index", []),
								f.add("stco").set("chunk_offsets", []),
								f.add("stsz").set("sample_sizes", []),
								this.moov.mvex
									.add("trex")
									.set("track_id", e.id)
									.set("default_sample_description_index", e.default_sample_description_index || 1)
									.set("default_sample_duration", e.default_sample_duration || 0)
									.set("default_sample_size", e.default_sample_size || 0)
									.set("default_sample_flags", e.default_sample_flags || 0),
								this.buildTrakSampleLists(i),
								e.id
							)
						}
					}),
					(u.Box.prototype.computeSize = function (t) {
						var e = t || new a()
						;((e.endianness = a.BIG_ENDIAN), this.write(e))
					}),
					(g.prototype.addSample = function (t, e, i) {
						var r = i || {},
							s = {},
							n = this.getTrackById(t)
						if (null !== n) {
							;((s.number = n.samples.length),
								(s.track_id = n.tkhd.track_id),
								(s.timescale = n.mdia.mdhd.timescale),
								(s.description_index = r.sample_description_index ? r.sample_description_index - 1 : 0),
								(s.description = n.mdia.minf.stbl.stsd.entries[s.description_index]),
								(s.data = e),
								(s.size = e.byteLength),
								(s.alreadyRead = s.size),
								(s.duration = r.duration || 1),
								(s.cts = r.cts || 0),
								(s.dts = r.dts || 0),
								(s.is_sync = r.is_sync || !1),
								(s.is_leading = r.is_leading || 0),
								(s.depends_on = r.depends_on || 0),
								(s.is_depended_on = r.is_depended_on || 0),
								(s.has_redundancy = r.has_redundancy || 0),
								(s.degradation_priority = r.degradation_priority || 0),
								(s.offset = 0),
								(s.subsamples = r.subsamples),
								n.samples.push(s),
								(n.samples_size += s.size),
								(n.samples_duration += s.duration),
								void 0 === n.first_dts && (n.first_dts = r.dts),
								this.processSamples())
							var a = this.createSingleSampleMoof(s)
							return (
								this.addBox(a),
								a.computeSize(),
								(a.trafs[0].truns[0].data_offset = a.size + 8),
								(this.add("mdat").data = new Uint8Array(e)),
								s
							)
						}
					}),
					(g.prototype.createSingleSampleMoof = function (t) {
						var e = 0
						e = t.is_sync ? 1 << 25 : 65536
						var i = new u.moofBox()
						;(i.add("mfhd").set("sequence_number", this.nextMoofNumber), this.nextMoofNumber++)
						var r = i.add("traf"),
							s = this.getTrackById(t.track_id)
						return (
							r.add("tfhd").set("track_id", t.track_id).set("flags", u.TFHD_FLAG_DEFAULT_BASE_IS_MOOF),
							r.add("tfdt").set("baseMediaDecodeTime", t.dts - (s.first_dts || 0)),
							r
								.add("trun")
								.set(
									"flags",
									u.TRUN_FLAGS_DATA_OFFSET |
										u.TRUN_FLAGS_DURATION |
										u.TRUN_FLAGS_SIZE |
										u.TRUN_FLAGS_FLAGS |
										u.TRUN_FLAGS_CTS_OFFSET,
								)
								.set("data_offset", 0)
								.set("first_sample_flags", 0)
								.set("sample_count", 1)
								.set("sample_duration", [t.duration])
								.set("sample_size", [t.size])
								.set("sample_flags", [e])
								.set("sample_composition_time_offset", [t.cts - t.dts]),
							i
						)
					}),
					(g.prototype.lastMoofIndex = 0),
					(g.prototype.samplesDataSize = 0),
					(g.prototype.resetTables = function () {
						var t, e, i, r, s, n
						for (
							this.initial_duration = this.moov.mvhd.duration, this.moov.mvhd.duration = 0, t = 0;
							t < this.moov.traks.length;
							t++
						) {
							;(((e = this.moov.traks[t]).tkhd.duration = 0),
								(e.mdia.mdhd.duration = 0),
								((e.mdia.minf.stbl.stco || e.mdia.minf.stbl.co64).chunk_offsets = []),
								((i = e.mdia.minf.stbl.stsc).first_chunk = []),
								(i.samples_per_chunk = []),
								(i.sample_description_index = []),
								((e.mdia.minf.stbl.stsz || e.mdia.minf.stbl.stz2).sample_sizes = []),
								((r = e.mdia.minf.stbl.stts).sample_counts = []),
								(r.sample_deltas = []),
								(s = e.mdia.minf.stbl.ctts) && ((s.sample_counts = []), (s.sample_offsets = [])),
								(n = e.mdia.minf.stbl.stss))
							var a = e.mdia.minf.stbl.boxes.indexOf(n)
							;-1 != a && (e.mdia.minf.stbl.boxes[a] = null)
						}
					}),
					(g.initSampleGroups = function (t, e, i, r, s) {
						var n, a, o, h
						function c(t, e, i) {
							;((this.grouping_type = t),
								(this.grouping_type_parameter = e),
								(this.sbgp = i),
								(this.last_sample_in_run = -1),
								(this.entry_index = -1))
						}
						for (
							e && (e.sample_groups_info = []),
								t.sample_groups_info || (t.sample_groups_info = []),
								a = 0;
							a < i.length;
							a++
						) {
							for (
								h = i[a].grouping_type + "/" + i[a].grouping_type_parameter,
									o = new c(i[a].grouping_type, i[a].grouping_type_parameter, i[a]),
									e && (e.sample_groups_info[h] = o),
									t.sample_groups_info[h] || (t.sample_groups_info[h] = o),
									n = 0;
								n < r.length;
								n++
							)
								r[n].grouping_type === i[a].grouping_type &&
									((o.description = r[n]), (o.description.used = !0))
							if (s)
								for (n = 0; n < s.length; n++)
									s[n].grouping_type === i[a].grouping_type &&
										((o.fragment_description = s[n]),
										(o.fragment_description.used = !0),
										(o.is_fragment = !0))
						}
						if (e) {
							if (s)
								for (a = 0; a < s.length; a++)
									!s[a].used &&
										s[a].version >= 2 &&
										((h = s[a].grouping_type + "/0"),
										((o = new c(s[a].grouping_type, 0)).is_fragment = !0),
										e.sample_groups_info[h] || (e.sample_groups_info[h] = o))
						} else
							for (a = 0; a < r.length; a++)
								!r[a].used &&
									r[a].version >= 2 &&
									((h = r[a].grouping_type + "/0"),
									(o = new c(r[a].grouping_type, 0)),
									t.sample_groups_info[h] || (t.sample_groups_info[h] = o))
					}),
					(g.setSampleGroupProperties = function (t, e, i, r) {
						var s, n
						for (s in ((e.sample_groups = []), r)) {
							var a
							;((e.sample_groups[s] = {}),
								(e.sample_groups[s].grouping_type = r[s].grouping_type),
								(e.sample_groups[s].grouping_type_parameter = r[s].grouping_type_parameter),
								i >= r[s].last_sample_in_run &&
									(r[s].last_sample_in_run < 0 && (r[s].last_sample_in_run = 0),
									r[s].entry_index++,
									r[s].entry_index <= r[s].sbgp.entries.length - 1 &&
										(r[s].last_sample_in_run += r[s].sbgp.entries[r[s].entry_index].sample_count)),
								r[s].entry_index <= r[s].sbgp.entries.length - 1
									? (e.sample_groups[s].group_description_index =
											r[s].sbgp.entries[r[s].entry_index].group_description_index)
									: (e.sample_groups[s].group_description_index = -1),
								0 !== e.sample_groups[s].group_description_index &&
									((a = r[s].fragment_description ? r[s].fragment_description : r[s].description),
									e.sample_groups[s].group_description_index > 0
										? ((n =
												e.sample_groups[s].group_description_index > 65535
													? (e.sample_groups[s].group_description_index >> 16) - 1
													: e.sample_groups[s].group_description_index - 1),
											a && n >= 0 && (e.sample_groups[s].description = a.entries[n]))
										: a &&
											a.version >= 2 &&
											a.default_group_description_index > 0 &&
											(e.sample_groups[s].description =
												a.entries[a.default_group_description_index - 1])))
						}
					}),
					(g.process_sdtp = function (t, e, i) {
						e &&
							(t
								? ((e.is_leading = t.is_leading[i]),
									(e.depends_on = t.sample_depends_on[i]),
									(e.is_depended_on = t.sample_is_depended_on[i]),
									(e.has_redundancy = t.sample_has_redundancy[i]))
								: ((e.is_leading = 0),
									(e.depends_on = 0),
									(e.is_depended_on = 0),
									(e.has_redundancy = 0)))
					}),
					(g.prototype.buildSampleLists = function () {
						var t, e
						for (t = 0; t < this.moov.traks.length; t++)
							((e = this.moov.traks[t]), this.buildTrakSampleLists(e))
					}),
					(g.prototype.buildTrakSampleLists = function (t) {
						var e, i, r, s, n, a, o, h, c, u, l, p, d, f, m, _, y, b, w, U, S, x, v, E
						if (
							((t.samples = []),
							(t.samples_duration = 0),
							(t.samples_size = 0),
							(i = t.mdia.minf.stbl.stco || t.mdia.minf.stbl.co64),
							(r = t.mdia.minf.stbl.stsc),
							(s = t.mdia.minf.stbl.stsz || t.mdia.minf.stbl.stz2),
							(n = t.mdia.minf.stbl.stts),
							(a = t.mdia.minf.stbl.ctts),
							(o = t.mdia.minf.stbl.stss),
							(h = t.mdia.minf.stbl.stsd),
							(c = t.mdia.minf.stbl.subs),
							(p = t.mdia.minf.stbl.stdp),
							(u = t.mdia.minf.stbl.sbgps),
							(l = t.mdia.minf.stbl.sgpds),
							(b = -1),
							(w = -1),
							(U = -1),
							(S = -1),
							(x = 0),
							(v = 0),
							(E = 0),
							g.initSampleGroups(t, null, u, l),
							void 0 !== s)
						) {
							for (e = 0; e < s.sample_sizes.length; e++) {
								var B = {}
								;((B.number = e),
									(B.track_id = t.tkhd.track_id),
									(B.timescale = t.mdia.mdhd.timescale),
									(B.alreadyRead = 0),
									(t.samples[e] = B),
									(B.size = s.sample_sizes[e]),
									(t.samples_size += B.size),
									0 === e
										? ((f = 1),
											(d = 0),
											(B.chunk_index = f),
											(B.chunk_run_index = d),
											(y = r.samples_per_chunk[d]),
											(_ = 0),
											(m = d + 1 < r.first_chunk.length ? r.first_chunk[d + 1] - 1 : 1 / 0))
										: e < y
											? ((B.chunk_index = f), (B.chunk_run_index = d))
											: (f++,
												(B.chunk_index = f),
												(_ = 0),
												f <= m ||
													(m =
														1 + ++d < r.first_chunk.length
															? r.first_chunk[d + 1] - 1
															: 1 / 0),
												(B.chunk_run_index = d),
												(y += r.samples_per_chunk[d])),
									(B.description_index = r.sample_description_index[B.chunk_run_index] - 1),
									(B.description = h.entries[B.description_index]),
									(B.offset = i.chunk_offsets[B.chunk_index - 1] + _),
									(_ += B.size),
									e > b && (w++, b < 0 && (b = 0), (b += n.sample_counts[w])),
									e > 0
										? ((t.samples[e - 1].duration = n.sample_deltas[w]),
											(t.samples_duration += t.samples[e - 1].duration),
											(B.dts = t.samples[e - 1].dts + t.samples[e - 1].duration))
										: (B.dts = 0),
									a
										? (e >= U && (S++, U < 0 && (U = 0), (U += a.sample_counts[S])),
											(B.cts = t.samples[e].dts + a.sample_offsets[S]))
										: (B.cts = B.dts),
									o
										? (e == o.sample_numbers[x] - 1
												? ((B.is_sync = !0), x++)
												: ((B.is_sync = !1), (B.degradation_priority = 0)),
											c &&
												c.entries[v].sample_delta + E == e + 1 &&
												((B.subsamples = c.entries[v].subsamples),
												(E += c.entries[v].sample_delta),
												v++))
										: (B.is_sync = !0),
									g.process_sdtp(t.mdia.minf.stbl.sdtp, B, B.number),
									(B.degradation_priority = p ? p.priority[e] : 0),
									c &&
										c.entries[v].sample_delta + E == e &&
										((B.subsamples = c.entries[v].subsamples), (E += c.entries[v].sample_delta)),
									(u.length > 0 || l.length > 0) &&
										g.setSampleGroupProperties(t, B, e, t.sample_groups_info))
							}
							e > 0 &&
								((t.samples[e - 1].duration = Math.max(t.mdia.mdhd.duration - t.samples[e - 1].dts, 0)),
								(t.samples_duration += t.samples[e - 1].duration))
						}
					}),
					(g.prototype.updateSampleLists = function () {
						var t, e, i, r, s, n, a, o, h, c, l, p, d, f, m
						if (void 0 !== this.moov)
							for (; this.lastMoofIndex < this.moofs.length; )
								if (((h = this.moofs[this.lastMoofIndex]), this.lastMoofIndex++, "moof" == h.type))
									for (c = h, t = 0; t < c.trafs.length; t++) {
										for (
											l = c.trafs[t],
												p = this.getTrackById(l.tfhd.track_id),
												d = this.getTrexById(l.tfhd.track_id),
												r =
													l.tfhd.flags & u.TFHD_FLAG_SAMPLE_DESC
														? l.tfhd.default_sample_description_index
														: d
															? d.default_sample_description_index
															: 1,
												s =
													l.tfhd.flags & u.TFHD_FLAG_SAMPLE_DUR
														? l.tfhd.default_sample_duration
														: d
															? d.default_sample_duration
															: 0,
												n =
													l.tfhd.flags & u.TFHD_FLAG_SAMPLE_SIZE
														? l.tfhd.default_sample_size
														: d
															? d.default_sample_size
															: 0,
												a =
													l.tfhd.flags & u.TFHD_FLAG_SAMPLE_FLAGS
														? l.tfhd.default_sample_flags
														: d
															? d.default_sample_flags
															: 0,
												l.sample_number = 0,
												l.sbgps.length > 0 &&
													g.initSampleGroups(p, l, l.sbgps, p.mdia.minf.stbl.sgpds, l.sgpds),
												e = 0;
											e < l.truns.length;
											e++
										) {
											var _ = l.truns[e]
											for (i = 0; i < _.sample_count; i++) {
												;(((f = {}).moof_number = this.lastMoofIndex),
													(f.number_in_traf = l.sample_number),
													l.sample_number++,
													(f.number = p.samples.length),
													(l.first_sample_index = p.samples.length),
													p.samples.push(f),
													(f.track_id = p.tkhd.track_id),
													(f.timescale = p.mdia.mdhd.timescale),
													(f.description_index = r - 1),
													(f.description =
														p.mdia.minf.stbl.stsd.entries[f.description_index]),
													(f.size = n),
													_.flags & u.TRUN_FLAGS_SIZE && (f.size = _.sample_size[i]),
													(p.samples_size += f.size),
													(f.duration = s),
													_.flags & u.TRUN_FLAGS_DURATION &&
														(f.duration = _.sample_duration[i]),
													(p.samples_duration += f.duration),
													p.first_traf_merged || i > 0
														? (f.dts =
																p.samples[p.samples.length - 2].dts +
																p.samples[p.samples.length - 2].duration)
														: (l.tfdt ? (f.dts = l.tfdt.baseMediaDecodeTime) : (f.dts = 0),
															(p.first_traf_merged = !0)),
													(f.cts = f.dts),
													_.flags & u.TRUN_FLAGS_CTS_OFFSET &&
														(f.cts = f.dts + _.sample_composition_time_offset[i]),
													(m = a),
													_.flags & u.TRUN_FLAGS_FLAGS
														? (m = _.sample_flags[i])
														: 0 === i &&
															_.flags & u.TRUN_FLAGS_FIRST_FLAG &&
															(m = _.first_sample_flags),
													(f.is_sync = !((m >> 16) & 1)),
													(f.is_leading = (m >> 26) & 3),
													(f.depends_on = (m >> 24) & 3),
													(f.is_depended_on = (m >> 22) & 3),
													(f.has_redundancy = (m >> 20) & 3),
													(f.degradation_priority = 65535 & m))
												var y = !!(l.tfhd.flags & u.TFHD_FLAG_BASE_DATA_OFFSET),
													b = !!(l.tfhd.flags & u.TFHD_FLAG_DEFAULT_BASE_IS_MOOF),
													w = !!(_.flags & u.TRUN_FLAGS_DATA_OFFSET),
													U = 0
												;((U = y ? l.tfhd.base_data_offset : b || 0 === e ? c.start : o),
													(f.offset = 0 === e && 0 === i ? (w ? U + _.data_offset : U) : o),
													(o = f.offset + f.size),
													(l.sbgps.length > 0 ||
														l.sgpds.length > 0 ||
														p.mdia.minf.stbl.sbgps.length > 0 ||
														p.mdia.minf.stbl.sgpds.length > 0) &&
														g.setSampleGroupProperties(
															p,
															f,
															f.number_in_traf,
															l.sample_groups_info,
														))
											}
										}
										if (l.subs) {
											p.has_fragment_subsamples = !0
											var S = l.first_sample_index
											for (e = 0; e < l.subs.entries.length; e++)
												((S += l.subs.entries[e].sample_delta),
													((f = p.samples[S - 1]).subsamples = l.subs.entries[e].subsamples))
										}
									}
					}),
					(g.prototype.getSample = function (t, e) {
						var i,
							r = t.samples[e]
						if (!this.moov) return null
						if (r.data) {
							if (r.alreadyRead == r.size) return r
						} else
							((r.data = new Uint8Array(r.size)),
								(r.alreadyRead = 0),
								(this.samplesDataSize += r.size),
								s.debug(
									"ISOFile",
									"Allocating sample #" +
										e +
										" on track #" +
										t.tkhd.track_id +
										" of size " +
										r.size +
										" (total: " +
										this.samplesDataSize +
										")",
								))
						for (;;) {
							var n = this.stream.findPosition(!0, r.offset + r.alreadyRead, !1)
							if (!(n > -1)) return null
							var o = (i = this.stream.buffers[n]).byteLength - (r.offset + r.alreadyRead - i.fileStart)
							if (r.size - r.alreadyRead <= o)
								return (
									s.debug(
										"ISOFile",
										"Getting sample #" +
											e +
											" data (alreadyRead: " +
											r.alreadyRead +
											" offset: " +
											(r.offset + r.alreadyRead - i.fileStart) +
											" read size: " +
											(r.size - r.alreadyRead) +
											" full size: " +
											r.size +
											")",
									),
									a.memcpy(
										r.data.buffer,
										r.alreadyRead,
										i,
										r.offset + r.alreadyRead - i.fileStart,
										r.size - r.alreadyRead,
									),
									(i.usedBytes += r.size - r.alreadyRead),
									this.stream.logBufferLevel(),
									(r.alreadyRead = r.size),
									r
								)
							if (0 === o) return null
							;(s.debug(
								"ISOFile",
								"Getting sample #" +
									e +
									" partial data (alreadyRead: " +
									r.alreadyRead +
									" offset: " +
									(r.offset + r.alreadyRead - i.fileStart) +
									" read size: " +
									o +
									" full size: " +
									r.size +
									")",
							),
								a.memcpy(r.data.buffer, r.alreadyRead, i, r.offset + r.alreadyRead - i.fileStart, o),
								(r.alreadyRead += o),
								(i.usedBytes += o),
								this.stream.logBufferLevel())
						}
					}),
					(g.prototype.releaseSample = function (t, e) {
						var i = t.samples[e]
						return i.data
							? ((this.samplesDataSize -= i.size), (i.data = null), (i.alreadyRead = 0), i.size)
							: 0
					}),
					(g.prototype.getAllocatedSampleDataSize = function () {
						return this.samplesDataSize
					}),
					(g.prototype.getCodecs = function () {
						var t,
							e = ""
						for (t = 0; t < this.moov.traks.length; t++)
							(t > 0 && (e += ","), (e += this.moov.traks[t].mdia.minf.stbl.stsd.entries[0].getCodec()))
						return e
					}),
					(g.prototype.getTrexById = function (t) {
						var e
						if (!this.moov || !this.moov.mvex) return null
						for (e = 0; e < this.moov.mvex.trexs.length; e++) {
							var i = this.moov.mvex.trexs[e]
							if (i.track_id == t) return i
						}
						return null
					}),
					(g.prototype.getTrackById = function (t) {
						if (void 0 === this.moov) return null
						for (var e = 0; e < this.moov.traks.length; e++) {
							var i = this.moov.traks[e]
							if (i.tkhd.track_id == t) return i
						}
						return null
					}),
					(g.prototype.itemsDataSize = 0),
					(g.prototype.flattenItemInfo = function () {
						var t,
							e,
							i,
							r = this.items,
							n = this.entity_groups,
							a = this.meta
						if (null != a && void 0 !== a.hdlr && void 0 !== a.iinf) {
							for (t = 0; t < a.iinf.item_infos.length; t++)
								(((i = {}).id = a.iinf.item_infos[t].item_ID),
									(r[i.id] = i),
									(i.ref_to = []),
									(i.name = a.iinf.item_infos[t].item_name),
									a.iinf.item_infos[t].protection_index > 0 &&
										(i.protection = a.ipro.protections[a.iinf.item_infos[t].protection_index - 1]),
									a.iinf.item_infos[t].item_type
										? (i.type = a.iinf.item_infos[t].item_type)
										: (i.type = "mime"),
									(i.content_type = a.iinf.item_infos[t].content_type),
									(i.content_encoding = a.iinf.item_infos[t].content_encoding),
									(i.item_uri_type = a.iinf.item_infos[t].item_uri_type))
							if (a.grpl)
								for (t = 0; t < a.grpl.boxes.length; t++)
									((entity_group = {}),
										(entity_group.id = a.grpl.boxes[t].group_id),
										(entity_group.entity_ids = a.grpl.boxes[t].entity_ids),
										(entity_group.type = a.grpl.boxes[t].type),
										(n[entity_group.id] = entity_group))
							if (a.iloc)
								for (t = 0; t < a.iloc.items.length; t++) {
									var o = a.iloc.items[t]
									switch (
										((i = r[o.item_ID]),
										0 !== o.data_reference_index &&
											(s.warn("Item storage with reference to other files: not supported"),
											(i.source = a.dinf.boxes[o.data_reference_index - 1])),
										o.construction_method)
									) {
										case 0:
										case 1:
											break
										case 2:
											s.warn("Item storage with construction_method : not supported")
									}
									for (i.extents = [], i.size = 0, e = 0; e < o.extents.length; e++)
										((i.extents[e] = {}),
											(i.extents[e].offset = o.extents[e].extent_offset + o.base_offset),
											1 == o.construction_method &&
												(i.extents[e].offset += a.idat.start + a.idat.hdr_size),
											(i.extents[e].length = o.extents[e].extent_length),
											(i.extents[e].alreadyRead = 0),
											(i.size += i.extents[e].length))
								}
							if ((a.pitm && (r[a.pitm.item_id].primary = !0), a.iref))
								for (t = 0; t < a.iref.references.length; t++) {
									var h = a.iref.references[t]
									for (e = 0; e < h.references.length; e++)
										r[h.from_item_ID].ref_to.push({ type: h.type, id: h.references[e] })
								}
							if (a.iprp)
								for (var c = 0; c < a.iprp.ipmas.length; c++) {
									var u = a.iprp.ipmas[c]
									for (t = 0; t < u.associations.length; t++) {
										var l = u.associations[t]
										if (((i = r[l.id]) || (i = n[l.id]), i))
											for (
												void 0 === i.properties &&
													((i.properties = {}), (i.properties.boxes = [])),
													e = 0;
												e < l.props.length;
												e++
											) {
												var p = l.props[e]
												if (
													p.property_index > 0 &&
													p.property_index - 1 < a.iprp.ipco.boxes.length
												) {
													var d = a.iprp.ipco.boxes[p.property_index - 1]
													;((i.properties[d.type] = d), i.properties.boxes.push(d))
												}
											}
									}
								}
						}
					}),
					(g.prototype.getItem = function (t) {
						var e, i
						if (!this.meta) return null
						if (!(i = this.items[t]).data && i.size)
							((i.data = new Uint8Array(i.size)),
								(i.alreadyRead = 0),
								(this.itemsDataSize += i.size),
								s.debug(
									"ISOFile",
									"Allocating item #" +
										t +
										" of size " +
										i.size +
										" (total: " +
										this.itemsDataSize +
										")",
								))
						else if (i.alreadyRead === i.size) return i
						for (var r = 0; r < i.extents.length; r++) {
							var n = i.extents[r]
							if (n.alreadyRead !== n.length) {
								var o = this.stream.findPosition(!0, n.offset + n.alreadyRead, !1)
								if (!(o > -1)) return null
								var h =
									(e = this.stream.buffers[o]).byteLength - (n.offset + n.alreadyRead - e.fileStart)
								if (!(n.length - n.alreadyRead <= h))
									return (
										s.debug(
											"ISOFile",
											"Getting item #" +
												t +
												" extent #" +
												r +
												" partial data (alreadyRead: " +
												n.alreadyRead +
												" offset: " +
												(n.offset + n.alreadyRead - e.fileStart) +
												" read size: " +
												h +
												" full extent size: " +
												n.length +
												" full item size: " +
												i.size +
												")",
										),
										a.memcpy(
											i.data.buffer,
											i.alreadyRead,
											e,
											n.offset + n.alreadyRead - e.fileStart,
											h,
										),
										(n.alreadyRead += h),
										(i.alreadyRead += h),
										(e.usedBytes += h),
										this.stream.logBufferLevel(),
										null
									)
								;(s.debug(
									"ISOFile",
									"Getting item #" +
										t +
										" extent #" +
										r +
										" data (alreadyRead: " +
										n.alreadyRead +
										" offset: " +
										(n.offset + n.alreadyRead - e.fileStart) +
										" read size: " +
										(n.length - n.alreadyRead) +
										" full extent size: " +
										n.length +
										" full item size: " +
										i.size +
										")",
								),
									a.memcpy(
										i.data.buffer,
										i.alreadyRead,
										e,
										n.offset + n.alreadyRead - e.fileStart,
										n.length - n.alreadyRead,
									),
									(e.usedBytes += n.length - n.alreadyRead),
									this.stream.logBufferLevel(),
									(i.alreadyRead += n.length - n.alreadyRead),
									(n.alreadyRead = n.length))
							}
						}
						return i.alreadyRead === i.size ? i : null
					}),
					(g.prototype.releaseItem = function (t) {
						var e = this.items[t]
						if (e.data) {
							;((this.itemsDataSize -= e.size), (e.data = null), (e.alreadyRead = 0))
							for (var i = 0; i < e.extents.length; i++) e.extents[i].alreadyRead = 0
							return e.size
						}
						return 0
					}),
					(g.prototype.processItems = function (t) {
						for (var e in this.items) {
							var i = this.items[e]
							;(this.getItem(i.id), t && !i.sent && (t(i), (i.sent = !0), (i.data = null)))
						}
					}),
					(g.prototype.hasItem = function (t) {
						for (var e in this.items) {
							var i = this.items[e]
							if (i.name === t) return i.id
						}
						return -1
					}),
					(g.prototype.getMetaHandler = function () {
						return this.meta ? this.meta.hdlr.handler : null
					}),
					(g.prototype.getPrimaryItem = function () {
						return this.meta && this.meta.pitm ? this.getItem(this.meta.pitm.item_id) : null
					}),
					(g.prototype.itemToFragmentedTrackFile = function (t) {
						var e = t || {},
							i = null
						if (null == (i = e.itemId ? this.getItem(e.itemId) : this.getPrimaryItem())) return null
						var r = new g()
						r.discardMdatData = !1
						var s = { type: i.type, description_boxes: i.properties.boxes }
						i.properties.ispe &&
							((s.width = i.properties.ispe.image_width), (s.height = i.properties.ispe.image_height))
						var n = r.addTrack(s)
						return n ? (r.addSample(n, i.data), r) : null
					}),
					(g.prototype.write = function (t) {
						for (var e = 0; e < this.boxes.length; e++) this.boxes[e].write(t)
					}),
					(g.prototype.createFragment = function (t, e, i) {
						var r = this.getTrackById(t),
							n = this.getSample(r, e)
						if (null == n) return (this.setNextSeekPositionFromSample(r.samples[e]), null)
						var o = i || new a()
						o.endianness = a.BIG_ENDIAN
						var h = this.createSingleSampleMoof(n)
						;(h.write(o),
							(h.trafs[0].truns[0].data_offset = h.size + 8),
							s.debug(
								"MP4Box",
								"Adjusting data_offset with new value " + h.trafs[0].truns[0].data_offset,
							),
							o.adjustUint32(h.trafs[0].truns[0].data_offset_position, h.trafs[0].truns[0].data_offset))
						var c = new u.mdatBox()
						return ((c.data = n.data), c.write(o), o)
					}),
					(g.writeInitializationSegment = function (t, e, i, r) {
						var n
						s.debug("ISOFile", "Generating initialization segment")
						var o = new a()
						;((o.endianness = a.BIG_ENDIAN), t.write(o))
						var h = e.add("mvex")
						for (i && h.add("mehd").set("fragment_duration", i), n = 0; n < e.traks.length; n++)
							h.add("trex")
								.set("track_id", e.traks[n].tkhd.track_id)
								.set("default_sample_description_index", 1)
								.set("default_sample_duration", r)
								.set("default_sample_size", 0)
								.set("default_sample_flags", 65536)
						return (e.write(o), o.buffer)
					}),
					(g.prototype.save = function (t) {
						var e = new a()
						;((e.endianness = a.BIG_ENDIAN), this.write(e), e.save(t))
					}),
					(g.prototype.getBuffer = function () {
						var t = new a()
						return ((t.endianness = a.BIG_ENDIAN), this.write(t), t.buffer)
					}),
					(g.prototype.initializeSegmentation = function () {
						var t, e, i, r
						for (
							null === this.onSegment && s.warn("MP4Box", "No segmentation callback set!"),
								this.isFragmentationInitialized ||
									((this.isFragmentationInitialized = !0),
									(this.nextMoofNumber = 0),
									this.resetTables()),
								e = [],
								t = 0;
							t < this.fragmentedTracks.length;
							t++
						) {
							var n = new u.moovBox()
							;((n.mvhd = this.moov.mvhd),
								n.boxes.push(n.mvhd),
								(i = this.getTrackById(this.fragmentedTracks[t].id)),
								n.boxes.push(i),
								n.traks.push(i),
								((r = {}).id = i.tkhd.track_id),
								(r.user = this.fragmentedTracks[t].user),
								(r.buffer = g.writeInitializationSegment(
									this.ftyp,
									n,
									this.moov.mvex && this.moov.mvex.mehd
										? this.moov.mvex.mehd.fragment_duration
										: void 0,
									this.moov.traks[t].samples.length > 0 ? this.moov.traks[t].samples[0].duration : 0,
								)),
								e.push(r))
						}
						return e
					}),
					(u.Box.prototype.printHeader = function (t) {
						;((this.size += 8),
							this.size > o && (this.size += 8),
							"uuid" === this.type && (this.size += 16),
							t.log(t.indent + "size:" + this.size),
							t.log(t.indent + "type:" + this.type))
					}),
					(u.FullBox.prototype.printHeader = function (t) {
						;((this.size += 4),
							u.Box.prototype.printHeader.call(this, t),
							t.log(t.indent + "version:" + this.version),
							t.log(t.indent + "flags:" + this.flags))
					}),
					(u.Box.prototype.print = function (t) {
						this.printHeader(t)
					}),
					(u.ContainerBox.prototype.print = function (t) {
						this.printHeader(t)
						for (var e = 0; e < this.boxes.length; e++)
							if (this.boxes[e]) {
								var i = t.indent
								;((t.indent += " "), this.boxes[e].print(t), (t.indent = i))
							}
					}),
					(g.prototype.print = function (t) {
						t.indent = ""
						for (var e = 0; e < this.boxes.length; e++) this.boxes[e] && this.boxes[e].print(t)
					}),
					(u.mvhdBox.prototype.print = function (t) {
						;(u.FullBox.prototype.printHeader.call(this, t),
							t.log(t.indent + "creation_time: " + this.creation_time),
							t.log(t.indent + "modification_time: " + this.modification_time),
							t.log(t.indent + "timescale: " + this.timescale),
							t.log(t.indent + "duration: " + this.duration),
							t.log(t.indent + "rate: " + this.rate),
							t.log(t.indent + "volume: " + (this.volume >> 8)),
							t.log(t.indent + "matrix: " + this.matrix.join(", ")),
							t.log(t.indent + "next_track_id: " + this.next_track_id))
					}),
					(u.tkhdBox.prototype.print = function (t) {
						;(u.FullBox.prototype.printHeader.call(this, t),
							t.log(t.indent + "creation_time: " + this.creation_time),
							t.log(t.indent + "modification_time: " + this.modification_time),
							t.log(t.indent + "track_id: " + this.track_id),
							t.log(t.indent + "duration: " + this.duration),
							t.log(t.indent + "volume: " + (this.volume >> 8)),
							t.log(t.indent + "matrix: " + this.matrix.join(", ")),
							t.log(t.indent + "layer: " + this.layer),
							t.log(t.indent + "alternate_group: " + this.alternate_group),
							t.log(t.indent + "width: " + this.width),
							t.log(t.indent + "height: " + this.height))
					}))
				var y = {
					createFile: function (t, e) {
						var i = void 0 === t || t,
							r = new g(e)
						return ((r.discardMdatData = !i), r)
					},
				}
				t.createFile = y.createFile
			})(Bt)),
		Bt)
	At.BoxParser.dOpsBox.prototype.write = function (t) {
		if (
			((this.size = 11),
			0 !== this.ChannelMappingFamily && (this.size += 2 + this.ChannelMapping.length),
			this.writeHeader(t),
			t.writeUint8(this.Version),
			t.writeUint8(this.OutputChannelCount),
			t.writeUint16(this.PreSkip),
			t.writeUint32(this.InputSampleRate),
			t.writeInt16(this.OutputGain),
			t.writeUint8(this.ChannelMappingFamily),
			0 !== this.ChannelMappingFamily)
		) {
			if (!this.StreamCount || !this.CoupledCount)
				throw new Error("failed to write dOps box with channel mapping")
			;(t.writeUint8(this.StreamCount), t.writeUint8(this.CoupledCount))
			for (const e of this.ChannelMapping) t.writeUint8(e)
		}
	}
	class It {
		#G
		#H
		#Y
		#j = 0
		encode
		constructor() {
			;((this.#G = new At.ISOFile()),
				this.#G.init(),
				(this.encode = new TransformStream({
					transform: (t, e) => {
						try {
							return (function (t) {
								return void 0 !== t.codec
							})(t)
								? (console.log("Container received decoder config:", t), this.#q(t, e))
								: this.#$(t, e)
						} catch (t) {
							throw (console.error("Container failed to process frame:", t), t)
						}
					},
				})))
		}
		#q(t, e) {
			if (this.#Y) throw new Error("duplicate decoder config")
			let i = t.codec.substring(0, 4)
			"opus" == i && (i = "Opus")
			const r = { type: i, timescale: 1e6 }
			if (
				(!(function (t) {
					return void 0 !== t.codedWidth
				})(t)
					? ((r.channel_count = t.numberOfChannels), (r.samplerate = t.sampleRate))
					: ((r.width = t.codedWidth), (r.height = t.codedHeight)),
				!t.description)
			)
				throw new Error("missing frame description")
			const s = t.description
			if ("avc1" === i) r.avcDecoderConfigRecord = s
			else if ("hev1" === i) r.hevcDecoderConfigRecord = s
			else {
				if ("Opus" !== i) throw new Error(`unsupported codec: ${i}`)
				{
					const t = new At.BoxParser.dOpsBox(void 0),
						e = new At.DataStream(s, 8, At.DataStream.LITTLE_ENDIAN)
					;(t.parse(e), (r.description = t), (r.hdlr = "soun"))
				}
			}
			if (((this.#Y = this.#G.addTrack(r)), !this.#Y || !this.#G.ftyp || !this.#G.moov))
				throw new Error("failed to initialize MP4 track")
			const n = At.ISOFile.writeInitializationSegment(this.#G.ftyp, this.#G.moov, 0, 0),
				a = new Uint8Array(n)
			e.enqueue({ type: "init", timestamp: 0, duration: 0, data: a })
		}
		#$(t, e) {
			if ("key" == t.type) this.#j += 1
			else if (0 == this.#j) throw new Error("must start with keyframe")
			if (!this.#H) return void (this.#H = t)
			const i = t.timestamp - this.#H.timestamp,
				r = new Uint8Array(this.#H.byteLength)
			if ((this.#H.copyTo(r), !this.#Y)) throw new Error("missing decoder config")
			this.#G.addSample(this.#Y, r, {
				duration: i,
				dts: this.#H.timestamp,
				cts: this.#H.timestamp,
				is_sync: "key" == this.#H.type,
			})
			const s = new At.DataStream(void 0, 0, At.DataStream.BIG_ENDIAN)
			for (;;) {
				const t = this.#G.moofs.shift(),
					e = this.#G.mdats.shift()
				if (!t && !e) break
				if (!t) throw new Error("moof missing")
				if (!e) throw new Error("mdat missing")
				;(t.write(s), e.write(s))
			}
			const n = new Uint8Array(s.buffer)
			;(e.enqueue({ type: this.#H.type, timestamp: this.#H.timestamp, duration: this.#H.duration ?? 0, data: n }),
				(this.#H = t))
		}
	}
	const Tt = ["Opus"]
	let zt = class {
		#K
		#W
		#X
		frames
		constructor(t) {
			;((this.#W = t),
				(this.frames = new TransformStream({
					start: this.#Q.bind(this),
					transform: this.#Z.bind(this),
					flush: this.#J.bind(this),
				})))
		}
		#Q(t) {
			try {
				;((this.#K = new AudioEncoder({
					output: (e, i) => {
						this.#$(t, e, i)
					},
					error: (t) => {
						throw t
					},
				})),
					this.#K.configure(this.#W))
			} catch (t) {
				throw (console.error("Failed to configure AudioEncoder:", t), t)
			}
		}
		#Z(t) {
			try {
				this.#K.encode(t)
			} catch (t) {
				throw (console.error("Failed to encode audio frame:", t), t)
			}
			t.close()
		}
		#$(t, e, i) {
			const r = i?.decoderConfig
			if (r && !this.#X) {
				const e = i.decoderConfig
				if (!e) throw new Error("missing decoder config")
				;(t.enqueue(e), (this.#X = e))
			}
			t.enqueue(e)
		}
		#J() {
			this.#K.close()
		}
		static async isSupported(t) {
			const e = t.codec.substring(0, 4)
			if (!Tt.includes(e)) return !1
			return !!(await AudioEncoder.isConfigSupported(t)).supported
		}
		get config() {
			return this.#W
		}
	}
	const kt = ["avc1", "hev1"]
	class Ct {
		#K
		#W
		#X
		#tt = !0
		#et = 0
		frames
		constructor(t) {
			;((t.bitrateMode ??= "constant"),
				(t.latencyMode ??= "realtime"),
				(this.#W = t),
				(this.frames = new TransformStream({
					start: this.#Q.bind(this),
					transform: this.#Z.bind(this),
					flush: this.#J.bind(this),
				})))
		}
		static async isSupported(t) {
			const e = t.codec.substring(0, 4)
			if (!kt.includes(e)) return !1
			;((t.hardwareAcceleration ??= "prefer-hardware"),
				(t.bitrateMode ??= "constant"),
				(t.latencyMode ??= "realtime"))
			return !!(await VideoEncoder.isConfigSupported(t)).supported
		}
		#Q(t) {
			;((this.#K = new VideoEncoder({
				output: (e, i) => {
					this.#$(t, e, i)
				},
				error: (t) => {
					throw t
				},
			})),
				console.log("Encoder configured", this.#W),
				this.#K.configure(this.#W))
		}
		#Z(t) {
			;(this.#K.encode(t, { keyFrame: this.#tt }), (this.#tt = void 0), t.close())
		}
		#$(t, e, i) {
			if (!this.#X) {
				const e = i?.decoderConfig
				if (!e) throw new Error("missing decoder config")
				;(t.enqueue(e), (this.#X = e))
			}
			;("key" === e.type
				? (this.#et = 0)
				: ((this.#et += 1), this.#et + this.#K.encodeQueueSize >= 2 * this.#W.framerate && (this.#tt = !0)),
				t.enqueue(e))
		}
		#J() {
			this.#K.close()
		}
		get config() {
			return this.#W
		}
	}
	class Pt {
		name
		#q
		#it = []
		#rt = 0
		#u = !1
		#st
		#nt = new ft()
		constructor(t, e) {
			if (((this.name = t.kind), "audio" === t.kind)) {
				if (!e.audio) throw new Error("no audio config")
				this.#at(t, e.audio).catch((t) => this.#ot(t))
			} else {
				if (
					!(function (t) {
						return "video" === t.kind
					})(t)
				)
					throw new Error(`unknown track type: ${t.kind}`)
				if (!e.video) throw new Error("no video config")
				this.#ht(t, e.video).catch((t) => this.#ot(t))
			}
		}
		async #at(t, e) {
			const i = new MediaStreamTrackProcessor({ track: t }),
				r = new zt(e),
				s = new It(),
				n = new WritableStream({
					write: (t) => this.#ct(t),
					close: () => this.#ot(),
					abort: (t) => this.#ot(t),
				})
			return i.readable
				.pipeThrough(r.frames)
				.pipeThrough(s.encode)
				.pipeTo(n)
				.catch((t) => {
					throw (console.error("Audio pipeline error:", t), t)
				})
		}
		async #ht(t, e) {
			const i = new MediaStreamTrackProcessor({ track: t }),
				r = new Ct(e),
				s = new It(),
				n = new WritableStream({
					write: (t) => this.#ct(t),
					close: () => this.#ot(),
					abort: (t) => this.#ot(t),
				})
			return i.readable.pipeThrough(r.frames).pipeThrough(s.encode).pipeTo(n)
		}
		async #ct(t) {
			if ("init" === t.type) return ((this.#q = t.data), void this.#nt.wake())
			let e = this.#it.at(-1)
			if (!e || "key" === t.type) {
				e && (await e.input.close())
				const i = new vt(this.#rt + this.#it.length)
				for (this.#it.push(i), this.#nt.wake(), e = i; this.#it.length > 1; ) {
					const e = this.#it[0]
					if (t.timestamp - e.timestamp < 1e7) break
					;(this.#it.shift(), (this.#rt += 1), await e.input.abort("expired"))
				}
			}
			const i = e.input.getWriter()
			;((i.desiredSize || 0) > 0 ? await i.write(t) : console.warn("dropping chunk", i.desiredSize),
				i.releaseLock())
		}
		async close(t) {
			return this.#ot(t)
		}
		async #ot(t) {
			this.#st = t
			const e = this.#it.at(-1)
			;(e && (await e.input.close()), (this.#u = !0), this.#nt.wake())
		}
		async init() {
			for (; !this.#q; ) {
				if (this.#u) throw new Error("track closed")
				await this.#nt.wait()
			}
			return this.#q
		}
		segments() {
			let t = this.#rt
			return new ReadableStream({
				pull: async (e) => {
					for (;;) {
						let i = t - this.#rt
						if ((i < 0 && (i = 0), i < this.#it.length)) return (e.enqueue(this.#it[i]), void (t += 1))
						if (this.#st) return void e.error(this.#st)
						if (this.#u) return void e.close()
						await this.#nt.wait()
					}
				},
			})
		}
	}
	function Lt(t) {
		return "sampleRate" in t
	}
	function Ft(t) {
		return "width" in t
	}
	class Dt {
		#ut = new Map()
		config
		catalog
		connection
		namespace
		#C
		constructor(t) {
			;((this.connection = t.connection), (this.config = t), (this.namespace = t.namespace))
			const e = [],
				i = this.config.media.getTracks()
			for (const r of i) {
				const s = new Pt(r, t)
				this.#ut.set(s.name, s)
				const n = r.getSettings()
				if ("audio" === r.kind) {
					const t = new AudioContext()
					t.createMediaStreamSource(new MediaStream([r]))
					const e = t.sampleRate
					;(Object.assign(n, { sampleRate: e }), t.close())
				}
				if ((console.log("track settings", n, r, i), Ft(n))) {
					if (!t.video) throw new Error("no video configuration provided")
					const i = {
						namespace: this.namespace,
						name: `${s.name}.m4s`,
						initTrack: `${s.name}.mp4`,
						selectionParams: {
							mimeType: "video/mp4",
							codec: t.video.codec,
							width: n.width,
							height: n.height,
							framerate: n.frameRate,
							bitrate: t.video.bitrate,
						},
					}
					e.push(i)
				} else {
					if (!Lt(n)) throw new Error(`unknown track type: ${r.kind}`)
					{
						if (!t.audio) throw new Error("no audio configuration provided")
						const i = {
							namespace: this.namespace,
							name: `${s.name}.m4s`,
							initTrack: `${s.name}.mp4`,
							selectionParams: {
								mimeType: "audio/mp4",
								codec: t.audio.codec,
								samplerate: n.sampleRate,
								channelConfig: `${n.channelCount}`,
								bitrate: t.audio.bitrate,
							},
						}
						e.push(i)
					}
				}
			}
			;((this.catalog = {
				version: 1,
				streamingFormat: 1,
				streamingFormatVersion: "0.2",
				supportsDeltaUpdates: !1,
				commonTrackFields: { packaging: "cmaf", renderGroup: 1 },
				tracks: e,
			}),
				(this.#C = this.#P()))
		}
		async #P() {
			for (
				console.log("[Broadcast] #run loop started"), await this.connection.publish_namespace(this.namespace);
				;

			) {
				const t = await this.connection.subscribed()
				if (!t) break
				this.#lt(t).catch((t) => {
					const e = lt(t)
					console.warn("failed to serve subscribe", e)
				})
			}
		}
		async #lt(t) {
			try {
				const [e, i] = (function (t) {
					const e = t.lastIndexOf(".")
					if (e < 0) throw new Error("no extension found")
					return [t.substring(0, e), t.substring(e + 1)]
				})(t.track)
				if ((console.log("serving subscribe", t.track, t.namespace, e, i), "catalog" === i))
					await this.#pt(t, e)
				else if ("mp4" === i) await this.#dt(t, e)
				else {
					if ("m4s" !== i) throw new Error(`unknown subscription: ${t.track}`)
					await this.#ft(t, e)
				}
			} catch (e) {
				console.error("failed to serve subscribe", e)
				const i = lt(e)
				await t.close(0n, `failed to process subscribe: ${i.message}`)
			}
		}
		async #pt(t, e) {
			if ("" !== e) throw new Error(`unknown catalog: ${e}`)
			const i = (function (t) {
				const e = new TextEncoder(),
					i = JSON.stringify(t)
				return e.encode(i)
			})(this.catalog)
			;(await t.ack(), await X(500))
			const r = await t.subgroup({ group: 0, subgroup: 0 })
			;(await r.write({ object_id: 0, object_payload: i }), await r.close())
		}
		async #dt(t, e) {
			const i = this.#ut.get(e)
			if (!i) throw new Error(`no track with name ${t.track}`)
			;(await t.ack(), await X(500))
			const r = await i.init(),
				s = await t.subgroup({ group: 0, subgroup: 0 })
			;(await s.write({ object_id: 0, object_payload: r }), await s.close())
		}
		async #ft(t, e) {
			const i = this.#ut.get(e)
			if (!i) throw new Error(`no track with name ${t.track}`)
			;(await t.ack(), await X(500))
			const r = i.segments().getReader()
			for (;;) {
				const { value: e, done: i } = await r.read()
				if (i) break
				this.#mt(t, e).catch((t) => {
					const e = lt(t)
					console.warn("failed to serve segment", e)
				})
			}
		}
		async #mt(t, e) {
			const i = await t.subgroup({ group: e.id, subgroup: 0, priority: 127 })
			let r = 0
			const s = e.chunks().getReader()
			for (;;) {
				const { value: t, done: e } = await s.read()
				if (e) break
				;(await i.write({ object_id: r, object_payload: t }), (r += 1))
			}
			await i.close()
		}
		attach(t) {
			t.srcObject = this.config.media
		}
		async close(t = !1) {
			const e = !t
			for (const t of this.#ut.values()) await t.close()
			await this.connection.closePublisher(e)
		}
		async closed() {
			try {
				return (await this.#C, new Error("closed"))
			} catch (t) {
				return lt(t)
			}
		}
	}
	class Nt extends EventTarget {
		client
		connection
		broadcast
		opts
		constructor(t) {
			;(super(), (this.opts = t), (this.client = new xt({ url: t.url, fingerprint: t.fingerprintUrl })))
		}
		async publish() {
			this.connection ||
				((this.connection = await this.client.connect()),
				(this.connection.onMigration = async (t) => {
					;(console.log("dispatching reconnect event from publisher"),
						this.dispatchEvent(new CustomEvent("reconnect", { detail: { uri: t } })))
				}))
			const t = {
				connection: this.connection,
				namespace: this.opts.namespace,
				media: this.opts.media,
				video: this.opts.video,
				audio: this.opts.audio,
			}
			this.broadcast = new Dt(t)
		}
		async stop(t = !1) {
			if (this.broadcast) {
				this.broadcast.close(t)
				const e = await this.broadcast.closed()
				e && console.error("Error in broadcast closed:", e)
			}
			this.connection &&
				(t ? this.connection.close(4, "going away") : this.connection.close(), await this.connection.closed())
		}
	}
	return ((t.PublisherApi = Nt), t)
})({})
//# sourceMappingURL=publish.iife.js.map
