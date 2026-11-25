// A bug four characters deep: coverage-guided search reaches it, random search does not.
import { Effect } from "effect"
import { expect, it } from "vitest"
import { Gen, Prop, Search } from "@maple-dev/effect-prop"
import { Coverage } from "@maple-dev/effect-prop/node"

/** Reads `\n` and `\u{1F600}` escapes. Bug: `\u{}` is not a code point. */
const unescape = (text: string): string => {
	let out = ""
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== "\\") {
			out += text[i]
			continue
		}
		const next = text[++i]
		if (next === "n") out += "\n"
		else if (next === "u") {
			if (text[i + 1] === "{") {
				const close = text.indexOf("}", i)
				if (close !== -1) {
					out += String.fromCodePoint(Number.parseInt(text.slice(i + 2, close), 16))
					i = close
					continue
				}
			}
			out += "u"
		} else out += next ?? ""
	}
	return out
}

const text = Gen.string({ char: Gen.asciiChar, maxLength: 12 })
const neverThrows = (input: string) => void unescape(input)

it("reaches the escape one branch at a time", async () => {
	const coverage = Coverage.layer({ include: (url) => url.includes("coverage-guided.test") })
	const guided = await Effect.runPromise(
		Prop.check(text, neverThrows, { seed: 2, runs: 50_000, search: Search.coverage }).pipe(Effect.provide(coverage)),
	)
	expect(guided.failures.map((failure) => failure.value)).toEqual(["\\u{}"])

	// The same budget, unguided: four given characters in a row, out of 95 each.
	const random = await Effect.runPromise(Prop.check(text, neverThrows, { seed: 2, runs: 50_000 }))
	expect(Prop.passed(random)).toBe(true)
}, 60_000)
