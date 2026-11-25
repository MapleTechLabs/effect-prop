// One run, every distinct bug: failures are grouped by what went wrong.
import { Effect } from "effect"
import { expect, it } from "vitest"
import { Gen, Prop } from "@maple-dev/effect-prop"

/** One page of a list. Two bugs, marked. */
const paginate = <A>(items: ReadonlyArray<A>, page: number, size: number) => ({
	items: items.slice(page * size, (page + 1) * size),
	// Bug: the last, shorter page is not counted.
	pageCount: Math.floor(items.length / size),
	// Bug: false on a last page that is exactly full.
	isLast: (page + 1) * size > items.length,
})

const input = Gen.struct({ items: Gen.array(Gen.int(0, 9), { maxLength: 12 }), size: Gen.int(1, 4) })

const pagesCoverTheList = ({ items, size }: { readonly items: ReadonlyArray<number>; readonly size: number }) => {
	const pages = Math.ceil(items.length / size)
	expect(paginate(items, 0, size).pageCount, "every item is on some page").toBe(pages)
	expect(paginate(items, Math.max(0, pages - 1), size).isLast, "the last page says so").toBe(true)
}

it("reports both bugs, each with its own smallest input", async () => {
	const report = await Effect.runPromise(Prop.check(input, pagesCoverTheList, { seed: 1, runs: 500, failures: 2 }))
	expect(report.failures.map((failure) => failure.value)).toEqual([
		{ items: [0], size: 1 },
		{ items: [0], size: 2 },
	])
	expect(new Set(report.failures.map((failure) => failure.signature)).size).toBe(2)
})
