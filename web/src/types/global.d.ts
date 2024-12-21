interface DocumentPictureInPicture {
	requestWindow: (options: { width: number; height: number }) => Promise<WindowWithPiP>
	window: Window | null
}

interface WindowWithPiP extends Window {
	document: Document
	close: () => void
	addEventListener: (type: string, listener: EventListener) => void
	removeEventListener: (type: string, listener: EventListener) => void
}

interface Window {
	documentPictureInPicture?: DocumentPictureInPicture
}

declare let documentPictureInPicture: DocumentPictureInPicture
