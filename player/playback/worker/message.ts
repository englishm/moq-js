import { SubgroupHeader } from "@moq-js/transport"
import { RingShared } from "../../common/ring"
import type { LogLevel, WorkerLogRecord } from "@moq-js/transport"

export interface Config {
	audio?: ConfigAudio
	video?: ConfigVideo
}

export interface ConfigAudio {
	channels: number
	sampleRate: number

	ring: RingShared
}

export interface ConfigVideo {
	canvas: OffscreenCanvas
}

export interface Init {
	name: string // name of the init object
	data: Uint8Array
}

export interface Segment {
	init: string // name of the init object
	kind: "audio" | "video"
	header: SubgroupHeader
	buffer: Uint8Array
	stream: ReadableStream<Uint8Array>
}

/*
export interface Play {
	// Start playback once the minimum buffer size has been reached.
	minBuffer: number
}

export interface Seek {
	timestamp: number
}
*/

// Sent periodically with the current timeline info.
export interface Timeline {
	// The current playback position
	timestamp?: number

	// Audio specific information
	audio: TimelineAudio

	// Video specific information
	video: TimelineVideo
}

export interface TimelineAudio {
	buffer: Range[]
}

export interface TimelineVideo {
	buffer: Range[]
}

export interface Range {
	start: number
	end: number
}

// Used to validate that only the correct messages can be sent.

// Any top level messages that can be sent to the worker.
export interface ToWorker {
	// Sent to configure on startup.
	config?: Config

	// Sent on each init/data stream
	init?: Init
	segment?: Segment
	play?: boolean

	// Sent to update the worker's cached log level when setGlobalLogger is called.
	logLevel?: LogLevel

	// Sent to request a stats snapshot. The worker replies with a FromWorker
	// message carrying the same requestId.
	getStats?: { requestId: number }

	/*
	// Sent to control playback
	play?: Play
	seek?: Seek
	*/
}

// Any top-level messages that can be sent from the worker.
export interface FromWorker {
	// Sent back to the main thread regularly to update the UI
	timeline?: Timeline

	// Log record forwarded from the worker to the main thread.
	log?: WorkerLogRecord

	// Stats snapshot reply. requestId matches the ToWorker.getStats request.
	// entries is a serialised array of MoqStat objects (plain JSON-compatible).
	stats?: { requestId: number; entries: import("@moq-js/transport").MoqStat[] }

	// Worker signals the first video frame was rendered (triggers ttff on main thread).
	firstFrameRendered?: true
}

/*
interface ToWorklet {
	config?: Audio.Config
}

*/
