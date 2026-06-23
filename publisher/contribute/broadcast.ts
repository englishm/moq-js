import { Connection, SubscribeRecv, asError, sleep, getLogger } from "@moq-js/transport"
import { Segment } from "./segment"
import { Track } from "./track"
import * as Catalog from "@moq-js/catalog"
import { isAudioTrackSettings, isVideoTrackSettings } from "../common/settings"

const log = getLogger()

export interface BroadcastConfig {
	namespace: string[]
	connection: Connection
	media: MediaStream

	audio?: AudioEncoderConfig
	video?: VideoEncoderConfig
}

export interface BroadcastConfigTrack {
	codec: string
	bitrate: number
}

export class Broadcast {
	#tracks = new Map<string, Track>()

	readonly config: BroadcastConfig
	readonly catalog: Catalog.Root
	readonly connection: Connection
	readonly namespace: string[]

	#running: Promise<void>
	// Resolves to break out of the #run() subscribed() loop on close().
	#closed = false
	#closeResolve?: () => void
	#closePromise: Promise<void>

	constructor(config: BroadcastConfig) {
		this.#closePromise = new Promise<void>((resolve) => {
			this.#closeResolve = resolve
		})
		this.connection = config.connection
		this.config = config
		this.namespace = config.namespace

		const tracks: Catalog.Track[] = []

		const mediaTracks = this.config.media.getTracks()
		for (const media of mediaTracks) {
			const { track, entry } = this.#buildTrack(media, config)
			this.#tracks.set(track.name, track)
			tracks.push(entry)
		}

		this.catalog = {
			version: 1,
			streamingFormat: 1,
			streamingFormatVersion: "0.2",
			supportsDeltaUpdates: false,
			commonTrackFields: {
				packaging: "cmaf",
				renderGroup: 1,
			},
			tracks,
		}

		this.#running = this.#run()
	}

	/**
	 * Build a Track + matching Catalog entry from a MediaStreamTrack and a
	 * broadcast config. Used by both the constructor and `addTrack` so the
	 * catalog-entry shape stays in sync.
	 */
	#buildTrack(
		media: MediaStreamTrack,
		config: { audio?: AudioEncoderConfig; video?: VideoEncoderConfig },
	): { track: Track; entry: Catalog.Track } {
		const track = new Track(media, { ...this.config, audio: config.audio, video: config.video })

		const settings = media.getSettings()

		if (media.kind === "audio") {
			const audioContext = new AudioContext()
			audioContext.createMediaStreamSource(new MediaStream([media]))
			const sampleRate = audioContext.sampleRate
			Object.assign(settings, {
				sampleRate,
			})
			void audioContext.close()
		}

		log.debug("track settings", settings, media)

		if (isVideoTrackSettings(settings)) {
			if (!config.video) {
				throw new Error("no video configuration provided")
			}

			const entry: Catalog.VideoTrack = {
				namespace: this.namespace,
				name: `${track.name}.m4s`,
				initTrack: `${track.name}.mp4`,
				selectionParams: {
					mimeType: "video/mp4",
					codec: config.video.codec,
					width: settings.width,
					height: settings.height,
					framerate: settings.frameRate,
					bitrate: config.video.bitrate,
				},
			}

			return { track, entry }
		} else if (isAudioTrackSettings(settings)) {
			if (!config.audio) {
				throw new Error("no audio configuration provided")
			}

			const entry: Catalog.AudioTrack = {
				namespace: this.namespace,
				name: `${track.name}.m4s`,
				initTrack: `${track.name}.mp4`,
				selectionParams: {
					mimeType: "audio/mp4",
					codec: config.audio.codec,
					samplerate: settings.sampleRate,
					//sampleSize: settings.sampleSize,
					channelConfig: `${settings.channelCount}`,
					bitrate: config.audio.bitrate,
				},
			}

			return { track, entry }
		} else {
			throw new Error(`unknown track type: ${media.kind}`)
		}
	}

	/**
	 * Add a media track to a running broadcast and append a matching entry
	 * to `this.catalog.tracks`. The next subscriber that requests `.catalog`
	 * will see the updated catalog. Existing subscribers do not automatically
	 * resubscribe — the application is expected to signal them out-of-band
	 * (e.g. its own room WebSocket) so they can call `Player.setCatalog` on
	 * the subscriber side and decide whether to subscribe to the new track.
	 *
	 * Throws if a track with the same generated name (derived from
	 * `media.kind`) already exists. The audio/video encoder config can be
	 * supplied here to override the broadcast-wide one, or omitted to fall
	 * back to whatever was passed to the `Broadcast` constructor.
	 */
	/**
	 * Add a media track to a running broadcast and append a matching entry
	 * to `this.catalog.tracks`. Returns the generated track name (e.g.
	 * `"video-a3f7b2c1"`) so callers can later pass it to `removeTrack`.
	 *
	 * Each call produces a unique name (via the random suffix in Track),
	 * so there is no hard limit on how many times the same kind can be
	 * cycled through add/remove. The caller is responsible for ensuring at
	 * most one active track of each kind at a time.
	 */
	addTrack(media: MediaStreamTrack, config: VideoEncoderConfig | AudioEncoderConfig): string {
		// Choose audio vs video config slot based on the media kind. We use
		// the per-call config when provided, otherwise fall back to the
		// broadcast-wide one set in the constructor.
		const trackConfig = {
			audio: media.kind === "audio" ? (config as AudioEncoderConfig) : this.config.audio,
			video: media.kind === "video" ? (config as VideoEncoderConfig) : this.config.video,
		}

		const { track, entry } = this.#buildTrack(media, trackConfig)
		this.#tracks.set(track.name, track)
		this.catalog.tracks.push(entry)
		log.debug("[catalog] addTrack: catalog after add", {
			addedTrackName: track.name,
			trackCount: this.catalog.tracks.length,
			tracks: this.catalog.tracks.map((t) => ({ name: t.name, initTrack: (t as { initTrack?: string }).initTrack })),
		})
		return track.name
	}

	/**
	 * Remove a previously-added track. Closes the underlying encoder pipeline
	 * cleanly so existing subscribers see a clean PUBLISH_DONE for the
	 * removed track's m4s subscription, then removes the entry from
	 * `this.catalog.tracks`.
	 *
	 * Idempotent: returns silently if no track with that name exists.
	 *
	 * The `name` parameter matches the internal Track name (currently
	 * `media.kind`, e.g. `"audio"` or `"video"`). It is NOT the catalog
	 * entry name, which has a `.m4s` suffix.
	 */
	async removeTrack(name: string): Promise<void> {
		const track = this.#tracks.get(name)
		log.debug("[catalog] removeTrack called", {
			name,
			trackFound: !!track,
			currentTracks: this.catalog.tracks.map((t) => ({ name: t.name })),
		})
		if (!track) return

		await track.close()
		this.#tracks.delete(name)

		// Catalog entries use `${trackName}.m4s` as their name.
		const entryName = `${name}.m4s`
		const idx = this.catalog.tracks.findIndex((t) => t.name === entryName)
		log.debug("[catalog] removeTrack: catalog entry search", { entryName, foundAtIndex: idx })
		if (idx >= 0) {
			this.catalog.tracks.splice(idx, 1)
		}
		log.debug("[catalog] removeTrack: catalog after remove", {
			trackCount: this.catalog.tracks.length,
			tracks: this.catalog.tracks.map((t) => ({ name: t.name })),
		})
	}

	async #run() {
		log.debug("run loop started")
		await this.connection.publish_namespace(this.namespace)

		for (;;) {
			// Race the next subscriber against the close signal.
			const result = await Promise.race([
				this.connection.subscribed().then((s) => ({ kind: "subscriber" as const, value: s })),
				this.#closePromise.then(() => ({ kind: "closed" as const, value: undefined })),
			])

			if (result.kind === "closed" || !result.value) break

			const subscriber = result.value

			// Run an async task to serve each subscription.
			this.#serveSubscribe(subscriber).catch((e) => {
				const err = asError(e)
				log.warn("failed to serve subscribe", err)
			})
		}
	}

	async #serveSubscribe(subscriber: SubscribeRecv) {
		try {
			const [base, ext] = splitExt(subscriber.track)
			log.debug("serving subscribe", subscriber.track, subscriber.namespace, base, ext)
			if (ext === "catalog") {
				await this.#serveCatalog(subscriber, base)
			} else if (ext === "mp4") {
				await this.#serveInit(subscriber, base)
			} else if (ext === "m4s") {
				await this.#serveTrack(subscriber, base)
			} else {
				throw new Error(`unknown subscription: ${subscriber.track}`)
			}
		} catch (e) {
			log.error("failed to serve subscribe", e)
			const err = asError(e)
			// TODO(itzmanish): should check if the error is not found and send appropriate error code
			await subscriber.close({ code: 0n, reason: `failed to process subscribe: ${err.message}` })
		} finally {
			// TODO we can't close subscribers because there's no support for clean termination
			// await subscriber.close()
		}
	}

	async #serveCatalog(subscriber: SubscribeRecv, name: string) {
		// We only support ".catalog"
		if (name !== "") throw new Error(`unknown catalog: ${name}`)

		const bytes = Catalog.encode(this.catalog)

		log.debug("[catalog] serving catalog to subscriber", {
			trackCount: this.catalog.tracks.length,
			tracks: this.catalog.tracks.map((t) => ({ name: t.name, initTrack: (t as { initTrack?: string }).initTrack })),
		})

		await subscriber.ack()
		await sleep(500)

		const stream = await subscriber.subgroup({ group: 0, subgroup: 0 })
		await stream.write({ object_id: 0, object_payload: bytes })
		await stream.close()
	}

	async #serveInit(subscriber: SubscribeRecv, name: string) {
		const track = this.#tracks.get(name)
		if (!track) throw new Error(`no track with name ${subscriber.track}`)

		await subscriber.ack()
		await sleep(500)

		const init = await track.init()

		const stream = await subscriber.subgroup({ group: 0, subgroup: 0 })
		await stream.write({ object_id: 0, object_payload: init })
		await stream.close()
	}

	async #serveTrack(subscriber: SubscribeRecv, name: string) {
		const track = this.#tracks.get(name)
		if (!track) throw new Error(`no track with name ${subscriber.track}`)

		// Send a SUBSCRIBE_OK
		await subscriber.ack()

		// NOTE(itzmanish): hack to make sure subscribe ok reaches before the segement object
		await sleep(500)

		const segments = track.segments().getReader()

		for (;;) {
			const { value: segment, done } = await segments.read()
			if (done) break

			// Serve the segment and log any errors that occur.
			this.#serveSegment(subscriber, segment).catch((e) => {
				const err = asError(e)
				log.warn("failed to serve segment", err)
			})
		}
	}

	async #serveSegment(subscriber: SubscribeRecv, segment: Segment) {
		// Create a new stream for each segment.
		const stream = await subscriber.subgroup({
			group: segment.id,
			subgroup: 0, // @todo: figure out the right way to do this
			priority: 127, // TODO,default to mid value, see: https://github.com/moq-wg/moq-transport/issues/504
		})

		let object = 0

		// Pipe the segment to the stream.
		const chunks = segment.chunks().getReader()
		for (;;) {
			const { value, done } = await chunks.read()
			if (done) break

			await stream.write({
				object_id: object,
				object_payload: value,
			})

			object += 1
		}

		await stream.close()
	}

	// Attach the captured video stream to the given video element.
	attach(video: HTMLVideoElement) {
		video.srcObject = this.config.media
	}

	close() {
		if (this.#closed) return
		this.#closed = true
		this.#closeResolve?.()
		// Stop all encoder pipelines by stopping the underlying MediaStreamTracks.
		for (const track of this.config.media.getTracks()) {
			track.stop()
		}
		log.debug("broadcast closed")
	}

	// Returns the error message when the connection is closed
	async closed(): Promise<Error> {
		try {
			await this.#running
			return new Error("closed") // clean termination
		} catch (e) {
			return asError(e)
		}
	}
}

function splitExt(s: string): [string, string] {
	const i = s.lastIndexOf(".")
	if (i < 0) throw new Error(`no extension found`)
	return [s.substring(0, i), s.substring(i + 1)]
}
