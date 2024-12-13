import { createEffect, createSignal, onCleanup } from "solid-js"

export const FullscreenButton = () => {
	const [isFullscreen, setIsFullscreen] = createSignal(false)

	const toggleFullscreen = () => {
		const videoElement = document.getElementById("video")

		if (!isFullscreen()) {
			void videoElement?.requestFullscreen().catch(console.error)
			setIsFullscreen(true)
		} else {
			void document.exitFullscreen()
			setIsFullscreen(false)
		}
	}
	createEffect(() => {
		const handleFullscreenChange = () => {
			setIsFullscreen(!!document.fullscreenElement)
		}

		document.addEventListener("fullscreenchange", handleFullscreenChange)
		onCleanup(() => document.removeEventListener("fullscreenchange", handleFullscreenChange))
	})

	return (
		<button
			class="
				flex h-4 w-4 items-center justify-center rounded bg-transparent
				p-4 text-white hover:bg-black/80 focus:outline-none
				"
			onClick={toggleFullscreen}
			aria-label={isFullscreen() ? "Exit full screen" : "Full screen"}
		>
			{isFullscreen() ? "⇲" : "⛶"}
		</button>
	)
}
