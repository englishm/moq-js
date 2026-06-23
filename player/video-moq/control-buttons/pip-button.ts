import { ENTER_PIP_SVG } from "../icons"

export const PICTURE_IN_PICTURE_BUTTON = window.documentPictureInPicture
	? `
		<button id="picture-in-picture" aria-label="Enter picture-in-picture" class="relative flex h-4 w-0 items-center justify-center rounded bg-transparent p-4 text-white hover:bg-black-80 focus:bg-black-80 focus:outline-none">
			${ENTER_PIP_SVG}
		</button>
	`
	: ""
