import { getLogger } from "../common/logger"

const log = getLogger()

export function debug(...msg: unknown[]) {
	log.trace(...msg)
}

export async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
