"use strict"
const resolve = require("@rollup/plugin-node-resolve")
const typescript = require("@rollup/plugin-typescript")
const dts = require("rollup-plugin-dts")

const basePlugins = [
	resolve(),
	typescript({
		typescript: require("typescript"),
	}),
]

module.exports = [
	{
		input: "src/index.ts",
		output: [
			{
				file: "dist/catalog.esm.js",
				format: "esm",
				sourcemap: true,
			},
			{
				file: "dist/catalog.cjs.js",
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
