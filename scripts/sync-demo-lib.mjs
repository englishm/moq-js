import fs from "fs"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const sourceDir = path.join(root, "lib", "dist")
const targetDir = path.join(root, "demo", "lib")

const shouldCopy = (name) =>
	name.endsWith(".iife.js") || name.endsWith(".iife.js.map")

fs.mkdirSync(targetDir, { recursive: true })

const sourceFiles = new Set(fs.readdirSync(sourceDir).filter(shouldCopy))

for (const name of fs.readdirSync(targetDir)) {
	if (shouldCopy(name) && !sourceFiles.has(name)) {
		fs.rmSync(path.join(targetDir, name))
	}
}

for (const name of sourceFiles) {
	fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name))
}

console.log(`Synced ${sourceFiles.size} demo bundle files to demo/lib`) 
