import { RingShared } from "../../common/ring"
import type { LogLevel, WorkerLogRecord, AudioPlaybackStat } from "@moq-js/transport"

// Messages sent from the main thread to the worklet.
export interface From {
	config?: Config
	// Sent to update the worklet's cached log level.
	logLevel?: LogLevel
	// Sent to request a stats snapshot.
	getStats?: { requestId: number }
}

export interface Config {
	channels: number
	sampleRate: number

	ring: RingShared
}

// Log record forwarded from the worklet to the main thread via port.postMessage.
export interface WorkletLogMessage {
	log: WorkerLogRecord
}

// Stats snapshot reply from worklet to main thread.
export interface WorkletStatsMessage {
	stats: { requestId: number; entry: AudioPlaybackStat }
}
