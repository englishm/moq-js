import { createStore } from "solid-js/store"
import { Player } from "@kixelated/moq/playback"

export const [state, setState] = createStore({
	player: null as Player | null,
	isPlaying: false,
	setPlayer: (player: Player) => {
		setState({ player, isPlaying: !player.isPaused() })
	},
	handlePlayPause: () => {
		const playerInstance = state.player
		if (!playerInstance) return
		void playerInstance.play()
		if (playerInstance.isPaused()) {
			setState({ isPlaying: false })
		} else {
			setState({ isPlaying: true })
		}
	},
	switchTrack: (track: string) => {
		const playerInstance = state.player
		if (!playerInstance) return
		void playerInstance.switchTrack(track)
	},
	getVideoTracks: () => {
		const playerInstance = state.player
		return playerInstance?.getVideoTracks()
	},
	mute: (isMuted: boolean) => {
		const playerInstance = state.player
		if (!playerInstance) return
		void playerInstance.mute(isMuted)
	},
	setVolume: (newVolume: number) => {
		const playerInstance = state.player
		if (!playerInstance) return
		void playerInstance.setVolume(newVolume)
	},
	pipActive: false,
})
