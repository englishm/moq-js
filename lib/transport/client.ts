import * as Control from "./control"
import * as Stream from "./stream"
import { Objects } from "./objects"
import { Connection } from "./connection"
import { ClientSetup, ControlMessageType, ServerSetup } from "./control"
import { ImmutableBytesBuffer, ReadableWritableStreamBuffer } from "./buffer"
import { getLogger } from "../common/logger"

const log = getLogger()

export interface ClientConfig {
	url: string
	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprint?: string
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
		const options: WebTransportOptions = {}

		const fingerprint = await this.#fingerprint
		if (fingerprint) options.serverCertificateHashes = [fingerprint]

		const quic = new WebTransport(this.config.url, options)
		await quic.ready

		const stream = await quic.createBidirectionalStream({ sendOrder: Number.MAX_SAFE_INTEGER })

		const buffer = new ReadableWritableStreamBuffer(stream.readable, stream.writable)

		const msg: Control.ClientSetup = {
			versions: [Control.Version.DRAFT_14],
			params: new Map(),
		}
		const serialized = Control.ClientSetup.serialize(msg)
		await buffer.write(serialized)

		// Receive the setup message.
		// TODO verify the SETUP response.
		const server = await this.readServerSetup(buffer)

		if (server.version != Control.Version.DRAFT_14) {
			throw new Error(`unsupported server version: ${server.version}`)
		}

		const control = new Stream.ControlStream(buffer)
		const objects = new Objects(quic)

		return new Connection(quic, control, objects)
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
