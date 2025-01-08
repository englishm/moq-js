import { createSignal } from "solid-js"
import { state } from "src/store/state"

export const VolumeControl = () => {
	const [isMuted, setIsMuted] = createSignal(false)
	const [currentVolume, setCurrentVolume] = createSignal(1)
	const [previousVolume, setPreviousVolume] = createSignal(1)

	const toggleMute = () => {
		const newIsMuted = !isMuted()
		setIsMuted(newIsMuted)
		state.mute(newIsMuted)

		if (newIsMuted) {
			setPreviousVolume(currentVolume())
			state.setVolume(0)
			setCurrentVolume(0)
		} else {
			const restoredVolume = previousVolume()
			setCurrentVolume(restoredVolume)
			state.setVolume(restoredVolume)
		}
	}

	const handleVolumeChange = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
		const volume = parseFloat(e.currentTarget.value)
		if (volume == 0) {
			setIsMuted(true)
		} else {
			setIsMuted(false)
		}
		setCurrentVolume(volume)
		state.setVolume(volume)
	}

	return (
		<div class="flex items-center gap-2">
			<button
				class="
					flex h-4 w-0 items-center justify-center rounded bg-transparent
					p-4 text-white hover:bg-black/80
					focus:bg-black/80 focus:outline-none
				"
				onClick={toggleMute}
				aria-label={isMuted() ? "Unmute" : "Mute"}
			>
				{isMuted() ? "🔇" : "🔊"}
			</button>

			<input
				type="range"
				min="0"
				max="1"
				step="0.1"
				style={{ padding: "0" }}
				value={currentVolume()}
				onInput={handleVolumeChange}
				class="h-1 w-24 cursor-pointer"
			/>
		</div>
	)
}
