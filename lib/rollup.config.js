/* eslint-disable @typescript-eslint/no-var-requires */
"use strict"
const resolve = require("@rollup/plugin-node-resolve")
const commonjs = require("@rollup/plugin-commonjs")
const typescript = require("@rollup/plugin-typescript")
const workerLoader = require("rollup-plugin-web-worker-loader")
const babel = require("@rollup/plugin-babel")
const terser = require("@rollup/plugin-terser")
const sourceMaps = require("rollup-plugin-sourcemaps")
const css = require("rollup-plugin-import-css")
const pkg = require("./package.json")

const basePlugins = [
	resolve(),
	commonjs({
		include: [/node_modules/, /src/],
		transformMixedEsModules: true,
	}),
	workerLoader({ preserveSource: true }),
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
	{
		input: pkg["wc-player"],
		output: [
			{
				file: pkg.iife,
				format: "iife",
				name: "MoqPlayer",
				sourcemap: true,
			},
			{
				file: pkg.exports["."].import,
				format: "esm",
				sourcemap: true,
			},
		],
		plugins: [...basePlugins, css()],
	},
	{
		input: pkg["simple-player"],
		output: [
			{
				file: pkg["iife-simple"],
				format: "iife",
				name: "MoqSimplePlayer",
				sourcemap: true,
			},
			{
				file: pkg.exports["./simple-player"].import,
				format: "esm",
				sourcemap: true,
			},
		],
		plugins: basePlugins,
	},
]
