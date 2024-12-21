import { createEffect, createSignal } from "solid-js"
import { state } from "src/store/state"

type TrackSelectProps = {
	trackNum: number
}

export const TrackSelect = (props: TrackSelectProps) => {
	const [options, setOptions] = createSignal<string[]>([])
	const [selectedOption, setSelectedOption] = createSignal<string | undefined>()
	const [showTracks, setShowTracks] = createSignal(false)

	const handleTrackChange = (track: string) => {
		setSelectedOption(track)
		state.switchTrack(track)
		setShowTracks(false)
	}

	function updateURLWithTracknumber(trackIndex: number) {
		const url = new URL(window.location.href)
		url.searchParams.set("track", trackIndex.toString())
		window.history.replaceState({}, "", decodeURIComponent(url.toString()))
	}

	createEffect(() => {
		const videotracks = state.getVideoTracks()
		if (!videotracks?.length) return

		setOptions(videotracks)

		const trackNumber = props.trackNum

		if (trackNumber >= 0 && trackNumber < videotracks.length) {
			const selectedTrack = videotracks[trackNumber]
			setSelectedOption(selectedTrack)
			updateURLWithTracknumber(trackNumber)
		}
	})
	return (
		<>
			<button
				class="
					flex h-4 w-0 items-center justify-center rounded bg-transparent
					p-4 text-white hover:bg-black/100
					focus:bg-black/80 focus:outline-none
				"
				aria-label="Select Track"
				onClick={() => setShowTracks((prev) => !prev)}
			>
				⚙️
			</button>
			{showTracks() && (
				<ul class="absolute bottom-6 right-0 mt-2 w-40 rounded bg-black/80 p-0 text-white shadow-lg">
					{options()?.length ? (
						options().map((option) => (
							<li
								role="menuitem"
								tabIndex={0}
								class={`flex w-full cursor-pointer items-center justify-between px-4 py-2 hover:bg-black/100 ${
									selectedOption() === option ? "bg-blue-500 text-white" : ""
								}`}
								onClick={() => handleTrackChange(option)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										handleTrackChange(option)
									}
								}}
							>
								<span>{option}</span>
							</li>
						))
					) : (
						<li class="cursor-not-allowed px-4 py-2 text-gray-500">No options available</li>
					)}
				</ul>
			)}
		</>
	)
}
