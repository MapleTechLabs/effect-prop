// The package as an app gets it: packed, installed into an empty project, and
// used through each of its entry points, at run time and by the type checker.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const consumer = mkdtempSync(join(tmpdir(), "effect-prop-consumer-"))
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" })

try {
	const [packed] = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", consumer], root))
	const files = packed.files.map((file) => file.path)
	for (const entry of ["dist/index.mjs", "dist/index.d.mts", "dist/node.mjs", "dist/vitest.mjs", "README.md", "GUIDE.md", "LICENSE"]) {
		if (!files.includes(entry)) throw new Error(`the tarball has no ${entry}`)
	}
	const stray = files.filter((file) => /^(src|test|bench|scripts)\//.test(file))
	if (stray.length > 0) throw new Error(`the tarball holds files that are not published: ${stray.join(", ")}`)

	writeFileSync(
		join(consumer, "package.json"),
		JSON.stringify({
			name: "consumer",
			private: true,
			type: "module",
			dependencies: {
				[manifest.name]: `file:./${packed.filename}`,
				effect: manifest.devDependencies.effect,
				vitest: manifest.devDependencies.vitest,
				typescript: manifest.devDependencies.typescript,
				"@types/node": manifest.devDependencies["@types/node"],
			},
		}),
	)
	writeFileSync(
		join(consumer, "tsconfig.json"),
		JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, noEmit: true, skipLibCheck: false, types: ["node"] }, include: ["*.test.ts"] }),
	)
	writeFileSync(
		join(consumer, "consumer.test.ts"),
		`import { Effect } from "effect"
import { expect, it } from "vitest"
import { Gen, Inspect, Prop, Search, Stateful } from "${manifest.name}"
import { Coverage, layerRegressions } from "${manifest.name}/node"
import { prop } from "${manifest.name}/vitest"

prop("sorting keeps every element", Gen.array(Gen.int()), (xs) => [...xs].sort((a, b) => a - b).length === xs.length, { regressions: false })

it("finds and shrinks a failure, guided by coverage of this file", async () => {
	const report = await Effect.runPromise(
		Prop.check(Gen.array(Gen.int()), (xs) => xs.every((x) => x < 1000), { runs: 500, seed: 1, search: Search.coverage }).pipe(
			Effect.provide(Coverage.layer({ include: (url) => url.includes("consumer.test") })),
		),
	)
	expect(report.failures.map((failure) => failure.value)).toEqual([[1000]])
	expect(report.feedback?.kind).toBe("v8 coverage")
	expect(Inspect.inspect(Gen.boolean).problems).toEqual([])
	expect(typeof Stateful.commands).toBe("function")
	expect(typeof layerRegressions).toBe("function")
})
`,
	)
	run("bun", ["install"], consumer)
	run("bunx", ["tsc", "-p", "tsconfig.json"], consumer)
	const output = run("bunx", ["vitest", "run"], consumer)
	if (!/Tests\s+2 passed/.test(output.replace(/\x1b\[[0-9;]*m/g, ""))) throw new Error(`the consumer's tests did not pass:\n${output}`)
	console.log(`${manifest.name}@${manifest.version}: ${files.length} files packed; a fresh install type-checks and runs its properties`)
} finally {
	rmSync(consumer, { recursive: true, force: true })
}
