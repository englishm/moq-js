"use strict"
const resolve = require("@rollup/plugin-node-resolve")
const commonjs = require("@rollup/plugin-commonjs")
const typescript = require("@rollup/plugin-typescript")
const sourceMaps = require("rollup-plugin-sourcemaps")
const dts = require("rollup-plugin-dts")

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
]

module.exports = [
	{
		input: "src/index.ts",
		output: [
			{
				file: "dist/media.esm.js",
				format: "esm",
				sourcemap: true,
			},
			{
				file: "dist/media.cjs.js",
				format: "cjs",
				sourcemap: true,
			},
		],
		plugins: basePlugins,
	},
	{
		input: "src/index.ts",
		output: {
			file: "dist/types/index.d.ts",
			format: "es",
		},
		plugins: [dts.dts()],
	},
]
