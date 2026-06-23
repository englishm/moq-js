import fs from "fs"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const targetDir = path.join(root, "demo", "lib")

const sourceDirs = [
	path.join(root, "player", "dist"),
	path.join(root, "publisher", "dist"),
]

const shouldCopy = (name) => name.endsWith(".iife.js") || name.endsWith(".iife.js.map")

fs.mkdirSync(targetDir, { recursive: true })

// Collect all source files across both packages
const sourceFiles = new Set()
for (const sourceDir of sourceDirs) {
	if (!fs.existsSync(sourceDir)) continue
	for (const name of fs.readdirSync(sourceDir).filter(shouldCopy)) {
		sourceFiles.add(name)
	}
}

// Remove stale files in target that no longer exist in any source
for (const name of fs.readdirSync(targetDir)) {
	if (shouldCopy(name) && !sourceFiles.has(name)) {
		fs.rmSync(path.join(targetDir, name))
	}
}

// Copy from each source dir
let copied = 0
for (const sourceDir of sourceDirs) {
	if (!fs.existsSync(sourceDir)) continue
	for (const name of fs.readdirSync(sourceDir).filter(shouldCopy)) {
		fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name))
		copied++
	}
}

console.log(`Synced ${copied} demo bundle files to demo/lib`)
