import { Parameters } from "./base_data"
import { MaxRequestId } from "./control/max_request_id"
import { RequestsBlocked } from "./control/requests_blocked"
import { SetupParameters } from "./control/setup_parameters"
import { getLogger } from "../common/logger"

const log = getLogger()

export type RequestIdAllocation =
	| { type: "allocated"; id: bigint }
	| { type: "blocked"; max_request_id: bigint; should_send_requests_blocked: boolean }

export class RequestId {
	#next: bigint
	#peerMax: bigint
	#blockedSentFor?: bigint
	#nextExpected: bigint
	#ourMax: bigint

	constructor(localFirstId: bigint, peerMax: bigint, ourMax: bigint, peerFirstId: bigint) {
		this.#next = localFirstId
		this.#peerMax = peerMax
		this.#ourMax = ourMax
		this.#nextExpected = peerFirstId
	}

	static client(peerMax: bigint, ourMax: bigint) {
		return new RequestId(0n, peerMax, ourMax, 1n)
	}

	static server(peerMax: bigint, ourMax: bigint) {
		return new RequestId(1n, peerMax, ourMax, 0n)
	}

	allocate(): RequestIdAllocation {
		if (this.#next >= this.#peerMax) {
			const should_send_requests_blocked = this.#blockedSentFor !== this.#peerMax
			this.#blockedSentFor = this.#peerMax
			return { type: "blocked", max_request_id: this.#peerMax, should_send_requests_blocked }
		}

		const id = this.#next
		this.#next += 2n
		this.#blockedSentFor = undefined
		return { type: "allocated", id }
	}

	applyMaxRequestId(msg: MaxRequestId) {
		if (msg.max_request_id <= this.#peerMax) {
			throw new Error("MAX_REQUEST_ID must be strictly increasing")
		}

		this.#peerMax = msg.max_request_id
		this.#blockedSentFor = undefined
	}

	validateIncoming(id: bigint) {
		if (id !== this.#nextExpected) {
			throw new Error("invalid request id")
		}

		if (id >= this.#ourMax) {
			throw new Error("too many requests")
		}

		this.#nextExpected += 2n
	}

	handleRequestsBlocked(msg: RequestsBlocked) {
		log.warn("requests blocked", {
			maxRequestId: msg.maximum_request_id,
			advertisedMaxRequestId: this.#ourMax,
			limitHit: msg.maximum_request_id === this.#ourMax,
		})
	}
}

export function maxRequestIdFromParams(params: Parameters): bigint {
	const value = params.get(BigInt(SetupParameters.MaxRequestId))
	return typeof value === "bigint" ? value : 0n
}
