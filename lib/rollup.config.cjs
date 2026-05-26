/* eslint-disable @typescript-eslint/no-var-requires */
"use strict"
const resolve = require("@rollup/plugin-node-resolve")
const commonjs = require("@rollup/plugin-commonjs")
const typescript = require("@rollup/plugin-typescript")
const babel = require("@rollup/plugin-babel")
const dts = require("rollup-plugin-dts")
const sourceMaps = require("rollup-plugin-sourcemaps")

// No worker/audio-worklet/CSS plugins — transport is pure MoQ protocol code.
const basePlugins = [
	resolve(),
	commonjs({
		include: [/node_modules/],
		transformMixedEsModules: true,
	}),
	typescript({
		typescript: require("typescript"),
	}),
	sourceMaps(),
	babel({
		babelHelpers: "bundled",
		presets: ["@babel/preset-env", "@babel/preset-typescript"],
		exclude: "./node_modules/*",
	}),
]

module.exports = [
	// ESM + CJS bundles
	{
		input: "transport/index.ts",
		output: [
			{
				file: "dist/transport.esm.js",
				format: "esm",
				sourcemap: true,
			},
			{
				file: "dist/transport.cjs.js",
				format: "cjs",
				sourcemap: true,
			},
		],
		plugins: basePlugins,
	},
	// Type declarations
	{
		input: "transport/index.ts",
		output: {
			file: "dist/types/transport.d.ts",
			format: "es",
		},
		plugins: [dts.dts()],
	},
]
