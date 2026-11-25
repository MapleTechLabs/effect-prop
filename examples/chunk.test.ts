// A first property: a function with a bug, and the smallest input that shows it.
import { Effect } from "effect"
import { expect, it } from "vitest"
import { Gen, Prop } from "@maple-dev/effect-prop"

/** Splits a list into pieces of `size`. Bug: a last piece shorter than `size` is dropped. */
const chunk = <A>(items: ReadonlyArray<A>, size: number): Array<Array<A>> => {
	const out: Array<Array<A>> = []
	for (let i = 0; i + size <= items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

const input = Gen.tuple(Gen.array(Gen.int()), Gen.int(1, 5))
const holdsEveryItem = ([items, size]: readonly [ReadonlyArray<number>, number]) => {
	expect(chunk(items, size).flat()).toEqual(items)
}

// In a test suite this is `prop("chunks hold every item, in order", input, holdsEveryItem)`,
// which fails with the report. Here the report is checked, so the example passes in CI.
it("finds the dropped tail and shrinks it to one item and a size of 2", async () => {
	const report = await Effect.runPromise(Prop.check(input, holdsEveryItem, { seed: 1 }))
	expect(report.failures.map((failure) => failure.value)).toEqual([[[0], 2]])
})
