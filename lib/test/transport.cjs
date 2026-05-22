const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")

require.extensions[".ts"] = function loadTypeScript(module, filename) {
	const source = fs.readFileSync(filename, "utf8")
	const output = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
		},
		fileName: filename,
	}).outputText
	module._compile(output, filename)
}

const { ImmutableBytesBuffer, ReadableStreamBuffer } = require("../transport/buffer.ts")
const { KeyValuePairs, Location, ParameterType, Parameters, Tuple } = require("../transport/base_data.ts")
const {
	ControlMessageType,
	ClientSetup,
	Fetch,
	FetchOk,
	FilterType,
	GoAway,
	GroupOrder,
	Publish,
	Subscribe,
	SubscribeNamespace,
	SubscribeOk,
	SubscribeOptions,
	SubscriptionFilter,
} = require("../transport/control/index.ts")
const { SetupParameters } = require("../transport/control/setup_parameters.ts")
const { MOQ_TRANSPORT_PROTOCOL, DEFAULT_MAX_REQUEST_ID, clientSetupParams, webTransportOptions } = require("../transport/client.ts")
const { RequestId, maxRequestIdFromParams } = require("../transport/request_id.ts")
const { FetchType } = require("../transport/control/fetch.ts")
const { Decoder, Encoder } = require("../transport/stream.ts")
const { ObjectDatagram, ObjectDatagramType, Status } = require("../transport/objects.ts")
const { Publisher } = require("../transport/publisher.ts")
const { Subscriber } = require("../transport/subscriber.ts")
const { SubgroupReader, SubgroupType, SubgroupWriter } = require("../transport/subgroup.ts")

function readControl(bytes) {
	const reader = new ImmutableBytesBuffer(bytes)
	const type = reader.getNumberVarInt()
	const length = reader.getU16()
	const payloadBytes = reader.getBytes(length)
	assert.equal(reader.remaining, 0)
	return { type, payloadBytes, payload: new ImmutableBytesBuffer(payloadBytes) }
}

function assertBytes(actual, expected) {
	assert.deepEqual(Array.from(actual), expected)
}

function assertMapEqual(actual, expected) {
	assert.deepEqual(actual, expected)
}

function readableFrom(bytes) {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(bytes)
			controller.close()
		},
	})
}

async function withoutConsoleLog(fn) {
	const log = console.log
	console.log = () => {}
	try {
		return await fn()
	} finally {
		console.log = log
	}
}

class CaptureWriter {
	constructor() {
		this.chunks = []
	}

	async write(data) {
		this.chunks.push(data)
	}

	async flush() {}
	clear() {}
	async close() {}
	release() {
		return [this.bytes(), new WritableStream()]
	}
	putU8() {}
	putU16() {}
	putVarInt() {}
	putUtf8String() {}

	bytes() {
		const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
		const out = new Uint8Array(length)
		let offset = 0
		for (const chunk of this.chunks) {
			out.set(chunk, offset)
			offset += chunk.length
		}
		return out
	}
}

class FakeControl {
	constructor() {
		this.nextId = 0n
		this.sent = []
	}

	nextRequestId() {
		const id = this.nextId
		this.nextId += 2n
		return id
	}

	async send(message) {
		this.sent.push(message)
	}
}

async function testSubscribeNamespace() {
	const params = new Map([
		[2n, 33n],
		[3n, new Uint8Array([1, 2])],
		[5n, new Uint8Array([9])],
	])
	const message = {
		id: 9n,
		namespace: ["a", "bc"],
		subscribe_options: SubscribeOptions.BOTH,
		params,
	}
	const { type, payload } = readControl(SubscribeNamespace.serialize(message))
	assert.equal(type, ControlMessageType.SubscribeNamespace)
	assert.equal(payload.getVarInt(), 9n)
	assert.deepEqual(Tuple.deserialize(payload), ["a", "bc"])
	assert.equal(payload.getNumberVarInt(), SubscribeOptions.BOTH)
	assert.equal(payload.getNumberVarInt(), 3)
	assertMapEqual(Parameters.deserialize_with_count(payload, 3), params)
	assert.equal(payload.remaining, 0)

	const decoded = SubscribeNamespace.deserialize(new ImmutableBytesBuffer(readControl(SubscribeNamespace.serialize(message)).payloadBytes))
	assert.equal(decoded.id, message.id)
	assert.deepEqual(decoded.namespace, message.namespace)
	assert.equal(decoded.subscribe_options, message.subscribe_options)
	assertMapEqual(decoded.params, params)
}

async function testParametersAndKeyValuePrefixes() {
	const pairs = new Map([[2n, 9n]])
	assertBytes(KeyValuePairs.serialize(pairs), [2, 9])
	assertBytes(Parameters.serialize(pairs), [1, 2, 9])
	assertMapEqual(Parameters.deserialize(new ImmutableBytesBuffer(Parameters.serialize(pairs))), pairs)
}

async function testClientSetupAdvertisesMaxRequestId() {
	const params = clientSetupParams()
	assert.equal(params.get(BigInt(SetupParameters.MaxRequestId)), DEFAULT_MAX_REQUEST_ID)
	assert.equal(maxRequestIdFromParams(params), DEFAULT_MAX_REQUEST_ID)

	const { type, payload } = readControl(ClientSetup.serialize({ params }))
	assert.equal(type, ControlMessageType.ClientSetup)
	assert.equal(payload.getNumberVarInt(), 1)
	assert.equal(payload.getVarInt(), BigInt(SetupParameters.MaxRequestId))
	assert.equal(payload.getVarInt(), DEFAULT_MAX_REQUEST_ID)
	assert.equal(payload.remaining, 0)
}

async function testWebTransportOptionsAdvertiseDraft16Protocol() {
	assert.deepEqual(webTransportOptions().protocols, [MOQ_TRANSPORT_PROTOCOL])
	assert.equal(webTransportOptions(undefined, []).protocols, undefined)

	const fingerprint = { algorithm: "sha-256", value: new Uint8Array([1, 2, 3]) }
	assert.deepEqual(webTransportOptions(fingerprint, ["custom"]), {
		protocols: ["custom"],
		serverCertificateHashes: [fingerprint],
	})
}

async function testRequestIdManager() {
	const clientIds = RequestId.client(4n, 6n)
	assert.deepEqual(clientIds.allocate(), { type: "allocated", id: 0n })
	assert.deepEqual(clientIds.allocate(), { type: "allocated", id: 2n })
	assert.deepEqual(clientIds.allocate(), {
		type: "blocked",
		max_request_id: 4n,
		should_send_requests_blocked: true,
	})
	assert.deepEqual(clientIds.allocate(), {
		type: "blocked",
		max_request_id: 4n,
		should_send_requests_blocked: false,
	})
	clientIds.applyMaxRequestId({ max_request_id: 8n })
	assert.deepEqual(clientIds.allocate(), { type: "allocated", id: 4n })

	const serverIds = RequestId.server(6n, 4n)
	assert.deepEqual(serverIds.allocate(), { type: "allocated", id: 1n })
	serverIds.validateIncoming(0n)
	serverIds.validateIncoming(2n)
	assert.throws(() => serverIds.validateIncoming(4n), /too many requests/)
	assert.throws(() => RequestId.client(4n, 4n).validateIncoming(0n), /invalid request id/)
}

async function testSubscribeMatchesDraft16WireFormat() {
	const message = {
		id: 0n,
		namespace: ["bbb"],
		name: ".catalog",
		params: new Map(),
	}
	const encoded = readControl(Subscribe.serialize(message))
	assert.equal(encoded.type, ControlMessageType.Subscribe)
	assertBytes(encoded.payloadBytes, [
		0,
		1, 3, 98, 98, 98,
		8, 46, 99, 97, 116, 97, 108, 111, 103,
		0,
	])
	assert.deepEqual(Subscribe.deserialize(new ImmutableBytesBuffer(encoded.payloadBytes)), message)
}

async function testSubscriptionFilterParameterEncoding() {
	assertBytes(SubscriptionFilter.serialize({ type: FilterType.LargestObject }), [FilterType.LargestObject])
	assertBytes(
		SubscriptionFilter.serialize({ type: FilterType.AbsoluteStart, start: { group: 5n, object: 0n } }),
		[FilterType.AbsoluteStart, 5, 0],
	)
	assertBytes(
		SubscriptionFilter.serialize({ type: FilterType.AbsoluteRange, start: { group: 5n, object: 0n }, endGroup: 10n }),
		[FilterType.AbsoluteRange, 5, 0, 10],
	)
	assert.deepEqual(SubscriptionFilter.deserialize(new ImmutableBytesBuffer(new Uint8Array([FilterType.AbsoluteRange, 5, 0, 10]))), {
		type: FilterType.AbsoluteRange,
		start: { group: 5n, object: 0n },
		endGroup: 10n,
	})

	const params = new Map([[BigInt(ParameterType.SUBSCRIPTION_FILTER), SubscriptionFilter.serialize({ type: FilterType.LargestObject })]])
	const encoded = readControl(Subscribe.serialize({ id: 0n, namespace: ["bbb"], name: ".catalog", params }))
	const payload = encoded.payload
	assert.equal(payload.getVarInt(), 0n)
	assert.deepEqual(Tuple.deserialize(payload), ["bbb"])
	assert.equal(payload.getUtf8String(), ".catalog")
	assertMapEqual(Parameters.deserialize(payload), params)
}

async function testSubscriberSubscribeOptionsEncodeFilter() {
	const control = new FakeControl()
	const subscriber = new Subscriber(control, {})
	await withoutConsoleLog(() =>
		subscriber.subscribe(["bbb"], ".catalog", {
			forward: false,
			subscriber_priority: 42,
			group_order: GroupOrder.Descending,
			filter: { type: FilterType.NextGroupStart },
		}),
	)

	const params = control.sent[0].message.params
	assert.equal(params.get(BigInt(ParameterType.FORWARD)), 0n)
	assert.equal(params.get(BigInt(ParameterType.SUBSCRIBER_PRIORITY)), 42n)
	assert.equal(params.get(BigInt(ParameterType.GROUP_ORDER)), BigInt(GroupOrder.Descending))
	assertBytes(params.get(BigInt(ParameterType.SUBSCRIPTION_FILTER)), [FilterType.NextGroupStart])
}

async function testFetchBodiesAreWrappedOnce() {
	const standalone = {
		id: 4n,
		fetch_type: FetchType.Standalone,
		standalone: {
			namespace: ["n"],
			name: "track",
			start_location: { group: 1n, object: 2n },
			end_location: { group: 3n, object: 4n },
		},
		params: new Map([[2n, 8n]]),
	}
	let encoded = readControl(Fetch.serialize(standalone))
	assert.equal(encoded.type, ControlMessageType.Fetch)
	assert.equal(encoded.payload.getVarInt(), 4n)
	assert.equal(encoded.payload.getNumberVarInt(), FetchType.Standalone)
	assert.equal(encoded.payload.firstByteValue, 1)
	let decoded = Fetch.deserialize(new ImmutableBytesBuffer(encoded.payloadBytes))
	assert.equal(decoded.id, standalone.id)
	assert.equal(decoded.fetch_type, standalone.fetch_type)
	assert.deepEqual(decoded.standalone, standalone.standalone)
	assertMapEqual(decoded.params, standalone.params)

	const joining = {
		id: 6n,
		fetch_type: FetchType.Relative,
		joining: { id: 7n, start: 8n },
		params: new Map([[2n, 9n]]),
	}
	encoded = readControl(Fetch.serialize(joining))
	assert.equal(encoded.payload.getVarInt(), 6n)
	assert.equal(encoded.payload.getNumberVarInt(), FetchType.Relative)
	assert.equal(encoded.payload.getVarInt(), 7n)
	decoded = Fetch.deserialize(new ImmutableBytesBuffer(encoded.payloadBytes))
	assert.equal(decoded.id, joining.id)
	assert.equal(decoded.fetch_type, joining.fetch_type)
	assert.deepEqual(decoded.joining, joining.joining)
	assertMapEqual(decoded.params, joining.params)
}

function assertTrailingExtensions(label, bytes, parsePrefix, extensions) {
	const { payload } = readControl(bytes)
	parsePrefix(payload)
	assertBytes(payload.getRemainingBuffer(), Array.from(KeyValuePairs.serialize(extensions)))
	assertMapEqual(KeyValuePairs.deserialize(payload), extensions)
	assert.equal(payload.remaining, 0, label)
}

function assertNoTrailingExtensions(label, bytes, parsePrefix) {
	const { payload } = readControl(bytes)
	parsePrefix(payload)
	assert.equal(payload.remaining, 0, label)
}

async function testTrackExtensionsAreTrailingKvps() {
	const params = new Map([[2n, 1n]])
	const extensions = new Map([
		[2n, 7n],
		[5n, new Uint8Array([8, 9])],
	])

	assertTrailingExtensions(
		"SubscribeOk extensions",
		SubscribeOk.serialize({ id: 1n, track_alias: 2n, params, track_extensions: extensions }),
		(payload) => {
			assert.equal(payload.getVarInt(), 1n)
			assert.equal(payload.getVarInt(), 2n)
			assertMapEqual(Parameters.deserialize_with_count(payload, payload.getNumberVarInt()), params)
		},
		extensions,
	)
	assertNoTrailingExtensions("SubscribeOk empty extensions", SubscribeOk.serialize({ id: 1n, track_alias: 2n, params }), (payload) => {
		payload.getVarInt()
		payload.getVarInt()
		Parameters.deserialize_with_count(payload, payload.getNumberVarInt())
	})

	assertTrailingExtensions(
		"Publish extensions",
		Publish.serialize({ id: 3n, track_alias: 4n, namespace: ["n"], name: "t", params, track_extensions: extensions }),
		(payload) => {
			assert.equal(payload.getVarInt(), 3n)
			assert.deepEqual(Tuple.deserialize(payload), ["n"])
			assert.equal(payload.getUtf8String(), "t")
			assert.equal(payload.getVarInt(), 4n)
			assertMapEqual(Parameters.deserialize_with_count(payload, payload.getNumberVarInt()), params)
		},
		extensions,
	)
	assertNoTrailingExtensions(
		"Publish empty extensions",
		Publish.serialize({ id: 3n, track_alias: 4n, namespace: ["n"], name: "t", params }),
		(payload) => {
			payload.getVarInt()
			Tuple.deserialize(payload)
			payload.getUtf8String()
			payload.getVarInt()
			Parameters.deserialize_with_count(payload, payload.getNumberVarInt())
		},
	)

	assertTrailingExtensions(
		"FetchOk extensions",
		FetchOk.serialize({
			id: 5n,
			end_of_track: 0,
			end_location: { group: 6n, object: 7n },
			params,
			track_extensions: extensions,
		}),
		(payload) => {
			assert.equal(payload.getVarInt(), 5n)
			assert.equal(payload.getU8(), 0)
			assert.deepEqual(Location.deserialize(payload), { group: 6n, object: 7n })
			assertMapEqual(Parameters.deserialize_with_count(payload, payload.getNumberVarInt()), params)
		},
		extensions,
	)
	assertNoTrailingExtensions(
		"FetchOk empty extensions",
		FetchOk.serialize({ id: 5n, end_of_track: 0, end_location: { group: 6n, object: 7n }, params }),
		(payload) => {
			payload.getVarInt()
			payload.getU8()
			Location.deserialize(payload)
			Parameters.deserialize_with_count(payload, payload.getNumberVarInt())
		},
	)
}

async function testGoAwayEncoderDecoder() {
	const encoder = new Encoder(new CaptureWriter())
	const bytes = encoder.message({ type: ControlMessageType.GoAway, message: { session_uri: "moq://next" } })
	const decoder = new Decoder(new ReadableStreamBuffer(readableFrom(bytes)))
	assert.deepEqual(await decoder.message(), {
		type: ControlMessageType.GoAway,
		message: { session_uri: "moq://next" },
	})
	assert.deepEqual(GoAway.deserialize(readControl(bytes).payload), { session_uri: "moq://next" })
}

async function testSubgroupObjectIdDeltas() {
	const header = { type: SubgroupType.Type0x10, track_alias: 1n, group_id: 2, publisher_priority: 0 }
	const writerCapture = new CaptureWriter()
	const writer = new SubgroupWriter(header, writerCapture)
	await writer.write({ object_id: 5, object_payload: new Uint8Array([1]) })
	await writer.write({ object_id: 6, object_payload: new Uint8Array([2]) })
	await writer.write({ object_id: 8, object_payload: new Uint8Array([3]) })
	assertBytes(writerCapture.bytes(), [5, 1, 1, 0, 1, 2, 1, 1, 3])

	const reader = new SubgroupReader(header, new ReadableStreamBuffer(readableFrom(writerCapture.bytes())))
	assert.deepEqual(await reader.read(), { object_id: 5, status: undefined, extension_headers: undefined, object_payload: new Uint8Array([1]) })
	assert.deepEqual(await reader.read(), { object_id: 6, status: undefined, extension_headers: undefined, object_payload: new Uint8Array([2]) })
	assert.deepEqual(await reader.read(), { object_id: 8, status: undefined, extension_headers: undefined, object_payload: new Uint8Array([3]) })

	const invalid = new SubgroupWriter(header, new CaptureWriter())
	await invalid.write({ object_id: 5, object_payload: new Uint8Array([1]) })
	await assert.rejects(() => invalid.write({ object_id: 5, object_payload: new Uint8Array([2]) }), /monotonically increasing/)
}

async function testSubgroupExtensionBitControlsSerialization() {
	const extensions = new Map([[2n, 9n]])
	const withoutExtHeader = { type: SubgroupType.Type0x10, track_alias: 1n, group_id: 2, publisher_priority: 0 }
	const withoutExtCapture = new CaptureWriter()
	await assert.rejects(() => new SubgroupWriter(withoutExtHeader, withoutExtCapture).write({
		object_id: 0,
		extension_headers: extensions,
		object_payload: new Uint8Array([7]),
	}), /object extensions/)

	const withExtHeader = { type: SubgroupType.Type0x11, track_alias: 1n, group_id: 2, publisher_priority: 0 }
	const withExtCapture = new CaptureWriter()
	await new SubgroupWriter(withExtHeader, withExtCapture).write({
		object_id: 0,
		extension_headers: extensions,
		object_payload: new Uint8Array([7]),
	})
	assertBytes(withExtCapture.bytes(), [0, 2, 2, 9, 1, 7])
	assert.deepEqual(await new SubgroupReader(withExtHeader, new ReadableStreamBuffer(readableFrom(withExtCapture.bytes()))).read(), {
		object_id: 0,
		status: undefined,
		extension_headers: extensions,
		object_payload: new Uint8Array([7]),
	})

	const emptyExtCapture = new CaptureWriter()
	await new SubgroupWriter(withExtHeader, emptyExtCapture).write({ object_id: 0, object_payload: new Uint8Array([7]) })
	assertBytes(emptyExtCapture.bytes(), [0, 0, 1, 7])
}

async function testDatagramExtensionLengthValidation() {
	const withExtensions = ObjectDatagram.serialize({
		type: ObjectDatagramType.Type0x1,
		track_alias: 1n,
		group_id: 2,
		object_id: 3,
		publisher_priority: 4,
		extension_headers: new Map([[2n, 9n]]),
		object_payload: new Uint8Array([7]),
	})
	assertBytes(withExtensions, [1, 1, 2, 3, 4, 2, 2, 9, 7])

	assert.throws(
		() => ObjectDatagram.serialize({
			type: ObjectDatagramType.Type0x1,
			track_alias: 1n,
			group_id: 2,
			object_id: 3,
			publisher_priority: 4,
			object_payload: new Uint8Array([7]),
		}),
		/extension headers cannot be empty/,
	)

	assert.throws(
		() => ObjectDatagram.deserialize(new ImmutableBytesBuffer(new Uint8Array([1, 1, 2, 3, 4, 0, 7]))),
		/extension headers cannot be empty/,
	)
}

async function testSubgroupZeroLengthPayloadEncodesStatus() {
	const header = { type: SubgroupType.Type0x10, track_alias: 1n, group_id: 2, publisher_priority: 0 }
	const normalCapture = new CaptureWriter()
	await new SubgroupWriter(header, normalCapture).write({ object_id: 0, object_payload: new Uint8Array() })
	assertBytes(normalCapture.bytes(), [0, 0, Status.NORMAL])
	assert.deepEqual(await new SubgroupReader(header, new ReadableStreamBuffer(readableFrom(normalCapture.bytes()))).read(), {
		object_id: 0,
		status: Status.NORMAL,
		extension_headers: undefined,
		object_payload: undefined,
	})

	const statusCapture = new CaptureWriter()
	await new SubgroupWriter(header, statusCapture).write({ object_id: 0, status: Status.GROUP_END })
	assertBytes(statusCapture.bytes(), [0, 0, Status.GROUP_END])
}

async function testOutstandingRequestOwnership() {
	const control = new FakeControl()
	const publisher = new Publisher(control, {})
	const subscriber = new Subscriber(control, {})

	await publisher.publish_namespace(["pub"])
	assert.equal(publisher.hasOutstandingRequest(0n), true)
	assert.equal(subscriber.hasOutstandingRequest(0n), false)
	assert.equal(control.sent[0].type, ControlMessageType.PublishNamespace)
	await withoutConsoleLog(() => publisher.recv({ type: ControlMessageType.RequestOk, message: { id: 0n, parameters: new Map() } }))
	assert.equal(publisher.hasOutstandingRequest(0n), false)

	await withoutConsoleLog(() => subscriber.subscribe(["sub"], "track"))
	assert.equal(subscriber.hasOutstandingRequest(2n), true)
	assert.equal(publisher.hasOutstandingRequest(2n), false)
	assert.equal(control.sent[1].type, ControlMessageType.Subscribe)
}

const tests = [
	testSubscribeNamespace,
	testParametersAndKeyValuePrefixes,
	testClientSetupAdvertisesMaxRequestId,
	testWebTransportOptionsAdvertiseDraft16Protocol,
	testRequestIdManager,
	testSubscribeMatchesDraft16WireFormat,
	testSubscriptionFilterParameterEncoding,
	testSubscriberSubscribeOptionsEncodeFilter,
	testFetchBodiesAreWrappedOnce,
	testTrackExtensionsAreTrailingKvps,
	testGoAwayEncoderDecoder,
	testSubgroupObjectIdDeltas,
	testSubgroupExtensionBitControlsSerialization,
	testDatagramExtensionLengthValidation,
	testSubgroupZeroLengthPayloadEncodesStatus,
	testOutstandingRequestOwnership,
]

;(async () => {
	for (const test of tests) {
		await test()
	}
	console.log(`transport tests passed (${tests.length})`)
})().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
