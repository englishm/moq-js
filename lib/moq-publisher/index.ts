import STYLE_SHEET from "./publisher-moq.css"
import { PublisherApi, PublisherOptions } from "../publish"

export class PublisherMoq extends HTMLElement {
	private shadow: ShadowRoot
	private cameraSelect!: HTMLSelectElement
	private microphoneSelect!: HTMLSelectElement
	private previewVideo!: HTMLVideoElement
	private connectButton!: HTMLButtonElement
	private playbackUrlTextarea!: HTMLTextAreaElement
	private mediaStream: MediaStream | null = null

	private publisher?: PublisherApi
	private isPublishing = false
	private namespace = ""

	constructor() {
		super()
		this.shadow = this.attachShadow({ mode: "open" })

		// CSS
		const style = document.createElement("style")
		style.textContent = STYLE_SHEET
		this.shadow.appendChild(style)

		const container = document.createElement("div")
		container.classList.add("publisher-container")

		this.cameraSelect = document.createElement("select")
		this.microphoneSelect = document.createElement("select")
		this.previewVideo = document.createElement("video")
		this.connectButton = document.createElement("button")
		this.playbackUrlTextarea = document.createElement("textarea")

		this.previewVideo.autoplay = true
		this.previewVideo.playsInline = true
		this.previewVideo.muted = true
		this.connectButton.textContent = "Connect"

		this.playbackUrlTextarea.readOnly = true
		this.playbackUrlTextarea.rows = 3
		this.playbackUrlTextarea.style.display = "none"
		this.playbackUrlTextarea.style.width = "100%"
		this.playbackUrlTextarea.style.marginTop = "1rem"

		container.append(
			this.cameraSelect,
			this.microphoneSelect,
			this.previewVideo,
			this.connectButton,
			this.playbackUrlTextarea,
		)
		this.shadow.appendChild(container)

		// Bindings
		this.handleDeviceChange = this.handleDeviceChange.bind(this)
		this.handleClick = this.handleClick.bind(this)

		// Listeners
		navigator.mediaDevices.addEventListener("devicechange", this.handleDeviceChange)
		this.cameraSelect.addEventListener("change", () => this.startPreview())
		this.microphoneSelect.addEventListener("change", () => this.startPreview())
		this.connectButton.addEventListener("click", this.handleClick)
	}

	connectedCallback() {
		this.populateDeviceLists()
	}

	disconnectedCallback() {
		navigator.mediaDevices.removeEventListener("devicechange", this.handleDeviceChange)
	}

	private async handleDeviceChange() {
		await this.populateDeviceLists()
	}

	private async populateDeviceLists() {
		const devices = await navigator.mediaDevices.enumerateDevices()
		const vids = devices.filter((d) => d.kind === "videoinput")
		const mics = devices.filter((d) => d.kind === "audioinput")

		this.cameraSelect.innerHTML = ""
		this.microphoneSelect.innerHTML = ""

		vids.forEach((d) => {
			const o = document.createElement("option")
			o.value = d.deviceId
			o.textContent = d.label || `Camera ${this.cameraSelect.length + 1}`
			this.cameraSelect.append(o)
		})
		mics.forEach((d) => {
			const o = document.createElement("option")
			o.value = d.deviceId
			o.textContent = d.label || `Mic ${this.microphoneSelect.length + 1}`
			this.microphoneSelect.append(o)
		})

		await this.startPreview()
	}

	private async startPreview() {
		const vidId = this.cameraSelect.value
		const micId = this.microphoneSelect.value
		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach((t) => t.stop())
		}
		// Request even dimensions for H.264 compatibility (480p = 854x480)
		const videoConstraints = vidId
			? { deviceId: { exact: vidId }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
			: { height: { ideal: 480 }, frameRate: { ideal: 30 } }
		const audioConstraints = micId ? { deviceId: { exact: micId } } : true
		this.mediaStream = await navigator.mediaDevices.getUserMedia({
			video: videoConstraints,
			audio: audioConstraints,
		})

		this.previewVideo.srcObject = this.mediaStream
	}

	private async handleClick() {
		if (!this.isPublishing) {
			if (!this.mediaStream) {
				console.warn("No media stream available")
				return
			}

			this.namespace = this.getAttribute("namespace") ?? crypto.randomUUID()

			const audioTrack = this.mediaStream.getAudioTracks()[0]
			const settings = audioTrack.getSettings()

			const sampleRate = settings.sampleRate ?? (await new AudioContext()).sampleRate
			const numberOfChannels = settings.channelCount ?? 2

			// H.264 requires even dimensions - round down to nearest even number
			const makeEven = (n: number) => Math.floor(n / 2) * 2
			const width = makeEven(this.previewVideo.videoWidth)
			const height = makeEven(this.previewVideo.videoHeight)

			const videoConfig: VideoEncoderConfig = {
				codec: "avc1.42E01E",
				width,
				height,
				bitrate: 1000000,
				framerate: 30,
			}
			const audioConfig: AudioEncoderConfig = { codec: "opus", sampleRate, numberOfChannels, bitrate: 64000 }

			const opts: PublisherOptions = {
				url: this.getAttribute("src")!,
				fingerprintUrl: this.getAttribute("fingerprint") ?? undefined,
				namespace: [this.namespace],
				media: this.mediaStream,
				video: videoConfig,
				audio: audioConfig,
			}

			console.log("Publisher Options", opts)

			this.publisher = new PublisherApi(opts)

			try {
				await this.publisher.publish()
				this.isPublishing = true
				this.connectButton.textContent = "Stop"
				this.cameraSelect.disabled = true
				this.microphoneSelect.disabled = true

				const playbackBaseUrl = this.getAttribute("playbackbaseurl")
				if (playbackBaseUrl) {
					this.playbackUrlTextarea.value = `${playbackBaseUrl}${this.namespace}`
				} else {
					this.playbackUrlTextarea.value = this.namespace
				}
				this.playbackUrlTextarea.style.display = "block"
			} catch (err) {
				console.error("Publish failed:", err)
			}
		} else {
			try {
				await this.publisher!.stop()
			} catch (err) {
				console.error("Stop failed:", err)
			} finally {
				this.isPublishing = false
				this.connectButton.textContent = "Connect"
				this.cameraSelect.disabled = false
				this.microphoneSelect.disabled = false
				this.playbackUrlTextarea.style.display = "none"
			}
		}
	}
}

customElements.define("publisher-moq", PublisherMoq)
export default PublisherMoq
