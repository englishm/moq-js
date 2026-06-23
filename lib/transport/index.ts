// Core transport
export { Client } from "./client"
export type { ClientConfig } from "./client"

export { Connection } from "./connection"

export { SubscribeRecv, PublishNamespaceSend } from "./publisher"
export { PublishNamespaceRecv, SubscribeSend } from "./subscriber"
export type { SubscribeRequestOptions } from "./subscriber"
export { FilterType, GroupOrder, SubscriptionFilter } from "./control"

// Subgroup/datagram types (needed by player worker)
export { SubgroupReader, SubgroupWriter } from "./subgroup"
export type { SubgroupHeader, SubgroupObject } from "./subgroup"
export { SubgroupType } from "./subgroup"
export { ReadableStreamBuffer, WritableStreamBuffer, ReadableWritableStreamBuffer } from "./buffer"
export type { Reader, Writer } from "./buffer"

// Common utilities re-exported so consumers don't need a separate package
export { asError } from "../common/error"
export { Queue, Watch, Notify, Deferred } from "../common/async"
export type { WatchNext } from "../common/async"
export { sleep } from "./utils"

// Stats — types shared across packages + transport-layer collector
export { TransportStats } from "./stats"
export type { InboundTrackStats } from "./stats"

// Stats types — shared across transport, player, and publisher
export type {
	MoqStat,
	MoqStatsReport,
	MoqStatType,
	MoqStatBase,
	SessionStat,
	SessionState,
	TransportStat,
	ControlStreamStat,
	InboundTrackStat,
	VideoDecoderStat,
	AudioDecoderStat,
	VideoRenderStat,
	AudioPlaybackStat,
	TimelineStat,
	CodecStat,
} from "../common/stats"
export { Ewma, Jitter, LatencyRing } from "../common/stats"

// Logger — full surface exported so consumers call setGlobalLogger from here
export {
	getLogger,
	getWorkerLogger,
	getWorkletLogger,
	setGlobalLogger,
	getGlobalLogger,
	createConsoleLogger,
	notifyLoggerLevelChanged,
	onLoggerLevelChange,
	installWorkerLogReceiver,
	installWorkletLogReceiver,
	setWorkerLogLevel,
	setWorkletLogLevel,
} from "../common/logger"
export type { Logger, LogLevel, LogLevelName, ScopedLogger, WorkerLogRecord } from "../common/logger"
