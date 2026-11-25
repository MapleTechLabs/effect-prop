// Building generators, looking at what they make, and checking them.
import { expect, it } from "vitest"
import { Gen, Inspect } from "@maple-dev/effect-prop"
import { prop } from "@maple-dev/effect-prop/vitest"

// Later draws may depend on earlier ones.
const range = Gen.gen(function* () {
	const lo = yield* Gen.int(0, 10)
	const hi = yield* Gen.int(lo, 20)
	return { lo, hi }
})

// Recursive data: the leaves, then how a node is built from smaller values.
type Json = null | boolean | number | string | ReadonlyArray<Json> | { readonly [key: string]: Json }
const json: Gen.Gen<Json> = Gen.recursive<Json>(
	Gen.oneOf(Gen.constant(null), Gen.boolean, Gen.int(-100, 100), Gen.string({ maxLength: 5 })),
	(self) =>
		Gen.oneOf(
			Gen.array(self, { maxLength: 3 }),
			Gen.map(Gen.array(Gen.tuple(Gen.string({ char: Gen.asciiChar, maxLength: 3 }), self), { maxLength: 3 }), Object.fromEntries),
		),
	{ maxDepth: 3 },
)

// A weighted choice, biased toward the values that matter.
const status = Gen.weighted([6, Gen.constant("open")], [3, Gen.constant("paid")], [1, Gen.constant("refunded")])

prop("a range is never backwards", range, ({ lo, hi }) => lo <= hi, { regressions: false })
prop("JSON survives a round trip", json, (value) => expect(JSON.parse(JSON.stringify(value))).toEqual(value), { regressions: false })

it("sample shows what a generator makes", () => {
	expect(Gen.sample(range, { count: 3, seed: 1 })).toEqual([
		{ lo: 6, hi: 6 },
		{ lo: 1, hi: 7 },
		{ lo: 4, hi: 6 },
	])
})

it("inspect says what is wrong with a generator", () => {
	// Filtering throws most tries away.
	const multiplesOf50 = Gen.int(0, 1000).pipe(Gen.filter((n) => n % 50 === 0))
	expect(Inspect.inspect(multiplesOf50).problems).toEqual(["61% of tries are discarded: build valid values instead of filtering"])
	// Built instead: nothing discarded.
	expect(Inspect.inspect(Gen.map(Gen.int(0, 20), (n) => n * 50)).problems).toEqual([])

	// A case the generator can never produce.
	const order = Gen.struct({ status: Gen.element("open", "paid"), qty: Gen.int(1, 5) })
	expect(Inspect.inspect(order, { label: (o) => o.status, expect: ["open", "paid", "refunded"] }).problems).toEqual(["never produced: refunded"])
	expect(Inspect.inspect(Gen.struct({ status, qty: Gen.int(1, 5) }), { label: (o) => o.status, expect: ["open", "paid", "refunded"] }).problems).toEqual([])
})
