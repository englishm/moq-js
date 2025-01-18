/* eslint-disable jsx-a11y/media-has-caption */
import Player from "moq-player/simple-player"

import Fail from "./fail"
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { VolumeControl } from "./volume"
import { PlayButton } from "./play-button"
import { TrackSelect } from "./track-select"
import { PictureInPictureButton } from "./picture-in-picture"
import { state } from "src/store/state"
import { FullscreenButton } from "./fullscreen"

export default function Watch(props: { name: string }) {
	// Use query params to allow overriding environment variables.
	const urlSearchParams = new URLSearchParams(window.location.search)
	const params = Object.fromEntries(urlSearchParams.entries())
	const server = params.server ?? import.meta.env.PUBLIC_RELAY_HOST
	const tracknum: number = Number(params.track ?? 0)
	let canvas!: HTMLCanvasElement

	const [error, setError] = createSignal<Error | undefined>()
	const [showCatalog, setShowCatalog] = createSignal(false)
	const [hovered, setHovered] = createSignal(false)
	const [showControls, setShowControls] = createSignal(true)

	createEffect(() => {
		const namespace = props.name
		const url = `https://${server}`

		// Special case localhost to fetch the TLS fingerprint from the server.
		// TODO remove this when WebTransport correctly supports self-signed certificates
		const fingerprint = server.startsWith("localhost") ? `https://${server}/fingerprint` : undefined

		Player.create({ url, fingerprint, canvas, namespace }, tracknum)
			.then((player) => state.setPlayer(player))
			.catch(setError)
	})

	// The JSON catalog for debugging.
	const catalog = createMemo(() => {
		const playerInstance = state.player
		if (!playerInstance) return

		const catalog = playerInstance.getCatalog()
		return JSON.stringify(catalog, null, 2)
	})

	createEffect(() => {
		const playerInstance = state.player
		if (!playerInstance) return

		onCleanup(() => playerInstance.close())
		playerInstance.closed().then(setError).catch(setError)
	})

	createEffect(() => {
		if (hovered()) {
			setShowControls(true)
		}

		const timeoutId = setTimeout(() => !state.pipActive && setShowControls(false), 3000)
		onCleanup(() => clearTimeout(timeoutId))
	})

	// NOTE: The canvas automatically has width/height set to the decoded video size.
	// TODO shrink it if needed via CSS
	return (
		<>
			<Fail error={error()} />
			<div class="relative aspect-video w-full" id="video">
				<canvas
					ref={canvas}
					onClick={state.handlePlayPause}
					class="h-full w-full rounded-lg object-contain"
					id="video-canvas"
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}
				/>
				{state.pipActive && (
					<div class="relative flex h-full w-full items-center justify-center bg-black text-white">
						Picture-in-Picture Mode
					</div>
				)}
				<div
					class={`mr-px-4 ml-px-4 ${
						showControls() ? "opacity-100" : "opacity-0"
					} absolute bottom-4 flex h-[40px] w-[100%] items-center gap-[4px] rounded transition-opacity duration-200 `}
				>
					<PlayButton />
					<div class="absolute bottom-0 right-4 flex h-[32px] w-fit items-center justify-evenly gap-[4px] rounded bg-black/70 p-2">
						<VolumeControl />
						<TrackSelect trackNum={tracknum} />
						{"documentPictureInPicture" in window && <PictureInPictureButton />}
						<FullscreenButton />
					</div>
				</div>
			</div>
			<h3>Debug</h3>
			<Show when={catalog()}>
				<div class="mt-2 flex">
					<button onClick={() => setShowCatalog((prev) => !prev)}>
						{showCatalog() ? "Hide Catalog" : "Show Catalog"}
					</button>
				</div>
				<Show when={showCatalog()}>
					<pre>{catalog()}</pre>
				</Show>
			</Show>
		</>
	)
}
