import * as Message from "./worker/message"

import { Connection } from "../transport/connection"
import * as Catalog from "../media/catalog"
import { asError } from "../common/error"

import Backend from "./backend"

import { Client } from "../transport/client"
import { GroupReader } from "../transport/objects"

export type Range = Message.Range
export type Timeline = Message.Timeline

export interface PlayerConfig {
	url: string
	namespace: string
	fingerprint?: string // URL to fetch TLS certificate fingerprint
	canvas: HTMLCanvasElement
}

// This class must be created on the main thread due to AudioContext.
export class Player {
	#backend: Backend

	// A periodically updated timeline
	//#timeline = new Watch<Timeline | undefined>(undefined)

	#connection: Connection
	#catalog: Catalog.Root
	#tracksByName: Map<string, Catalog.Track>
	#tracknum: number
	#audioTrackName: string
	#videoTrackName: string
	#muted: boolean
	#paused: boolean

	// Running is a promise that resolves when the player is closed.
	// #close is called with no error, while #abort is called with an error.
	#running: Promise<void>
	#close!: () => void
	#abort!: (err: Error) => void
	#trackTasks: Map<string, Promise<void>> = new Map()

	private constructor(connection: Connection, catalog: Catalog.Root, backend: Backend, tracknum: number) {
		this.#connection = connection
		this.#catalog = catalog
		this.#tracksByName = new Map(catalog.tracks.map((track) => [track.name, track]))
		this.#backend = backend
		this.#tracknum = tracknum
		this.#audioTrackName = ""
		this.#videoTrackName = ""
		this.#muted = false
		this.#paused = false

		const abort = new Promise<void>((resolve, reject) => {
			this.#close = resolve
			this.#abort = reject
		})

		// Async work
		this.#running = abort.catch(this.#close)

		this.#run().catch((err) => {
			console.error("Error in #run():", err)
			this.#abort(err)
		})
	}

	static async create(config: PlayerConfig, tracknum: number): Promise<Player> {
		const client = new Client({ url: config.url, fingerprint: config.fingerprint, role: "subscriber" })
		const connection = await client.connect()

		const catalog = await Catalog.fetch(connection, config.namespace)
		console.log("catalog", catalog)

		const canvas = config.canvas.transferControlToOffscreen()
		const backend = new Backend({ canvas, catalog })

		return new Player(connection, catalog, backend, tracknum)
	}

	async #run() {
		const inits = new Set<[string, string]>()
		const tracks = new Array<Catalog.Track>()

		this.#catalog.tracks.forEach((track, index) => {
			if (index == this.#tracknum || Catalog.isAudioTrack(track)) {
				if (!track.namespace) throw new Error("track has no namespace")
				if (track.initTrack) inits.add([track.namespace, track.initTrack])
				tracks.push(track)
			}
		})

		// Call #runInit on each unique init track
		// TODO do this in parallel with #runTrack to remove a round trip
		await Promise.all(Array.from(inits).map((init) => this.#runInit(...init)))

		// Call #runTrack on each track
		tracks.forEach((track) => {
			this.#runTrack(track)
		})
	}

	async #runInit(namespace: string, name: string) {
		const sub = await this.#connection.subscribe(namespace, name)
		try {
			const init = await Promise.race([sub.data(), this.#running])
			if (!init) throw new Error("no init data")

			// We don't care what type of reader we get, we just want the payload.
			const chunk = await init.read()
			if (!chunk) throw new Error("no init chunk")
			if (!(chunk.payload instanceof Uint8Array)) throw new Error("invalid init chunk")

			this.#backend.init({ data: chunk.payload, name })
		} finally {
			await sub.close()
		}
	}

	async #trackTask(track: Catalog.Track) {
		if (!track.namespace) throw new Error("track has no namespace")

		if (this.#paused) return

		const kind = Catalog.isVideoTrack(track) ? "video" : Catalog.isAudioTrack(track) ? "audio" : "unknown"
		if (kind == "audio" && this.#muted) return

		const sub = await this.#connection.subscribe(track.namespace, track.name)

		if (kind == "audio") {
			// Save ref to last audio track we subscribed to for unmuting
			this.#audioTrackName = track.name
		}

		if (kind == "video") {
			this.#videoTrackName = track.name
		}

		try {
			for (;;) {
				const segment = await Promise.race([sub.data(), this.#running])
				if (!segment) continue

				if (!(segment instanceof GroupReader)) {
					throw new Error(`expected group reader for segment: ${track.name}`)
				}

				if (kind == "unknown") {
					throw new Error(`unknown track kind: ${track.name}`)
				}

				if (!track.initTrack) {
					throw new Error(`no init track for segment: ${track.name}`)
				}

				const [buffer, stream] = segment.stream.release()

				this.#backend.segment({
					init: track.initTrack,
					kind,
					header: segment.header,
					buffer,
					stream,
				})
			}
		} catch (error) {
			console.error("Error in #runTrack:", error)
		} finally {
			await sub.close()
		}
	}

	#runTrack(track: Catalog.Track) {
		if (this.#trackTasks.has(track.name)) {
			console.warn(`Already exist a runTrack task for the track: ${track.name}`)
			return
		}

		const task = (async () => this.#trackTask(track))()

		this.#trackTasks.set(track.name, task)

		task.catch((err) => {
			console.error(`Error to subscribe to track ${track.name}`, err)
		}).finally(() => {
			this.#trackTasks.delete(track.name)
		})
	}

	getCatalog() {
		return this.#catalog
	}

	getCurrentTrack() {
		if (this.#tracknum >= 0 && this.#tracknum < this.#catalog.tracks.length) {
			return this.#catalog.tracks[this.#tracknum]
		} else {
			console.warn("Invalid track number:", this.#tracknum)
			return null
		}
	}

	getVideoTracks() {
		return this.#catalog.tracks.filter(Catalog.isVideoTrack).map((track) => track.name)
	}

	getAudioTracks() {
		return this.#catalog.tracks.filter(Catalog.isAudioTrack).map((track) => track.name)
	}

	isPaused() {
		return this.#paused
	}

	async switchTrack(trackname: string) {
		const currentTrack = this.getCurrentTrack()
		if (this.#paused) {
			this.#videoTrackName = trackname
			return
		}
		if (currentTrack) {
			console.log(`Unsubscribing from track: ${currentTrack.name} and Subscribing to track: ${trackname}`)
			await this.unsubscribeFromTrack(currentTrack.name)
		} else {
			console.log(`Subscribing to track: ${trackname}`)
		}
		this.#tracknum = this.#catalog.tracks.findIndex((track) => track.name === trackname)
		const tracksToStream = this.#catalog.tracks.filter((track) => track.name === trackname)
		await Promise.all(tracksToStream.map((track) => this.#runTrack(track)))
	}

	async mute(isMuted: boolean) {
		this.#muted = isMuted
		if (isMuted) {
			console.log("Unsubscribing from audio track: ", this.#audioTrackName)
			await this.unsubscribeFromTrack(this.#audioTrackName)
			await this.#backend.mute()
		} else {
			console.log("Subscribing to audio track: ", this.#audioTrackName)
			this.subscribeFromTrackName(this.#audioTrackName)
			await this.#backend.unmute()
		}
	}

	async unsubscribeFromTrack(trackname: string) {
		console.log(`Unsubscribing from track: ${trackname}`)
		await this.#connection.unsubscribe(trackname)
		const task = this.#trackTasks.get(trackname)
		if (task) {
			await task
		}
	}

	subscribeFromTrackName(trackname: string) {
		console.log(`Subscribing to track: ${trackname}`)
		const track = this.#tracksByName.get(trackname)
		if (track) {
			this.#runTrack(track)
		} else {
			console.warn(`Track ${trackname} not in #tracksByName`)
		}
	}

	#onMessage(msg: Message.FromWorker) {
		if (msg.timeline) {
			//this.#timeline.update(msg.timeline)
		}
	}

	async close(err?: Error) {
		if (err) this.#abort(err)
		else this.#close()

		if (this.#connection) this.#connection.close()
		if (this.#backend) await this.#backend.close()
	}

	async closed(): Promise<Error | undefined> {
		try {
			await this.#running
		} catch (e) {
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

	async play() {
		if (this.#paused) {
			this.#paused = false
			this.subscribeFromTrackName(this.#videoTrackName)
			if (!this.#muted) {
				this.subscribeFromTrackName(this.#audioTrackName)
				await this.#backend.unmute()
			}
		} else {
			await this.unsubscribeFromTrack(this.#videoTrackName)
			await this.unsubscribeFromTrack(this.#audioTrackName)
			await this.#backend.mute()
			this.#backend.pause()
			this.#paused = true
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
