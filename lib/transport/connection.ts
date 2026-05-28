import * as Control from "./control"
import { Objects } from "./objects"
import { asError } from "../common/error"
import { ControlStream } from "./stream"
import { getLogger } from "../common/logger"

import { Publisher } from "./publisher"
import { Subscriber } from "./subscriber"
import type { SubscribeRequestOptions } from "./subscriber"

const log = getLogger()

export class Connection {
	// The established WebTransport session.
	#quic: WebTransport

	// Use to receive/send control messages.
	#controlStream: ControlStream

	// Use to receive/send objects.
	#objects: Objects

	// Module for contributing tracks.
	#publisher: Publisher

	// Module for distributing tracks.
	#subscriber: Subscriber

	// Async work running in the background
	#running: Promise<void>

	// Guards against double-close. WebTransport.close() throws synchronously if
	// the session is already closed, so we make close() idempotent.
	#closed = false

	constructor(quic: WebTransport, stream: ControlStream, objects: Objects) {
		this.#quic = quic
		this.#controlStream = stream
		this.#objects = objects

		this.#publisher = new Publisher(this.#controlStream, this.#objects)
		this.#subscriber = new Subscriber(this.#controlStream, this.#objects)

		this.#running = this.#run()
	}

	close(code = 0, reason = "") {
		if (this.#closed) return
		this.#closed = true
		try {
			this.#quic.close({ closeCode: code, reason })
		} catch (e) {
			// WebTransport.close() throws synchronously if the session is already
			// closed (e.g. remote peer terminated the session). That's not an error
			// we want to propagate to callers.
			log.debug("Connection.close swallowed underlying throw", e)
		}
	}

	async #run(): Promise<void> {
		await Promise.all([this.#runControl(), this.#runObjects()])
	}

	publish_namespace(namespace: string[]) {
		return this.#publisher.publish_namespace(namespace)
	}

	publishedNamespaces() {
		return this.#subscriber.publishedNamespaces()
	}

	subscribe(namespace: string[], track: string, opts?: SubscribeRequestOptions) {
		return this.#subscriber.subscribe(namespace, track, opts)
	}

	unsubscribe(track: string) {
		return this.#subscriber.unsubscribe(track)
	}

	subscribed() {
		return this.#publisher.subscribed()
	}

	async #runControl() {
		// Receive messages until the connection is closed.
		try {
			log.debug("starting control loop")
			for (;;) {
				const msg = await this.#controlStream.recv()
				await this.#recv(msg)
			}
		} catch (e) {
			log.error("control stream error", e)
			throw e
		}
	}

	async #runObjects() {
		try {
			log.debug("starting object loop")
			for (;;) {
				const obj = await this.#objects.recv()
				log.trace("object loop got obj", obj)
				if (!obj) break

				await this.#subscriber.recvObject(obj)
			}
		} catch (e) {
			log.error("object stream error", e)
			throw e
		}
	}

	async #recv(msg: Control.MessageWithType) {
		if (msg.type === Control.ControlMessageType.GoAway) {
			return
		}
		if (msg.type === Control.ControlMessageType.MaxRequestId) {
			this.#controlStream.applyMaxRequestId(msg.message)
			return
		}
		if (msg.type === Control.ControlMessageType.RequestsBlocked) {
			this.#controlStream.handleRequestsBlocked(msg.message)
			return
		}
		if (isNewRequest(msg)) {
			this.#controlStream.validateIncomingRequestId(msg.message.id)
		}

		// REQUEST_OK/REQUEST_ERROR are responses; route them to the role that owns
		// the original local request. Request ID parity is client/server scoped, not
		// publisher/subscriber scoped.
		if (msg.type === Control.ControlMessageType.RequestOk || msg.type === Control.ControlMessageType.RequestError) {
			const id = (msg.message as { id: bigint }).id
			if (this.#subscriber.hasOutstandingRequest(id)) {
				await this.#subscriber.recv(msg)
			} else if (this.#publisher.hasOutstandingRequest(id)) {
				await this.#publisher.recv(msg)
			} else {
				throw new Error(`response for unknown request: ${id}`)
			}
		} else if (Control.isPublisher(msg.type)) {
			await this.#subscriber.recv(msg)
		} else {
			await this.#publisher.recv(msg)
		}
	}

	async closed(): Promise<Error> {
		try {
			await this.#running
			return new Error("closed")
		} catch (e) {
			return asError(e)
		}
	}
}

function isNewRequest(msg: Control.MessageWithType): msg is Control.MessageWithType & { message: { id: bigint } } {
	switch (msg.type) {
		case Control.ControlMessageType.Subscribe:
		case Control.ControlMessageType.SubscribeUpdate:
		case Control.ControlMessageType.SubscribeNamespace:
		case Control.ControlMessageType.Publish:
		case Control.ControlMessageType.PublishNamespace:
		case Control.ControlMessageType.Fetch:
		case Control.ControlMessageType.TrackStatus:
			return true
		default:
			return false
	}
}
