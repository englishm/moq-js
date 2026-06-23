import * as Message from "./worker/message"

import { Connection, Client, SubgroupReader } from "@moq-js/transport"
import { asError } from "@moq-js/transport"
import * as Catalog from "@moq-js/catalog"
import { getLogger, setGlobalLogger, createConsoleLogger } from "@moq-js/transport"
import type { LogLevel, MoqStatsReport, SessionStat, CodecStat } from "@moq-js/transport"

import Backend from "./backend"

// Re-export logger API so consumers of @moq-js/player can configure logging.
export { setGlobalLogger, getGlobalLogger, createConsoleLogger, notifyLoggerLevelChanged } from "@moq-js/transport"
export type { Logger, LogLevel } from "@moq-js/transport"

// Re-export stats types so consumers import from one place.
export type { MoqStatsReport, MoqStat, MoqStatType } from "@moq-js/transport"

const log = getLogger()

export type Range = Message.Range
export type Timeline = Message.Timeline

/**
 * Optional explicit track selection passed when constructing a Player.
 *
 * - `string`: subscribe to the named track. Throws if the catalog does not
 *   contain a track of the matching kind with that name.
 * - `null`: do not subscribe to a track of this kind.
 * - omitted (`undefined`): pick the first track of this kind in the catalog
 *   (current default behavior).
 */
export interface TrackSelection {
	video?: string | null
	audio?: string | null
}

export interface PlayerConfig {
	url: string
	namespace: string
	fingerprint?: string // URL to fetch TLS certificate fingerprint
	/**
	 * Canvas to render video into. Required unless `selection.video === null`
	 * (audio-only playback).
	 */
	canvas?: HTMLCanvasElement
	/** Enable the default console logger at this level before connecting. */
	logLevel?: LogLevel
	/** Explicit track selection. Defaults to first video + first audio if omitted. */
	selection?: TrackSelection
}

export interface PlayerFromCatalogOptions {
	/**
	 * Canvas to render video into. Required unless `selection.video === null`
	 * (audio-only playback).
	 */
	canvas?: HTMLCanvasElement
	/** Explicit track selection. Defaults to first video + first audio if omitted. */
	selection?: TrackSelection
	/** Initial index into catalog.tracks used by getCurrentTrack/switchTrack. */
	tracknum?: number
	/**
	 * Namespace this player is bound to. Required when callers want to use
	 * `Player.getNamespace()` together with `fetchCatalog` to refresh the
	 * catalog at runtime via `Player.setCatalog`.
	 */
	namespace: string
}

// This class must be created on the main thread due to AudioContext.
export default class Player extends EventTarget {
	#backend: Backend

	// A periodically updated timeline
	//#timeline = new Watch<Timeline | undefined>(undefined)

	#connection: Connection
	#namespace: string
	#catalog: Catalog.Root
	#tracksByName: Map<string, Catalog.Track>
	#tracknum: number
	#audioTrackName: string
	#videoTrackName: string
	#muted: boolean
	#paused: boolean
	#liveStartTime: number = Date.now()

	// Running is a promise that resolves when the player is closed.
	// #close is called with no error, while #abort is called with an error.
	#running: Promise<void>
	#close!: () => void
	#abort!: (err: Error) => void
	#ready: Promise<void>
	#trackTasks: Map<string, Promise<void>> = new Map()
	// Tracks whether each active subscription ended cleanly (PUBLISH_DONE or
	// cancellation) vs. due to an unexpected error. Used to auto-close the
	// Player when the publisher terminates the broadcast cleanly.
	#trackEndedCleanly: Map<string, boolean> = new Map()
	#timeUpdateInterval?: ReturnType<typeof setInterval>
	#isClosed = false

	// --- stats tracking ---
	// Approximate time when play() was first called (ms, performance.now()).
	#playStartMs = 0
	// Cumulative ms spent in the playing state.
	#playMs = 0
	// Timestamp when the current play epoch started (0 if not playing).
	#playEpochStartMs = 0
	// Last error message seen via the "error" event.
	#lastErrorMessage?: string

	private constructor(args: {
		connection: Connection
		namespace: string
		catalog: Catalog.Root
		canvas?: OffscreenCanvas
		audioTrackName: string
		videoTrackName: string
		tracknum: number
	}) {
		super()
		this.#connection = args.connection
		this.#namespace = args.namespace
		this.#catalog = args.catalog
		this.#tracksByName = new Map(args.catalog.tracks.map((track) => [track.name, track]))
		this.#tracknum = args.tracknum
		this.#audioTrackName = args.audioTrackName
		this.#videoTrackName = args.videoTrackName
		this.#muted = false
		this.#paused = true
		this.#backend = new Backend(
			{
				catalog: args.catalog,
				canvas: args.canvas,
				audioTrackName: args.audioTrackName,
				videoTrackName: args.videoTrackName,
			},
			this,
		)
		super.dispatchEvent(new CustomEvent("catalogupdated", { detail: args.catalog }))
		super.dispatchEvent(new CustomEvent("loadedmetadata", { detail: args.catalog }))

		const abort = new Promise<void>((resolve, reject) => {
			this.#close = resolve
			this.#abort = reject
		})

		// Async work
		this.#running = abort.catch(this.#close)

		this.#ready = this.#run()
		this.#ready.catch((err) => {
			log.error("error in run", err)
			this.#lastErrorMessage = err instanceof Error ? err.message : String(err)
			super.dispatchEvent(new CustomEvent("error", { detail: err }))
			this.#abort(err)
		})
	}

	static async create(config: PlayerConfig, tracknum: number = 0): Promise<Player> {
		if (config.logLevel) {
			setGlobalLogger(createConsoleLogger(config.logLevel))
		}

		const client = new Client({ url: config.url, fingerprint: config.fingerprint })
		const connection = await client.connect()

		const catalog = await fetchCatalog(connection, [config.namespace])
		log.debug("catalog", catalog)

		return Player.fromCatalog(connection, catalog as Catalog.Root, {
			canvas: config.canvas,
			selection: config.selection,
			tracknum,
			namespace: config.namespace,
		})
	}

	/**
	 * Construct a player from an already-connected transport and an
	 * already-fetched catalog. Lets callers share one `Connection` across
	 * multiple players, inspect the catalog before subscribing, or skip a
	 * kind via `selection: { audio: null }` / `{ video: null }`.
	 *
	 * - `canvas` is required unless `selection.video === null` (audio-only).
	 * - Throws if both audio and video are disabled (nothing to play).
	 * - Throws if a video track is selected but no canvas is provided.
	 */
	static async fromCatalog(
		connection: Connection,
		catalog: Catalog.Root,
		opts: PlayerFromCatalogOptions,
	): Promise<Player> {
		const audioTrackName = resolveAudioTrack(catalog, opts.selection?.audio)
		const videoTrackName = resolveVideoTrack(catalog, opts.selection?.video)
		log.debug("selected tracks", {
			audio: audioTrackName || "(none)",
			video: videoTrackName || "(none)",
		})

		if (!audioTrackName && !videoTrackName) {
			throw new Error("Player.fromCatalog: no audio or video track selected")
		}
		if (videoTrackName && !opts.canvas) {
			throw new Error("Player.fromCatalog: video track selected but no canvas provided")
		}

		// Only transfer the canvas to an OffscreenCanvas when we actually have a
		// video track to render. transferControlToOffscreen mutates the canvas
		// element irreversibly, so we must not call it for audio-only sessions.
		const canvas = videoTrackName ? opts.canvas!.transferControlToOffscreen() : undefined

		return new Player({
			connection,
			namespace: opts.namespace,
			catalog,
			canvas,
			audioTrackName,
			videoTrackName,
			tracknum: opts.tracknum ?? 0,
		})
	}

	async #run() {
		// Key is "namespace/initTrack" to deduplicate init tracks shared across audio and video.
		// Value is [namespace, initTrack] for the #runInit call.
		const inits = new Map<string, [string, string]>()
		const tracks = new Array<Catalog.Track>()

		this.#catalog.tracks.forEach((track) => {
			if (track.name === this.#videoTrackName || track.name === this.#audioTrackName) {
				if (!track.namespace) throw new Error("track has no namespace")
				if (track.initTrack) {
					const key = `${track.namespace.join("/")}/${track.initTrack}`
					inits.set(key, [track.namespace.join("/"), track.initTrack])
				}
				tracks.push(track)
			}
		})

		log.debug("inits", inits)
		log.debug("tracks", tracks)

		// Call #runInit on each unique init track (deduplicated by namespace+name key)
		// TODO do this in parallel with #runTrack to remove a round trip
		await Promise.all(Array.from(inits.values()).map((init) => this.#runInit(...init)))
	}

	async #runInit(namespace: string, name: string) {
		log.debug("running runInit", namespace, name)
		const sub = await this.#connection.subscribe([namespace], name)
		try {
			log.debug("waiting for init data")
			const init = await Promise.race([sub.data(), this.#running])
			if (!init) throw new Error("no init data")

			log.debug("got init data")
			// We don't care what type of reader we get, we just want the payload.
			const chunk = await init.read()
			if (!chunk) throw new Error("no init chunk")
			if (!(chunk.object_payload instanceof Uint8Array)) throw new Error("invalid init chunk")

			this.#backend.init({ data: chunk.object_payload, name })
		} finally {
			await sub.close()
		}
	}

	async #trackTask(track: Catalog.Track) {
		if (!track.namespace) throw new Error("track has no namespace")

		if (this.#paused) return

		const kind = Catalog.isVideoTrack(track) ? "video" : Catalog.isAudioTrack(track) ? "audio" : "unknown"
		if (kind == "audio" && this.#muted) return

		if (kind == "audio") {
			// Save ref to last audio track we subscribed to for unmuting
			this.#audioTrackName = track.name
		}

		if (kind == "video") {
			this.#videoTrackName = track.name
		}

		let eventOfFirstSegmentSent = false
		const sub = await this.#connection.subscribe(track.namespace, track.name)
		// Assume clean termination unless an unexpected error is thrown.
		// A clean exit means either:
		//   - sub.data() returned undefined (queue closed: PUBLISH_DONE code 0)
		//   - the for-loop body threw an Error containing "PUBLISH_DONE" (queue
		//     aborted by subscriber.onDone with non-zero code; still a protocol
		//     clean shutdown, not an internal failure)
		//   - the error message includes "cancelled" (explicit local cancel)
		this.#trackEndedCleanly.set(track.name, true)

		try {
			log.debug("starting segment data loop")
			for (;;) {
				log.trace("waiting for segment data")
				const segment = await Promise.race([sub.data(), this.#running])
				if (!segment) break

				if (!(segment instanceof SubgroupReader)) {
					throw new Error(`expected group reader for segment: ${track.name}`)
				}

				if (kind == "unknown") {
					throw new Error(`unknown track kind: ${track.name}`)
				}

				if (!track.initTrack) {
					throw new Error(`no init track for segment: ${track.name}`)
				}

				if (!eventOfFirstSegmentSent && kind == "video") {
					super.dispatchEvent(new Event("loadeddata"))
					eventOfFirstSegmentSent = true
				}

				const [buffer, stream] = segment.stream.release() as [Uint8Array, ReadableStream<Uint8Array>]

				this.#backend.segment({
					init: track.initTrack,
					kind,
					header: segment.header,
					buffer,
					stream,
				})
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : ""
			if (message.includes("cancelled")) {
				log.debug("cancelled subscription to track", track.name)
			} else if (message.includes("PUBLISH_DONE")) {
				// Protocol-level clean shutdown from the publisher (draft-16
				// PUBLISH_DONE). subscriber.onDone aborts the data queue with this
				// message when code != 0 (e.g. publisher ended the broadcast with
				// a non-zero status). Not an error consumers should react to.
				log.debug("publisher ended subscription cleanly via PUBLISH_DONE", { track: track.name, message })
			} else {
				this.#trackEndedCleanly.set(track.name, false)
				this.#lastErrorMessage = message
				log.error("error in runTrack", error)
				super.dispatchEvent(new CustomEvent("error", { detail: error }))
			}
		} finally {
			await sub.close()
		}
	}

	#runTrack(track: Catalog.Track) {
		if (this.#trackTasks.has(track.name)) {
			log.warn(`runTrack task already exists for track: ${track.name}`)
			return
		}

		const task = (async () => this.#trackTask(track))()

		this.#trackTasks.set(track.name, task)

		task.catch((err) => {
			this.#trackEndedCleanly.set(track.name, false)
			log.error(`error subscribing to track ${track.name}`, err)
			super.dispatchEvent(new CustomEvent("error", { detail: err }))
		}).finally(() => {
			this.#trackTasks.delete(track.name)
			this.#maybeAutoClose()
		})
	}

	// When all active track subscriptions have terminated, decide whether the
	// player should auto-close. We only auto-close if at least one track ran
	// and every track ended cleanly (PUBLISH_DONE or local cancellation). If
	// any track errored, we leave Player.close() to the consumer / #abort path.
	#maybeAutoClose() {
		if (this.#isClosed) return
		if (this.#trackTasks.size > 0) return
		if (this.#paused) return
		if (this.#trackEndedCleanly.size === 0) return

		let allClean = true
		for (const clean of this.#trackEndedCleanly.values()) {
			if (!clean) {
				allClean = false
				break
			}
		}
		this.#trackEndedCleanly.clear()

		if (!allClean) return

		log.debug("all tracks ended cleanly; auto-closing player")
		this.#isClosed = true
		// Resolve the #running promise so closed() returns undefined. Do this
		// directly rather than calling close() to avoid tearing down the
		// underlying connection — consumers may still want to reconnect.
		this.#close()
		this.#stopEmittingTimeUpdate()
	}

	#startEmittingTimeUpdate() {
		this.#stopEmittingTimeUpdate()
		this.#timeUpdateInterval = setInterval(() => {
			this.dispatchEvent(new Event("timeupdate"))
		}, 1000) // Emit timeupdate every second
	}

	#stopEmittingTimeUpdate() {
		if (this.#timeUpdateInterval !== undefined) {
			clearInterval(this.#timeUpdateInterval)
			this.#timeUpdateInterval = undefined
		}
	}

	getCatalog() {
		return this.#catalog
	}

	/**
	 * Returns the underlying transport Connection so callers can issue
	 * ad-hoc subscribes (e.g. `fetchCatalog(player.getConnection(),
	 * [player.getNamespace()])` to refresh the catalog at runtime).
	 */
	getConnection(): Connection {
		return this.#connection
	}

	/**
	 * Returns the namespace this player was created against. Useful when
	 * combined with `getConnection()` and `fetchCatalog` to refresh the
	 * catalog at runtime.
	 */
	getNamespace(): string {
		return this.#namespace
	}

	/**
	 * Replace the in-memory catalog. Rebuilds the internal `#tracksByName`
	 * map so subsequent `subscribeFromTrackName(name)` calls find
	 * newly-added tracks.
	 *
	 * Does NOT subscribe or unsubscribe to anything — that decision belongs
	 * to the caller. Dispatches a `catalogupdated` CustomEvent (same event
	 * name used in the constructor) so consumers can listen and decide
	 * which tracks to subscribe to.
	 *
	 * Policy for `#videoTrackName` / `#audioTrackName`:
	 *  - If the currently-selected track name is still present in the new
	 *    catalog, keep it.
	 *  - Otherwise, fall back to the first track of that kind in the new
	 *    catalog, or `""` if none exist.
	 *
	 * Note: this does not retroactively change any active subscription. If
	 * the currently-selected track is removed from the catalog, the
	 * already-running track task continues until the publisher tears it
	 * down (or the caller explicitly calls `unsubscribeFromTrack`).
	 */
	setCatalog(catalog: Catalog.Root): void {
		this.#catalog = catalog
		this.#tracksByName = new Map(catalog.tracks.map((track) => [track.name, track]))

		// Keep current track selection if still present, else fall back to
		// the first track of that kind, else "".
		if (this.#videoTrackName && !this.#tracksByName.has(this.#videoTrackName)) {
			this.#videoTrackName = catalog.tracks.find(Catalog.isVideoTrack)?.name ?? ""
		}
		if (this.#audioTrackName && !this.#tracksByName.has(this.#audioTrackName)) {
			this.#audioTrackName = catalog.tracks.find(Catalog.isAudioTrack)?.name ?? ""
		}

		super.dispatchEvent(new CustomEvent("catalogupdated", { detail: catalog }))
	}

	getCurrentTrack() {
		if (this.#tracknum >= 0 && this.#tracknum < this.#catalog.tracks.length) {
			return this.#catalog.tracks[this.#tracknum]
		} else {
			log.warn("invalid track number", this.#tracknum)
			return null
		}
	}

	getVideoTracks() {
		return this.#catalog.tracks.filter(Catalog.isVideoTrack).map((track) => track.name)
	}

	getAudioTracks() {
		return this.#catalog.tracks.filter(Catalog.isAudioTrack).map((track) => track.name)
	}

	getCurrentTime() {
		return (Date.now() - this.#liveStartTime) / 1000
	}

	isPaused() {
		return this.#paused
	}

	get muted(): boolean {
		return this.#muted
	}

	get videoTrackName(): string {
		return this.#videoTrackName
	}

	async switchTrack(trackname: string) {
		const currentTrack = this.getCurrentTrack()
		if (this.#paused) {
			this.#videoTrackName = trackname
			return
		}
		if (currentTrack) {
			log.debug(`unsubscribing from track ${currentTrack.name}, subscribing to ${trackname}`)
			await this.unsubscribeFromTrack(currentTrack.name)
		} else {
			log.debug(`subscribing to track ${trackname}`)
		}
		this.#tracknum = this.#catalog.tracks.findIndex((track) => track.name === trackname)

		this.subscribeFromTrackName(trackname)
	}

	async mute(isMuted: boolean) {
		const wasMuted = this.#muted
		this.#muted = isMuted
		if (isMuted) {
			if (!this.#paused && !wasMuted && this.#audioTrackName) {
				log.debug("unsubscribing from audio track", this.#audioTrackName)
				await this.unsubscribeFromTrack(this.#audioTrackName)
			}
			await this.#backend.mute()
		} else {
			if (!this.#paused && wasMuted && this.#audioTrackName) {
				log.debug("subscribing to audio track", this.#audioTrackName)
				this.subscribeFromTrackName(this.#audioTrackName)
			}
			await this.#backend.unmute()
		}
		super.dispatchEvent(new CustomEvent("volumechange", { detail: { muted: isMuted } }))
	}

	async unsubscribeFromTrack(trackname: string) {
		log.debug(`unsubscribing from track ${trackname}`)
		super.dispatchEvent(new CustomEvent("unsubscribestared", { detail: { track: trackname } }))
		await this.#connection.unsubscribe(trackname)
		const task = this.#trackTasks.get(trackname)
		if (task) {
			await task
		}
		super.dispatchEvent(new CustomEvent("unsubscribedone", { detail: { track: trackname } }))
	}

	subscribeFromTrackName(trackname: string) {
		log.debug(`subscribing to track ${trackname}`)
		const track = this.#tracksByName.get(trackname)
		if (track) {
			super.dispatchEvent(new CustomEvent("subscribestared", { detail: { track: trackname } }))
			this.#runTrack(track)
			super.dispatchEvent(new CustomEvent("subscribedone", { detail: { track: trackname } }))
		} else {
			log.warn(`track ${trackname} not found`)
		}
	}

	/**
	 * Returns a snapshot of stats for this Player as a `Map<id, MoqStat>`.
	 *
	 * Stats are cumulative (never reset). Diff two consecutive snapshots to
	 * compute rates. Each entry has a stable `id` and a `type` discriminator.
	 *
	 * Internally fans out to the transport layer (synchronous), the playback
	 * worker (async, 250 ms timeout), and the audio worklet (async, 250 ms
	 * timeout) in parallel, then merges the results.
	 *
	 * If the worker or worklet times out their entries are omitted from the
	 * report rather than rejecting the whole call. Check `session.lastErrorMessage`
	 * if entries are unexpectedly missing.
	 */
	async getStats(): Promise<MoqStatsReport> {
		const nowMs = performance.now()
		const report: MoqStatsReport = new Map()

		// 1. Transport stats (synchronous).
		this.#connection.getStats(report)

		// 2. Worker + worklet stats (parallel, best-effort).
		const [workerEntries, workletEntries] = await Promise.all([
			this.#backend.getWorkerStats(),
			this.#backend.getWorkletStats(),
		])
		for (const entry of workerEntries) {
			report.set(entry.id, entry)
		}
		for (const entry of workletEntries) {
			report.set(entry.id, entry)
		}

		// 3. Session stat.
		const uptimeMs = nowMs - this.#liveStartTime
		let playMs = this.#playMs
		if (this.#playEpochStartMs > 0) {
			// Currently playing — accumulate the live epoch.
			playMs += nowMs - this.#playEpochStartMs
		}

		// ttff: approximate ms from first play() call to first frame rendered.
		let ttffMs: number | undefined
		try {
			const firstFrameMs = await Promise.race([
				this.#backend.firstFrameRenderedAt(),
				// Don't wait more than 0ms — only resolve if already done.
				new Promise<number>((_, reject) => setTimeout(() => reject(new Error("not yet")), 0)),
			])
			if (this.#playStartMs > 0) {
				ttffMs = firstFrameMs - this.#playStartMs
			}
		} catch {
			// First frame not yet rendered; leave ttffMs undefined.
		}

		const state: SessionStat["state"] = this.#isClosed
			? "closed"
			: this.#paused
				? this.#playStartMs === 0
					? "idle"
					: "paused"
				: "playing"

		const session: SessionStat = {
			id: "session",
			type: "session",
			timestamp: nowMs,
			state,
			uptimeMs,
			playMs,
			ttffMs,
			lastErrorMessage: this.#lastErrorMessage,
		}
		report.set("session", session)

		// 4. Codec entries from catalog.
		for (const track of this.#catalog.tracks) {
			if (Catalog.isVideoTrack(track)) {
				const codec: CodecStat = {
					id: `codec:video:${track.name}`,
					type: "codec",
					timestamp: nowMs,
					kind: "video",
					codec: track.selectionParams.codec,
					mimeType: track.selectionParams.mimeType,
					width: track.selectionParams.width,
					height: track.selectionParams.height,
					framerate: track.selectionParams.framerate,
					bitrate: track.selectionParams.bitrate,
				}
				report.set(codec.id, codec)
			} else if (Catalog.isAudioTrack(track)) {
				const codec: CodecStat = {
					id: `codec:audio:${track.name}`,
					type: "codec",
					timestamp: nowMs,
					kind: "audio",
					codec: track.selectionParams.codec,
					mimeType: track.selectionParams.mimeType,
					samplerate: track.selectionParams.samplerate,
					channels: track.selectionParams.channelConfig ? Number(track.selectionParams.channelConfig) : undefined,
					bitrate: track.selectionParams.bitrate,
				}
				report.set(codec.id, codec)
			}
		}

		return report
	}

	async close(err?: Error) {
		if (err) this.#abort(err)
		else this.#close()

		this.#stopEmittingTimeUpdate()

		// Wait for all in-flight track subscriptions to settle before closing transport.
		if (this.#trackTasks.size > 0) {
			await Promise.allSettled(this.#trackTasks.values())
		}

		if (this.#backend) await this.#backend.close()
		if (this.#connection) this.#connection.close()
	}

	async closed(): Promise<Error | undefined> {
		try {
			await this.#running
		} catch (e) {
			log.error("error in Player.closed", e)
			return asError(e)
		}
	}

	/*
	play() {
		this.#backend.play({ minBuffer: 0.5 }) // TODO configurable
	}

	seek(timestamp: number) {
		this.#backend.seek({ timestamp })
	}
	*/

	// Added this to divide play and pause into two different functions
	async togglePlayPause() {
		if (this.#paused) {
			await this.play()
		} else {
			await this.pause()
		}
	}

	async play() {
		if (this.#paused) {
			this.#paused = false
			// Record the start of this play epoch for cumulative playMs tracking.
			const nowMs = performance.now()
			if (this.#playStartMs === 0) this.#playStartMs = nowMs
			this.#playEpochStartMs = nowMs

			await this.#ready
			if (this.#paused) return

			if (this.#videoTrackName) {
				this.subscribeFromTrackName(this.#videoTrackName)
			}
			if (!this.#muted && this.#audioTrackName) {
				this.subscribeFromTrackName(this.#audioTrackName)
				await this.#backend.unmute()
			}
			this.#backend.play()
			this.#startEmittingTimeUpdate()
			super.dispatchEvent(new CustomEvent("play", { detail: { track: this.#videoTrackName } }))
		}
	}

	async pause() {
		if (!this.#paused) {
			this.#paused = true
			// Accumulate play time for this epoch.
			if (this.#playEpochStartMs > 0) {
				this.#playMs += performance.now() - this.#playEpochStartMs
				this.#playEpochStartMs = 0
			}
			const mutePromise = this.#backend.mute()
			const audioPromise =
				!this.#muted && this.#audioTrackName
					? this.unsubscribeFromTrack(this.#audioTrackName)
					: Promise.resolve()
			const videoPromise = this.#videoTrackName
				? this.unsubscribeFromTrack(this.#videoTrackName)
				: Promise.resolve()
			super.dispatchEvent(new CustomEvent("pause", { detail: { track: this.#videoTrackName } }))
			log.debug("dispatching pause event")

			this.#backend.pause()
			this.#stopEmittingTimeUpdate()
			await Promise.all([mutePromise, audioPromise, videoPromise])
		}
	}

	async setVolume(newVolume: number) {
		this.#backend.setVolume(newVolume)
		if (newVolume == 0 && !this.#muted) {
			await this.mute(true)
		} else if (newVolume > 0 && this.#muted) {
			await this.mute(false)
		}
	}

	getVolume(): number {
		return this.#backend ? this.#backend.getVolume() : 0
	}

	/*
	async *timeline() {
		for (;;) {
			const [timeline, next] = this.#timeline.value()
			if (timeline) yield timeline
			if (!next) break

			await next
		}
	}
	*/
}

/**
 * Resolve a {@link TrackSelection} choice to a concrete track name.
 *
 * - `null`: caller explicitly asked to skip this kind. Returns "".
 * - `string`: must exist in the catalog with the matching kind, else throws.
 * - `undefined`: pick the first track of this kind in the catalog ("" if none).
 */
function resolveAudioTrack(catalog: Catalog.Root, choice: string | null | undefined): string {
	if (choice === null) return ""
	if (typeof choice === "string") {
		const track = catalog.tracks.find((t) => t.name === choice)
		if (!track || !Catalog.isAudioTrack(track)) {
			throw new Error(`audio track ${choice} not found in catalog`)
		}
		return choice
	}
	return catalog.tracks.find(Catalog.isAudioTrack)?.name ?? ""
}

function resolveVideoTrack(catalog: Catalog.Root, choice: string | null | undefined): string {
	if (choice === null) return ""
	if (typeof choice === "string") {
		const track = catalog.tracks.find((t) => t.name === choice)
		if (!track || !Catalog.isVideoTrack(track)) {
			throw new Error(`video track ${choice} not found in catalog`)
		}
		return choice
	}
	return catalog.tracks.find(Catalog.isVideoTrack)?.name ?? ""
}

/**
 * Fetch the catalog from the server by subscribing to the well-known ".catalog" track.
 *
 * This is an application-layer convention owned by the player layer, not the
 * transport. Exposed for callers that want to inspect a catalog (track names,
 * codecs, etc.) before constructing a Player via {@link Player.fromCatalog}.
 */
export async function fetchCatalog(connection: Connection, namespace: string[]): Promise<Catalog.Root> {
	const subscribe = await connection.subscribe(namespace, ".catalog")
	try {
		log.debug("catalog subscribe request sent; waiting for catalog data")
		const segment = await subscribe.data()
		if (!segment) throw new Error("no catalog data")

		log.debug("catalog segment", segment)
		const chunk = await segment.read()
		if (!chunk) throw new Error("no catalog chunk")

		log.debug("catalog chunk", chunk)
		await segment.close()
		await subscribe.close() // we done

		if (chunk.object_payload instanceof Uint8Array) {
			return Catalog.decode(chunk.object_payload)
		} else {
			throw new Error("invalid catalog chunk")
		}
	} catch (e) {
		log.error("catalog fetch error", e)
		const err = asError(e)
		throw err
	}
}
