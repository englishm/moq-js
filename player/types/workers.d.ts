declare module "web-worker:*" {
	const WorkerFactory: new () => Worker
	export default WorkerFactory
}

declare module "audio-worklet:*" {
	const value: any
	export default value
}
