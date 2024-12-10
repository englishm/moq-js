import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";
import crossOriginIsolation from "vite-plugin-cross-origin-isolation";

export default defineConfig({
	root: "./public",
	build: {
		outDir: "../dist",
	},
	server: {
		port: 3000,
		// HTTPS is required for SharedArrayBuffer
		https: true,
	},
	plugins: [
		// Generates a self-signed certificate using mkcert
		mkcert(),
		// Required for SharedArrayBuffer
		crossOriginIsolation(),
	],
	resolve: {
		alias: {
			"@": "/src",
		},
	},
});
