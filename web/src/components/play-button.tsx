import { state } from "src/store/state"

export const PlayButton = () => {
	return (
		<button
			class="
				absolute bottom-0 left-4 flex h-8 w-12 items-center justify-center
				rounded bg-black/70 px-2 py-2 shadow-lg
				hover:bg-black/80 focus:bg-black/100 focus:outline-none
			"
			onClick={state.handlePlayPause}
			aria-label={state.isPlaying ? "Pause" : "Play"}
		>
			{state.isPlaying ? (
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" class="h-6 w-6">
					<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
				</svg>
			) : (
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" class="h-4 w-4">
					<path d="M3 22v-20l18 10-18 10z" />
				</svg>
			)}
		</button>
	)
}
