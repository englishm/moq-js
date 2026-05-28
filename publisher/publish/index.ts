import { Client, Connection, setGlobalLogger, createConsoleLogger } from "@moq-js/transport"
import type { LogLevel } from "@moq-js/transport"
import { Broadcast, BroadcastConfig } from "../contribute"

export interface PublisherOptions {
	url: string
	namespace: string[]
	media: MediaStream
	video?: VideoEncoderConfig
	audio?: AudioEncoderConfig
	fingerprintUrl?: string
	/** Enable the default console logger at this level before connecting. */
	logLevel?: LogLevel
}

export class PublisherApi {
	private client: Client
	private connection?: Connection
	private broadcast?: Broadcast
	private opts: PublisherOptions

	constructor(opts: PublisherOptions) {
		this.opts = opts
		if (opts.logLevel) {
			setGlobalLogger(createConsoleLogger(opts.logLevel))
		}
		this.client = new Client({
			url: opts.url,
			fingerprint: opts.fingerprintUrl,
		})
	}

	async publish(): Promise<void> {
		if (!this.connection) {
			this.connection = await this.client.connect()
		}

		const bcConfig: BroadcastConfig = {
			connection: this.connection,
			namespace: this.opts.namespace,
			media: this.opts.media,
			video: this.opts.video,
			audio: this.opts.audio,
		}

		this.broadcast = new Broadcast(bcConfig)
	}

	async stop(): Promise<void> {
		if (this.broadcast) {
			this.broadcast.close()
			await this.broadcast.closed()
		}
		if (this.connection) {
			this.connection.close()
			await this.connection.closed()
		}
	}

	/**
	 * Add a media track to the running broadcast. Delegates to
	 * `Broadcast.addTrack`. Throws if `publish()` has not been called yet —
	 * there is no broadcast to mutate until that point.
	 */
	addTrack(media: MediaStreamTrack, config: VideoEncoderConfig | AudioEncoderConfig): void {
		if (!this.broadcast) {
			throw new Error("PublisherApi.addTrack: publish() has not been called; no broadcast to mutate")
		}
		this.broadcast.addTrack(media, config)
	}

	/**
	 * Remove a previously-added track from the running broadcast. Delegates
	 * to `Broadcast.removeTrack`. Throws if `publish()` has not been called
	 * yet — there is no broadcast to mutate until that point.
	 */
	async removeTrack(name: string): Promise<void> {
		if (!this.broadcast) {
			throw new Error("PublisherApi.removeTrack: publish() has not been called; no broadcast to mutate")
		}
		await this.broadcast.removeTrack(name)
	}
}
