import * as Control from "./control"
import * as Stream from "./stream"
import { Objects } from "./objects"
import { Connection } from "./connection"
import { ClientSetup, ControlMessageType, ServerSetup } from "./control"
import { SetupParameters } from "./control/setup_parameters"
import { Parameters } from "./base_data"
import { ImmutableBytesBuffer, ReadableWritableStreamBuffer } from "./buffer"
import { RequestId, maxRequestIdFromParams } from "./request_id"
import { getLogger } from "../common/logger"
import { TransportStats } from "./stats"

const log = getLogger()

export const DEFAULT_MAX_REQUEST_ID = 64n
export const MOQ_TRANSPORT_PROTOCOL = "moqt-16"

interface WebTransportOptionsWithProtocols extends WebTransportOptions {
	protocols?: string[]
}

export interface ClientConfig {
	url: string
	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprint?: string
	maxRequestId?: number | bigint
	webTransportProtocols?: string[]
}

export class Client {
	#fingerprint: Promise<WebTransportHash | undefined>

	readonly config: ClientConfig

	constructor(config: ClientConfig) {
		this.config = config

		this.#fingerprint = this.#fetchFingerprint(config.fingerprint).catch((e) => {
			log.warn("failed to fetch fingerprint", e)
			return undefined
		})
	}

	async connect(): Promise<Connection> {
		const fingerprint = await this.#fingerprint
		const options = webTransportOptions(fingerprint, this.config.webTransportProtocols)

		const stats = new TransportStats()
		const dialStart = performance.now()

		const quic = new WebTransport(this.config.url, options)
		await quic.ready

		stats.onDialComplete(performance.now() - dialStart)

		const setupStart = performance.now()
		const stream = await quic.createBidirectionalStream({ sendOrder: Number.MAX_SAFE_INTEGER })

		const buffer = new ReadableWritableStreamBuffer(stream.readable, stream.writable)

		const setupParams = clientSetupParams(this.config)
		const msg: Control.ClientSetup = { params: setupParams }
		const serialized = Control.ClientSetup.serialize(msg)
		await buffer.write(serialized)

		// Receive the setup message.
		// TODO verify the SETUP response.
		const server = await this.readServerSetup(buffer)
		//
		// if (server.version != Control.Version.DRAFT_14) {
		// 	throw new Error(`unsupported server version: ${server.version}`)
		// }

		stats.onSetupComplete(performance.now() - setupStart)

		const control = new Stream.ControlStream(
			buffer,
			RequestId.client(maxRequestIdFromParams(server.params), maxRequestIdFromParams(setupParams)),
		)
		const objects = new Objects(quic)

		return new Connection(quic, control, objects, stats)
	}

	async #fetchFingerprint(url?: string): Promise<WebTransportHash | undefined> {
		if (!url) return

		// TODO remove this fingerprint when Chrome WebTransport accepts the system CA
		const response = await fetch(url)
		const hexString = await response.text()

		const hexBytes = new Uint8Array(hexString.length / 2)
		for (let i = 0; i < hexBytes.length; i += 1) {
			hexBytes[i] = parseInt(hexString.slice(2 * i, 2 * i + 2), 16)
		}

		return {
			algorithm: "sha-256",
			value: hexBytes,
		}
	}

	async readServerSetup(buffer: ReadableWritableStreamBuffer): Promise<ServerSetup> {
		const type: ControlMessageType = await buffer.getNumberVarInt()
		if (type !== ControlMessageType.ServerSetup)
			throw new Error(`server SETUP type must be ${ControlMessageType.ServerSetup}, got ${type}`)

		const advertisedLength = await buffer.getU16()
		const bufferLen = buffer.byteLength
		if (advertisedLength !== bufferLen) {
			throw new Error(`server SETUP message length mismatch: ${advertisedLength} != ${bufferLen}`)
		}

		const payload = await buffer.read(advertisedLength)
		const bufReader = new ImmutableBytesBuffer(payload)
		const msg = ServerSetup.deserialize(bufReader)

		return msg
	}

	async readClientSetup(buffer: ReadableWritableStreamBuffer): Promise<ClientSetup> {
		const type: ControlMessageType = await buffer.getNumberVarInt()
		if (type !== ControlMessageType.ClientSetup)
			throw new Error(`client SETUP type must be ${ControlMessageType.ClientSetup}, got ${type}`)

		const advertisedLength = await buffer.getU16()
		const bufferLen = buffer.byteLength
		if (advertisedLength !== bufferLen) {
			throw new Error(`client SETUP message length mismatch: ${advertisedLength} != ${bufferLen}`)
		}

		const payload = await buffer.read(advertisedLength)
		const bufReader = new ImmutableBytesBuffer(payload)
		return ClientSetup.deserialize(bufReader)
	}
}

export function clientSetupParams(config: Pick<ClientConfig, "maxRequestId"> = {}): Parameters {
	return new Map([[BigInt(SetupParameters.MaxRequestId), BigInt(config.maxRequestId ?? DEFAULT_MAX_REQUEST_ID)]])
}

export function webTransportOptions(
	fingerprint?: WebTransportHash,
	protocols: string[] = [MOQ_TRANSPORT_PROTOCOL],
): WebTransportOptions {
	const options: WebTransportOptionsWithProtocols = {}
	if (protocols.length > 0) options.protocols = protocols
	if (fingerprint) options.serverCertificateHashes = [fingerprint]
	return options
}
