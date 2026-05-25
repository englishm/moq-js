import { RingShared } from "../../common/ring"
import type { LogLevel, WorkerLogRecord } from "../../common/logger"

export interface From {
	config?: Config
	// Sent to update the worklet's cached log level.
	logLevel?: LogLevel
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
