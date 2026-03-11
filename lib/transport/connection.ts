import * as Control from "./control"
import { Objects } from "./objects"
import { asError } from "../common/error"
import { ControlStream } from "./stream"

import { Publisher } from "./publisher"
import { Subscriber } from "./subscriber"

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

	constructor(quic: WebTransport, stream: ControlStream, objects: Objects) {
		this.#quic = quic
		this.#controlStream = stream
		this.#objects = objects

		this.#publisher = new Publisher(this.#controlStream, this.#objects)
		this.#subscriber = new Subscriber(this.#controlStream, this.#objects)

		this.#running = this.#run()
	}

	close(code = 0, reason = "") {
		this.#quic.close({ closeCode: code, reason })
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

	subscribe(namespace: string[], track: string) {
		return this.#subscriber.subscribe(namespace, track)
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
			console.log("starting control loop")
			for (;;) {
				const msg = await this.#controlStream.recv()
				await this.#recv(msg)
			}
		} catch (e) {
			console.error("Error in control stream:", e)
			throw e
		}
	}

	async #runObjects() {
		try {
			console.log("starting object loop")
			for (;;) {
				const obj = await this.#objects.recv()
				console.log("object loop got obj", obj)
				if (!obj) break

				await this.#subscriber.recvObject(obj)
			}
		} catch (e) {
			console.error("Error in object stream:", e)
			throw e
		}
	}

	async #recv(msg: Control.MessageWithType) {
		// RequestOk and RequestError can be sent by either side,
		// so route based on request ID parity (even=subscriber-initiated, odd=publisher-initiated)
		if (msg.type === Control.ControlMessageType.RequestOk || msg.type === Control.ControlMessageType.RequestError) {
			const id = (msg.message as { id: bigint }).id
			if (id % 2n === 0n) {
				// Even request ID = subscriber-initiated request, response goes to subscriber
				await this.#subscriber.recv(msg)
			} else {
				// Odd request ID = publisher-initiated request, response goes to publisher
				await this.#publisher.recv(msg)
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
