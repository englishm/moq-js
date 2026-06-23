export const VOLUME_CONTROL = `
	<div class="flex items-center gap-2">
		<button id="volume" aria-label="Unmute" class="flex h-4 w-0 items-center justify-center rounded bg-transparent p-4 text-white hover:bg-black-80 focus:bg-black-80 focus:outline-none">
			🔇
		</button>
		<input
			id="volume-range"
			type="range"
			min="0"
			max="1"
			step="0.1"
			class="h-1 w-24 cursor-pointer"
		</input>
	</div>
`
