import { Player } from "@kixelated/moq/playback";

/**
 * This stylesheet is self contained within the shadow root
 * If we attach the element as open in the constructor, it should inherit
 * the document's style.
 */
import STYLE_SHEET from "./video-moq.css?inline";

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" class="h-4 w-4">
					<path d="M3 22v-20l18 10-18 10z" />
				</svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" class="h-6 w-6">
					<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
				</svg>`;

class VideoMoq extends HTMLElement {
	private shadow: ShadowRoot;

	// Event Handlers
	private playPauseEventHandler: (event: Event) => void;
	private onMouseEnterHandler: (event: Event) => void;
	private onMouseLeaveHandler: (event: Event) => void;
	private toggleMuteEventHandler: (event: Event) => void;
	private toggleShowTrackEventHandler: (event: Event) => void;

	// HTML Elements
	private base: HTMLDivElement;
	private canvas: HTMLCanvasElement;
	private playButton: HTMLButtonElement;
	private controls: HTMLElement;
	private volumeButton: HTMLButtonElement;
	private trackButton: HTMLButtonElement;
	private trackList: HTMLUListElement;

	// State
	private player: Player | null = null;
	public isMuted: boolean = true; // TODO: have the player state maintain all values
	public selectedTrack: string = "0";

	constructor() {
		super();

		// Attach Shadow DOM
		this.shadow = this.attachShadow({ mode: "open" });
		this.shadow.innerHTML = `
			<style>${STYLE_SHEET}</style>
			<div id="base" class="relative">
				<canvas id="canvas" class="h-full w-full rounded-lg">
				</canvas>
					<div id="controls" class="absolute mr-4 ml-4 opacity-100 bottom-4 flex h-[40px] w-full items-center gap-[4px] rounded transition-opacity duration-200" >
						<button id="play" class="absolute bottom-0 left-4 flex h-8 w-12 items-center justify-center rounded bg-black-70 px-2 py-2 shadow-lg hover:bg-black-80 focus:bg-black-100 focus:outline-none">
							${PLAY_SVG}
						</button>
						<div class="absolute bottom-0 right-4 flex h-[32px] w-fit items-center justify-evenly gap-[4px] rounded bg-black-70 p-2">
							<button id="volume" aria-label="Unmute" class="flex h-4 w-0 items-center justify-center rounded bg-transparent p-4 text-white hover:bg-black-80 focus:bg-black-80 focus:outline-none">
								🔇
							</button>
							<button id="track" aria-label="Select Track" class="flex h-4 w-0 items-center justify-center rounded bg-transparent p-4 text-white hover:bg-black-100 focus:bg-black-80 focus:outline-none">
								⚙️
							</button>
							<ul id="tracklist" class="absolute bottom-6 right-0 mt-2 w-40 rounded bg-black-80 p-0 text-white shadow-lg opacity-0">
							</ul>
						</div>
					</div>
			</div>
		`;

		this.base = this.shadow.querySelector("#base")!;
		this.controls = this.shadow.querySelector("#controls")!;
		this.canvas = this.shadow.querySelector("canvas#canvas")!;
		this.playButton = this.shadow.querySelector("#play")!;
		this.volumeButton = this.shadow.querySelector("#volume")!;
		this.trackButton = this.shadow.querySelector("#track")!;
		this.trackList = this.shadow.querySelector("ul#tracklist")!;

		// Bind event listeners to add and remove from lists.
		this.playPauseEventHandler = this.togglePlayPause.bind(this);
		this.toggleMuteEventHandler = this.toggleMute.bind(this);

		this.onMouseEnterHandler = this.toggleShowControls.bind(this, true);
		this.onMouseLeaveHandler = this.toggleShowControls.bind(this, false);
		this.toggleShowTrackEventHandler = this.toggleShowTracks.bind(this);
	}

	/**
	 * Called when the element is first added to the DOM
	 *
	 * Here we handle attributes.
	 * Right now we support: src fingerprint controls namespace
	 * TODO: To be supported: width height autoplay muted poster
	 * @returns
	 */
	connectedCallback() {
		const src = this.getAttribute("src");
		const namespace = this.getAttribute("namespace");
		const fingerprint = this.getAttribute("fingerprint");

		if (!src) {
			this.error("No 'src' attribute provided for <video-moq>");
		}
		if (src === null || namespace === null || fingerprint === null) return;

		// TODO: make tracknum a parameter somehow
		const trackNum = 0;
		Player.create({ url: src, fingerprint, canvas: this.canvas, namespace }, trackNum)
			.then((player) => this.setPlayer(player))
			.catch(this.error);

		this.canvas.addEventListener("click", this.playPauseEventHandler);

		const controls = this.getAttribute("controls");
		if (controls !== null) {
			this.playButton.addEventListener("click", this.playPauseEventHandler);

			this.volumeButton.addEventListener("click", this.toggleMuteEventHandler);

			this.canvas.addEventListener("mouseenter", this.onMouseEnterHandler);
			this.canvas.addEventListener("mouseleave", this.onMouseLeaveHandler);
			this.controls.addEventListener("mouseenter", this.onMouseEnterHandler);
			this.controls.addEventListener("mouseleave", this.onMouseLeaveHandler);

			this.trackButton.addEventListener("click", this.toggleShowTrackEventHandler);
		}

		const width = this.parseDimension(this.getAttribute("width"), -1);
		const height = this.parseDimension(this.getAttribute("height"), -1);

		if (width != -1) {
			this.base.style.width = width.toString() + "px";
		}
		if (height != -1) {
			this.base.style.height = height.toString() + "px";
		}
		const aspectRatio = this.getAttribute("aspect-ratio"); // TODO: We could also get this from the player
		if (aspectRatio !== null) {
			this.base.style.aspectRatio = aspectRatio.toString();
		}
	}

	/**
	 * Called when the element is removed from the DOM
	 * */
	disconnectedCallback() {
		this.canvas.removeEventListener("click", this.playPauseEventHandler);
		this.playButton.removeEventListener("click", this.playPauseEventHandler);

		this.volumeButton.removeEventListener("click", this.toggleMuteEventHandler);

		this.canvas.removeEventListener("mouseenter", this.onMouseEnterHandler);
		this.canvas.removeEventListener("mouseleave", this.onMouseLeaveHandler);
		this.controls.removeEventListener("mouseenter", this.onMouseEnterHandler);
		this.controls.removeEventListener("mouseleave", this.onMouseLeaveHandler);

		this.trackButton.removeEventListener("click", this.toggleShowTrackEventHandler);

		this.player?.close();
	}

	// TODO: Move attribute processing to a function and add this.
	// Called when one of the element's watched attributes change. For an attribute to be watched, you must add it to the component class's static observedAttributes property.
	// attributeChangedCallback() {}

	/**
	 * Sets the player attribute and configures info related to a successful connection
	 * */
	private setPlayer(player: Player) {
		this.player = player;

		if (!this.player.isPaused()) {
			this.playButton.innerHTML = PAUSE_SVG;
			this.playButton.ariaLabel = "Pause";

			// TODO: This is a hacky !isMuted()
			if (this.player.getAudioTracks().length > 0) {
				this.volumeButton.ariaLabel = "Mute";
				this.volumeButton.innerText = "🔊";
				this.isMuted = true;
			} else {
				this.isMuted = false;
			}
		}

		const options = this.player.getVideoTracks();
		this.trackList.innerHTML = options
			.map((option) => {
				return `<li role="menuitem" tabIndex={0} data-name=${option}
				class="flex w-full  items-center justify-between px-4 py-2 hover:bg-black-100"
				 ${this.selectedTrack === option ? "bg-blue-500 text-white" : ""}"
				 >
				 <span>${option}</span>
				 </li>`;
			})
			.join("");
		this.trackList.querySelectorAll("li").forEach((element) => {
			element.addEventListener("click", () => this.switchTrack(element.dataset.name || null));
			element.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					this.switchTrack(element.dataset.name || null);
				}
			});
		});
	}

	private toggleShowControls(show: boolean) {
		if (show) {
			this.controls.classList.add("opacity-100");
			this.controls.classList.remove("opacity-0");
		} else {
			this.controls.classList.add("opacity-0");
			this.controls.classList.remove("opacity-100");
		}
	}

	// Play / Pause
	private togglePlayPause() {
		this.playButton.disabled = true;
		this.player
			?.play()
			.then(() => {
				if (this.player?.isPaused()) {
					this.playButton.innerHTML = PLAY_SVG;
					this.playButton.ariaLabel = "Play";
				} else {
					this.playButton.innerHTML = PAUSE_SVG;
					this.playButton.ariaLabel = "Pause";
				}
			})
			.finally(() => (this.playButton.disabled = false));
	}

	private toggleMute() {
		this.volumeButton.disabled = true;
		this.player
			?.mute(this.isMuted)
			.then(() => {
				// This is unintuitive but you should read it as if it wasMuted
				if (this.isMuted) {
					this.volumeButton.ariaLabel = "Mute";
					this.volumeButton.innerText = "🔇";
					this.isMuted = false;
				} else {
					this.volumeButton.ariaLabel = "Mute";
					this.volumeButton.innerText = "🔊";
					this.isMuted = true;
				}
			})
			.finally(() => {
				this.volumeButton.disabled = false;
			});
	}

	private toggleShowTracks() {
		this.trackList.classList.toggle("opacity-0");
	}

	private switchTrack(name: string | null) {
		if (name === null) {
			this.error("Could not recognize selected track name");
			return;
		}

		this.selectedTrack = name;
		this.player?.switchTrack(name);
	}

	private parseDimension(value: string | null, defaultValue: number): number {
		if (!value) {
			return defaultValue;
		}

		const parsed = parseInt(value, 10);

		// Check for NaN or negative values
		if (isNaN(parsed) || parsed <= 0) {
			console.warn(`Invalid value "${value}" for dimension, using default: ${defaultValue}px`);
			return defaultValue;
		}

		return parsed;
	}

	// TODO: (?) Handle Stream ended event. May not be necessary, it came w/ the example.
	// private onStreamEnded() {
	// 	this.playButton.disabled = false;
	// }

	/* Right now we are just printing errors, but we could
	display them on the canvas if we want */
	private error(msg: any) {
		console.error(msg);
	}
}

// Register the custom element
customElements.define("video-moq", VideoMoq);
export default VideoMoq;
