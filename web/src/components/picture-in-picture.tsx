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
				<svg xmlns="http://www.w3.org/2000/svg" class="absolute h-[24px]" viewBox="0 0 24 24">
					<g>
						<path
							fill="#fff"
							d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zm-9.5-6L9.457 9.043l2.25 2.25-1.414 1.414-2.25-2.25L6 12.5V7h5.5z"
						/>
					</g>
				</svg>
			) : (
				<svg xmlns="http://www.w3.org/2000/svg" class="absolute h-[24px]" viewBox="0 0 24 24">
					<g>
						<path
							fill="#fff"
							d="M21 3a1 1 0 0 1 1 1v7h-2V5H4v14h6v2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18zm0 10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h8zm-1 2h-6v4h6v-4zM6.707 6.293l2.25 2.25L11 6.5V12H5.5l2.043-2.043-2.25-2.25 1.414-1.414z"
						/>
					</g>
				</svg>
			)}
		</button>
	)
}
