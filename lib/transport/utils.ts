export function debug(...msg: any[]) {
	console.log("itzmanish:", ...msg)
}

export async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
