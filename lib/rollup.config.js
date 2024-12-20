"use strict"
const resolve = require("@rollup/plugin-node-resolve")
const commonjs = require("@rollup/plugin-commonjs")
const typescript = require("@rollup/plugin-typescript")
const workerLoader = require("rollup-plugin-web-worker-loader")
const babel = require("@rollup/plugin-babel")
const terser = require("@rollup/plugin-terser")
const sourceMaps = require("rollup-plugin-sourcemaps")
const pkg = require("./package.json")

const config = []

config.push({
	input: pkg.entry,
	output: {
		file: pkg.iife,
		format: "iife",
		name: "moqplayer",
		sourcemap: true,
	},
	plugins: [
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
		terser(),
	],
})

config.push({
	input: pkg.entry,
	output: {
		file: pkg.module,
		format: "esm",
		sourcemap: true,
	},
	external: [],
	plugins: [
		resolve(),
		commonjs(),
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
		terser(),
	],
})

module.exports = config
