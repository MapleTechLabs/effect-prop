// Round trips: what is written must read back. One with a bug, one through a Schema.
import { Effect, Schema } from "effect"
import { expect, it } from "vitest"
import { Gen, Prop } from "@maple-dev/effect-prop"
import { prop } from "@maple-dev/effect-prop/vitest"

/** A CSV row. Bug: a cell that holds a comma is not quoted. */
const toRow = (cells: ReadonlyArray<string>): string => cells.join(",")
const fromRow = (row: string): Array<string> => row.split(",")

const cells = Gen.array(Gen.string({ char: Gen.asciiChar, maxLength: 6 }), { minLength: 1, maxLength: 4 })

it("finds the cell that breaks the row: a lone comma", async () => {
	const report = await Effect.runPromise(Prop.check(cells, (row) => expect(fromRow(toRow(row))).toEqual(row), { seed: 1, runs: 500 }))
	expect(report.failures.map((failure) => failure.value)).toEqual([[","]])
})

// A generator straight from a Schema, for a codec that is right.
// (Give it a number field and it fails: the generator makes `-0`, and JSON reads that back as `0`.)
const Order = Schema.Struct({
	id: Schema.String,
	customer: Schema.String,
	status: Schema.Literals(["open", "paid", "void"]),
	note: Schema.NullOr(Schema.String),
	tags: Schema.Array(Schema.String),
})
const OrderJson = Schema.fromJsonString(Order)

prop(
	"an order survives JSON",
	Gen.fromSchema(Order),
	(order) =>
		Effect.gen(function* () {
			const text = yield* Schema.encodeEffect(OrderJson)(order)
			expect(yield* Schema.decodeEffect(OrderJson)(text)).toEqual(order)
		}),
	{ regressions: false },
)
