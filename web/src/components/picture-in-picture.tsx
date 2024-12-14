import { onCleanup } from "solid-js"
import { pipState, setPipState } from "src/store/state"

export const PictureInPictureButton = () => {
	let videoCanvasElement: HTMLElement | null
	let pipWindow: WindowWithPiP | null

	const handleEnterPip = () => setPipState({ pipActive: true })
	const handleLeavePip = () => setPipState({ pipActive: false })

	const restoreVideoCanvas = () => {
		const playerContainer = document.getElementById("video")
		if (videoCanvasElement && playerContainer) {
			playerContainer.append(videoCanvasElement)
			console.log("Video element restored to original container.")
		} else {
			console.warn("Failed to restore video element! Check DOM structure.")
		}
	}

	async function togglePictureInPicture() {
		if (!("documentPictureInPicture" in window)) {
			console.warn("DocumentPictureInPicture API is not supported.")
			return
		}

		try {
			if (!documentPictureInPicture.window) {
				pipWindow = await documentPictureInPicture.requestWindow({
					width: 320,
					height: 180,
				})

				videoCanvasElement = document.getElementById("video-canvas")
				if (!videoCanvasElement) {
					console.warn("Video element not found.")
					return
				}

				if (pipWindow) {
					// Moves the video element to the PiP window
					pipWindow.document.body.append(videoCanvasElement)
					videoCanvasElement.style.width = "100%"
					videoCanvasElement.style.height = "100%"

					handleEnterPip()

					pipWindow.addEventListener("pagehide", () => {
						restoreVideoCanvas()
						handleLeavePip()
					})

					onCleanup(() => pipWindow?.removeEventListener("pagehide", restoreVideoCanvas))
				}
			} else {
				// Exits PiP mode using the player button
				restoreVideoCanvas()
				handleLeavePip()
				pipWindow?.close()
			}
		} catch (error) {
			console.error("Error toggling Picture-in-Picture:", error)
		}
	}

	return (
		<button
			class="
		  flex h-4 w-4 items-center justify-center rounded bg-transparent
		  p-4 text-white hover:bg-black/80 focus:outline-none
		"
			onClick={() => {
				togglePictureInPicture().catch((error) => console.error("Error handling PiP button click:", error))
			}}
			aria-label={pipState.pipActive ? "Exit picture-in-picture mode" : "Enter picture-in-picture mode"}
		>
			{pipState.pipActive ? (
				<span role="img" aria-hidden="true">
					📺
				</span>
			) : (
				<span role="img" aria-hidden="true">
					🔲
				</span>
			)}
		</button>
	)
}
