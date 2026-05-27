/**
 * MoQJS Logger
 *
 * Design:
 * - One global dispatcher lives in this module.
 * - `getLogger()` is called once per module with no arguments. It reads the
 *   caller's file path from the call stack to derive a scope string
 *   (e.g. "transport/connection"), then returns a tiny frozen object whose
 *   five methods close over that scope string and call the single dispatcher.
 * - Only one dispatcher function set exists in memory. Per-module objects are
 *   five arrow-function references + one string — negligible and unavoidable.
 *
 * Usage inside the library (top of every .ts file):
 *   import { getLogger } from "../common/logger"
 *   const log = getLogger()
 *   log.debug("starting control loop")
 *
 * Usage as a library consumer:
 *   import { setGlobalLogger, createConsoleLogger } from "@moq-js/player"
 *   setGlobalLogger(createConsoleLogger("debug"))
 *   setGlobalLogger({ level: () => "warn", warn: console.warn, error: console.error })
 *   setGlobalLogger(undefined)  // restore default (error-only)
 *
 * Every emit forwards: "[MoQJS]", "[<scope>]", ...args
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Log level for controlling MoQJS output verbosity.
 *
 * `"*"`    — enable everything (same as "trace")
 * `"none"` — suppress all MoQJS output
 */
export type LogLevel = "*" | "trace" | "debug" | "info" | "warn" | "error" | "none"

/**
 * Logger interface implemented by consumers to receive MoQJS log messages.
 *
 * The library calls `level()` before every emit. If `level` is absent it
 * defaults to `"error"` and emits one `console.warn` exactly once.
 *
 * All methods receive leading args: `"[MoQJS]"`, `"[<scope>]"`, ...original args.
 * Individual level methods are optional — silently skipped when absent.
 */
export interface Logger {
	level?(): LogLevel
	trace?(...args: unknown[]): void
	debug?(...args: unknown[]): void
	info?(...args: unknown[]): void
	warn?(...args: unknown[]): void
	error?(...args: unknown[]): void
}

/** The scoped logger returned to each module by `getLogger()`. */
export interface ScopedLogger {
	readonly scope: string
	trace(...args: unknown[]): void
	debug(...args: unknown[]): void
	info(...args: unknown[]): void
	warn(...args: unknown[]): void
	error(...args: unknown[]): void
}

/** Concrete level names that appear in log records (no meta-levels). */
export type LogLevelName = "trace" | "debug" | "info" | "warn" | "error"

/** A log record forwarded from a Web Worker or AudioWorklet to the main thread. */
export interface WorkerLogRecord {
	level: LogLevelName
	args: unknown[]
}

// ---------------------------------------------------------------------------
// Level ordering
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<LogLevel, number> = {
	"*": 0,
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
	none: 5,
}

const METHOD_ORDER: Record<LogLevelName, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
}

function _isEnabled(configured: LogLevel, emitting: LogLevelName): boolean {
	return METHOD_ORDER[emitting] >= LEVEL_ORDER[configured]
}

// ---------------------------------------------------------------------------
// Global logger state
// ---------------------------------------------------------------------------

let _globalLogger: Logger = createConsoleLogger("error")
let _missingLevelWarned = false
let _levelListeners: Array<(level: LogLevel) => void> = []

/** Install a custom logger. Pass `undefined` to restore the default (error level). */
export function setGlobalLogger(logger: Logger | undefined): void {
	_missingLevelWarned = false
	_globalLogger = logger ?? createConsoleLogger("error")
	_fireLevelListeners()
}

/** Returns the currently installed global logger. */
export function getGlobalLogger(): Logger {
	return _globalLogger
}

/**
 * Call this when your custom logger's `level()` return value changes at
 * runtime. Notifies internal infrastructure (e.g. workers) to re-sync.
 */
export function notifyLoggerLevelChanged(): void {
	_fireLevelListeners()
}

/** @internal */
export function onLoggerLevelChange(cb: (level: LogLevel) => void): () => void {
	_levelListeners.push(cb)
	return () => {
		_levelListeners = _levelListeners.filter((l) => l !== cb)
	}
}

function _fireLevelListeners(): void {
	const level = _resolveLevel()
	for (const cb of _levelListeners) cb(level)
}

function _resolveLevel(): LogLevel {
	const logger = _globalLogger
	if (typeof logger.level !== "function") {
		if (!_missingLevelWarned) {
			_missingLevelWarned = true
			console.warn('[MoQJS] custom logger missing level(); defaulting to "error"')
		}
		return "error"
	}
	return logger.level()
}

// ---------------------------------------------------------------------------
// Built-in console logger factory
// ---------------------------------------------------------------------------

/**
 * Creates a Logger backed by the browser/Node console.
 * @example
 *   setGlobalLogger(createConsoleLogger("debug"))
 *   setGlobalLogger(createConsoleLogger("none")) // silence all
 */
export function createConsoleLogger(level: LogLevel = "error"): Logger {
	return {
		level: () => level,
		trace: (...args: unknown[]) => {
			console.debug(...args)
		},
		debug: (...args: unknown[]) => {
			console.debug(...args)
		},
		info: (...args: unknown[]) => {
			console.info(...args)
		},
		warn: (...args: unknown[]) => {
			console.warn(...args)
		},
		error: (...args: unknown[]) => {
			console.error(...args)
		},
	}
}

// ---------------------------------------------------------------------------
// Core dispatcher — the only place that touches _globalLogger per emit
// ---------------------------------------------------------------------------

function _dispatch(level: LogLevelName, scope: string, args: unknown[]): void {
	const logger = _globalLogger
	if (!_isEnabled(_resolveLevel(), level)) return
	const method = logger[level]
	if (typeof method === "function") {
		method.call(logger, "[MoQJS]", `[${scope}]`, ...args)
	}
}

// ---------------------------------------------------------------------------
// Scope derivation — called once per module at import time
// ---------------------------------------------------------------------------

/**
 * Derives a scope string from a file URL or path.
 * "file:///…/lib/transport/connection.ts" → "transport/connection"
 * "/abs/path/lib/playback/index.ts"       → "playback"
 * Strips "index" suffix so directory modules look clean.
 */
function _scopeFromUrl(url: string): string {
	const path = url
		.replace(/^file:\/\//, "")
		.split("?")[0]
		.split("#")[0]

	const libIdx = path.lastIndexOf("/lib/")
	const relative = libIdx >= 0 ? path.slice(libIdx + 5) : path

	const noExt = relative.replace(/\.[tj]s$/, "")
	const noIndex = noExt.replace(/\/index$/, "")

	return noIndex || relative
}

/**
 * Reads the call stack to find the URL of the caller's module.
 * Skips frames belonging to this file.
 */
function _callerUrl(): string {
	const stack = new Error().stack ?? ""
	const lines = stack.split("\n")
	for (const line of lines) {
		const match = line.match(/\(?([^\s()]+\.[tj]s)[^)]*\)?$/)
		if (!match) continue
		const url = match[1]
		if (url.includes("common/logger")) continue
		return url
	}
	return ""
}

// ---------------------------------------------------------------------------
// getLogger — the only public API modules need to call
// ---------------------------------------------------------------------------

/**
 * Returns a `ScopedLogger` for the calling module. Call once at module level:
 *
 *   const log = getLogger()
 *
 * Scope is derived automatically from the caller's file path.
 */
export function getLogger(explicitScope?: string): ScopedLogger {
	const scope = explicitScope || _scopeFromUrl(_callerUrl()) || "main"

	return Object.freeze({
		scope,
		trace: (...args: unknown[]) => _dispatch("trace", scope, args),
		debug: (...args: unknown[]) => _dispatch("debug", scope, args),
		info: (...args: unknown[]) => _dispatch("info", scope, args),
		warn: (...args: unknown[]) => _dispatch("warn", scope, args),
		error: (...args: unknown[]) => _dispatch("error", scope, args),
	})
}

// ---------------------------------------------------------------------------
// Worker-side logger
// ---------------------------------------------------------------------------

let _workerLogLevel: LogLevel = "error"

/** Called by the worker's message handler when a logLevel message arrives. */
export function setWorkerLogLevel(level: LogLevel): void {
	_workerLogLevel = level
}

/**
 * Returns a ScopedLogger for use inside a Web Worker. Scope is derived from
 * the caller's file path automatically. Log records are forwarded to the main
 * thread via `postMessage`.
 *
 *   const log = getWorkerLogger()
 */
export function getWorkerLogger(explicitScope?: string): ScopedLogger {
	// Workers are bundled via rollup-plugin-web-worker-loader and run from blob:
	// URLs, so the stack-trace based auto-derive cannot recover a source path.
	// Fall back to "worker" when neither explicit nor derived scope is available.
	const scope = explicitScope || _scopeFromUrl(_callerUrl()) || "worker"

	function _workerDispatch(level: LogLevelName, args: unknown[]): void {
		if (!_isEnabled(_workerLogLevel, level)) return
		const record: WorkerLogRecord = { level, args: ["[MoQJS]", `[${scope}]`, ...args] }
		;(self as unknown as { postMessage(msg: unknown): void }).postMessage({ log: record })
	}

	return Object.freeze({
		scope,
		trace: (...args: unknown[]) => _workerDispatch("trace", args),
		debug: (...args: unknown[]) => _workerDispatch("debug", args),
		info: (...args: unknown[]) => _workerDispatch("info", args),
		warn: (...args: unknown[]) => _workerDispatch("warn", args),
		error: (...args: unknown[]) => _workerDispatch("error", args),
	})
}

// ---------------------------------------------------------------------------
// Worklet-side logger
// ---------------------------------------------------------------------------

let _workletLogLevel: LogLevel = "error"

/** Called by the worklet's message handler when a logLevel message arrives. */
export function setWorkletLogLevel(level: LogLevel): void {
	_workletLogLevel = level
}

/**
 * Returns a ScopedLogger for use inside an AudioWorklet processor. Scope is
 * derived automatically. Log records are forwarded through the worklet port.
 *
 *   const log = getWorkletLogger(this.port)
 */
export function getWorkletLogger(port: MessagePort, explicitScope?: string): ScopedLogger {
	// AudioWorklet modules run from blob: URLs too, so the auto-derive falls back
	// to "worklet" when neither explicit nor derived scope is available.
	const scope = explicitScope || _scopeFromUrl(_callerUrl()) || "worklet"

	function _workletDispatch(level: LogLevelName, args: unknown[]): void {
		if (!_isEnabled(_workletLogLevel, level)) return
		const record: WorkerLogRecord = { level, args: ["[MoQJS]", `[${scope}]`, ...args] }
		port.postMessage({ log: record })
	}

	return Object.freeze({
		scope,
		trace: (...args: unknown[]) => _workletDispatch("trace", args),
		debug: (...args: unknown[]) => _workletDispatch("debug", args),
		info: (...args: unknown[]) => _workletDispatch("info", args),
		warn: (...args: unknown[]) => _workletDispatch("warn", args),
		error: (...args: unknown[]) => _workletDispatch("error", args),
	})
}

// ---------------------------------------------------------------------------
// Main-thread receivers
// ---------------------------------------------------------------------------

/**
 * Listens for `{ log: WorkerLogRecord }` messages from a Worker and routes
 * them into the global logger. Returns a dispose function.
 * @internal
 */
export function installWorkerLogReceiver(worker: Worker): () => void {
	const handler = (e: MessageEvent) => {
		const msg = e.data as { log?: WorkerLogRecord }
		if (msg?.log) _dispatchRecord(msg.log)
	}
	worker.addEventListener("message", handler)
	return () => worker.removeEventListener("message", handler)
}

/**
 * Listens for `{ log: WorkerLogRecord }` messages from an AudioWorklet port
 * and routes them into the global logger. Returns a dispose function.
 * @internal
 */
export function installWorkletLogReceiver(port: MessagePort): () => void {
	const handler = (e: MessageEvent) => {
		const msg = e.data as { log?: WorkerLogRecord }
		if (msg?.log) _dispatchRecord(msg.log)
	}
	port.addEventListener("message", handler)
	return () => port.removeEventListener("message", handler)
}

function _dispatchRecord({ level, args }: WorkerLogRecord): void {
	const logger = _globalLogger
	if (!_isEnabled(_resolveLevel(), level)) return
	const method = logger[level]
	if (typeof method === "function") method.call(logger, ...args)
}
