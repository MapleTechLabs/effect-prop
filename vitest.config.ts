import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url))

// The examples import the package by name, as an app does; here that is the source.
export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@maple-dev\/effect-prop$/, replacement: src("index.ts") },
			{ find: /^@maple-dev\/effect-prop\/(node|vitest)$/, replacement: src("$1.ts") },
		],
	},
})
