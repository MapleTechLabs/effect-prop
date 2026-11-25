# effect-prop

Property-based testing for [Effect](https://effect.website). You write what must
hold for every input. It generates inputs, finds the ones that break your code,
and gives you the smallest one, with a token that reruns it.

```sh
bun add -d @maple-dev/effect-prop
```

Needs `effect` 4. The `prop` test helper needs `vitest` 4. Experimental: the API
may change between 0.x releases.

## A first property

`chunk` splits a list into pieces. This version has a bug.

```ts
import { expect } from "vitest"
import { Gen } from "@maple-dev/effect-prop"
import { prop } from "@maple-dev/effect-prop/vitest"

const chunk = <A>(items: ReadonlyArray<A>, size: number): Array<Array<A>> => {
	const out: Array<Array<A>> = []
	for (let i = 0; i + size <= items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

prop("chunks hold every item, in order", Gen.tuple(Gen.array(Gen.int()), Gen.int(1, 5)), ([items, size]) => {
	expect(chunk(items, size).flat()).toEqual(items)
})
```

`prop` is a vitest test. It fails with this:

```
test/chunk.test.ts > chunks hold every item, in order: 1 distinct failure (2 runs, 0 discarded, seed 1, 4 ms)

  1. AssertionError at test/chunk.test.ts:13 (found by search, shrunk in 4 steps)
    input:
      [[0],2]
    AssertionError: expected [] to deeply equal [ +0 ]
    replay: PROP_REPLAY='p1.4.1.0.0.1'
```

One item and a size of 2: the last piece is shorter than `size`, and the loop
drops it. The input it first failed on was larger; `[[0], 2]` is what is left
after shrinking.

To run exactly that input again while you fix it:

```sh
PROP_REPLAY='p1.4.1.0.0.1' bunx vitest run -t 'chunks hold every item'
```

The failure is also saved under `.prop/regressions/` and tried first on every
later run, so it stays a test after the fix. Commit that folder.

Every example below is a file in [`examples/`](examples) that CI runs, and the
output shown is what it printed.

## Examples

### What is written must read back

A CSV row, with cells joined by commas:

```ts
const toRow = (cells: ReadonlyArray<string>) => cells.join(",")
const fromRow = (row: string) => row.split(",")

const cells = Gen.array(Gen.string({ char: Gen.asciiChar, maxLength: 6 }), { minLength: 1, maxLength: 4 })

prop("a row reads back as it was written", cells, (row) => {
	expect(fromRow(toRow(row))).toEqual(row)
})
```

```
    input:
      [","]
    AssertionError: expected [ '', '' ] to deeply equal [ ',' ]
```

For a type you already have a Schema for, the generator comes from the Schema:

```ts
const Order = Schema.Struct({
	id: Schema.String,
	customer: Schema.String,
	status: Schema.Literals(["open", "paid", "void"]),
	note: Schema.NullOr(Schema.String),
	tags: Schema.Array(Schema.String),
})
const OrderJson = Schema.fromJsonString(Order)

prop("an order survives JSON", Gen.fromSchema(Order), (order) =>
	Effect.gen(function* () {
		const text = yield* Schema.encodeEffect(OrderJson)(order)
		expect(yield* Schema.decodeEffect(OrderJson)(text)).toEqual(order)
	}),
)
```

This one passes. Change `id` to `Schema.Int` and it fails on `{ id: -0, … }`:
the generator makes negative zero, and JSON reads it back as `0`.

[`examples/round-trip.test.ts`](examples/round-trip.test.ts)

### A property that is an Effect

A property can return an Effect and use services. Here every input gets fresh
accounts, because the layer is provided inside the property.

```ts
class Accounts extends Context.Service<Accounts, {
	readonly balances: Ref.Ref<ReadonlyArray<number>>
	readonly transfer: (from: number, to: number, amount: number) => Effect.Effect<void>
}>()("example/Accounts") {}

const transfers = Gen.array(
	Gen.struct({ from: Gen.int(0, 2), to: Gen.int(0, 2), amount: Gen.int(1, 50) }),
	{ maxLength: 10 },
)

prop("transfers move money, never make it", transfers, (list) =>
	Effect.gen(function* () {
		const accounts = yield* Accounts
		const before = total(yield* Ref.get(accounts.balances))
		for (const { from, to, amount } of list) yield* accounts.transfer(from, to, amount)
		expect(total(yield* Ref.get(accounts.balances))).toBe(before)
	}).pipe(Effect.provide(AccountsLive)),
)
```

```
    input:
      [{"from":0,"to":0,"amount":1}]
    AssertionError: expected 301 to be 300 // Object.is equality
```

One transfer, from an account to itself: `transfer` reads both balances before
it writes either.

Two more things a property gets:

- **A scope per input.** `Effect.acquireRelease` inside a property is released
  before the next input runs.
- **A layer per property.** For a service that should be built once, such as a
  database connection, pass `{ layer }` in the options instead. Leaving it out
  when the property needs a service is a type error.

[`examples/effect-service.test.ts`](examples/effect-service.test.ts)

### Every bug in one run

A property normally stops at its first failure. Ask for more with `failures`
(or `PROP_FAILURES=5` from the shell) and it keeps searching, groups the
failures by what went wrong, and shrinks one input per group.

```ts
const paginate = <A>(items: ReadonlyArray<A>, page: number, size: number) => ({
	items: items.slice(page * size, (page + 1) * size),
	pageCount: Math.floor(items.length / size),
	isLast: (page + 1) * size > items.length,
})

const input = Gen.struct({ items: Gen.array(Gen.int(0, 9), { maxLength: 12 }), size: Gen.int(1, 4) })

prop("pages cover the list", input, ({ items, size }) => {
	const pages = Math.ceil(items.length / size)
	expect(paginate(items, 0, size).pageCount, "every item is on some page").toBe(pages)
	expect(paginate(items, Math.max(0, pages - 1), size).isLast, "the last page says so").toBe(true)
}, { failures: 2 })
```

```
test/pagination.test.ts > pages cover the list: 2 distinct failures (4 runs, 0 discarded, seed 1, 8 ms)

  1. AssertionError at test/pagination.test.ts:20 (found by search, shrunk in 1 steps)
    input:
      {"items":[0],"size":1}
    AssertionError: the last page says so: expected false to be true // Object.is equality
    replay: PROP_REPLAY='p1.7.1.0.0.0'

  2. AssertionError at test/pagination.test.ts:19 (found by search, shrunk in 5 steps)
    input:
      {"items":[0],"size":2}
    AssertionError: every item is on some page: expected +0 to be 1 // Object.is equality
    replay: PROP_REPLAY='p1.a.1.0.0.1'
```

Two bugs, each with its own smallest input and its own replay token.

A failure's group is its error's `_tag` if it has one, otherwise the error's
name and the line it was thrown from. When one assertion covers several causes,
name the group yourself with `yield* Prop.signature("…")` before failing.

[`examples/several-failures.test.ts`](examples/several-failures.test.ts)

### A bug behind several branches

`unescape` reads `\n` and `\u{1F600}`. It throws on `\u{}`. A random string has
to hold those four characters in a row to get there: out of 95 possible
characters each, that is one chance in 81 million per position.

```ts
import { Search } from "@maple-dev/effect-prop"
import { Coverage } from "@maple-dev/effect-prop/node"

prop("unescape never throws", Gen.string({ char: Gen.asciiChar, maxLength: 12 }), (text) => void unescape(text), {
	runs: 50_000,
	search: Search.coverage,
	layer: Coverage.layer({ include: (url) => url.includes("/src/unescape") }),
})
```

```
test/unescape.test.ts > unescape never throws: 1 distinct failure (4843 runs, 0 discarded, seed 2, 322 ms)

  1. RangeError at src/unescape.ts:21 (found by search, shrunk in 4 steps)
    input:
      "\\u{}"
    RangeError: Invalid code point NaN
    replay: PROP_REPLAY='p1.1.1.2a.1.k.1.25.1.26.0'

  v8 coverage: reached 19 of 21 known, 13 inputs kept
```

`Search.coverage` keeps every input that reaches a branch no earlier input
reached, and builds new inputs by changing those. A string with a `\` is kept,
then one with `\u`, then `\u{`. On three seeds it found the bug within 4,500 to
38,000 inputs. Random search, the default, found nothing in 50,000.

`include` chooses whose branches count: your code, not the test's and not your
dependencies'. Things to know:

- **Node only.** It reads V8's coverage through `node:inspector`.
- **Reading coverage costs a millisecond or two.** Worth it for long runs, not
  for a hundred inputs of a cheap property. Keep quick test runs on the default
  search and guide the long ones.
- **One guided property at a time per process**, and not under
  `vitest --coverage`: they share V8's counters.
- **`PROP_VERBOSE=1`** prints the functions no input reached. That is where to
  aim the generator next.

Without V8, `Spans.layer` gives a coarser signal from the Effect spans your
code opens.

[`examples/coverage-guided.test.ts`](examples/coverage-guided.test.ts)

### Stateful code against a model

For anything with state, generate a sequence of commands and check each step
against a simple model. Here the model of a bounded queue is an array.

```ts
type Model = ReadonlyArray<number>
type Command = Stateful.Command<Model, RingQueue> & { readonly show: string }

const push = (value: number): Command => ({
	name: "push",
	show: `push(${value})`,
	next: (model) => [...model, value].slice(-CAPACITY),
	run: (queue) => Effect.sync(() => queue.push(value)),
})
const pop: Command = {
	name: "pop",
	show: "pop",
	next: (model) => model.slice(1),
	run: (queue, model) => Effect.sync(() => queue.pop() === model[0]), // false: they disagree
}

const commands = Stateful.commands<Model, Command>({
	initial: [],
	// Generated for the state so far: never a pop on an empty queue.
	command: (model) =>
		model.length === 0
			? Gen.map(Gen.int(0, 9), push)
			: Gen.oneOf(Gen.map(Gen.int(0, 9), push), Gen.constant(pop)),
})

prop("the queue behaves like its model", commands, (sequence) => Stateful.run([], new RingQueue(), sequence), {
	format: (sequence) => sequence.map((command) => command.show).join(", "),
})
```

```
  1. command pop (found by search, shrunk in 6 steps)
    input:
      push(0), push(0), push(0), push(1), pop
    @maple-dev/effect-prop/CommandFailed: command 5 (pop) returned false: the system and the model disagree
```

Fill the queue, push once more, pop: five commands, and the fourth push is the
only one whose value matters. Shrinking removes commands and the rest are
regenerated against the new states, so the sequence stays valid.

[`examples/stateful.test.ts`](examples/stateful.test.ts)

### Writing generators

```ts
// Later draws may depend on earlier ones.
const range = Gen.gen(function* () {
	const lo = yield* Gen.int(0, 10)
	const hi = yield* Gen.int(lo, 20)
	return { lo, hi }
})

// Recursive data: the leaves first, then how a node is built from smaller values.
type Json = null | boolean | number | string | ReadonlyArray<Json> | { readonly [key: string]: Json }
const json: Gen.Gen<Json> = Gen.recursive<Json>(
	Gen.oneOf(Gen.constant(null), Gen.boolean, Gen.int(-100, 100), Gen.string({ maxLength: 5 })),
	(self) => Gen.oneOf(
		Gen.array(self, { maxLength: 3 }),
		Gen.map(Gen.array(Gen.tuple(Gen.string({ char: Gen.asciiChar, maxLength: 3 }), self), { maxLength: 3 }), Object.fromEntries),
	),
	{ maxDepth: 3 },
)

// Biased toward the values that matter.
const status = Gen.weighted([6, Gen.constant("open")], [3, Gen.constant("paid")], [1, Gen.constant("refunded")])
```

Look at what a generator makes before trusting it:

```ts
Gen.sample(range, { count: 3, seed: 1 })
// [{ lo: 6, hi: 6 }, { lo: 1, hi: 7 }, { lo: 4, hi: 6 }]
```

`Inspect.inspect` samples a generator and tells you what is wrong with it:

```ts
const multiplesOf50 = Gen.int(0, 1000).pipe(Gen.filter((n) => n % 50 === 0))
Inspect.inspect(multiplesOf50).problems
// ["61% of tries are discarded: build valid values instead of filtering"]

Inspect.inspect(Gen.map(Gen.int(0, 20), (n) => n * 50)).problems
// []

const order = Gen.struct({ status: Gen.element("open", "paid"), qty: Gen.int(1, 5) })
Inspect.inspect(order, { label: (o) => o.status, expect: ["open", "paid", "refunded"] }).problems
// ["never produced: refunded"]
```

Two rules make generators shrink to something readable:

- **Simplest first.** Put the simplest alternative first in `oneOf`, and the
  leaf first in `recursive`. Shrinking moves toward the first choice.
- **Build, don't filter.** `filter` throws the whole input away after three
  rejected tries. `Gen.map(Gen.int(0, 20), (n) => n * 50)` beats filtering.

[`examples/generators.test.ts`](examples/generators.test.ts)

## Reference

### Generators

| | |
|---|---|
| Numbers | `int(min, max)`, `nat(max)`, `number({ min, max, nan, infinity })`, `boolean`, `weightedBoolean(p)` |
| Choice | `constant`, `element(...values)`, `elements(array)`, `oneOf(...gens)`, `weighted([weight, gen], ...)`, `option`, `nullable` |
| Collections | `array(gen, { minLength, maxLength })`, `uniqueArray`, `subsequence`, `shuffled`, `tuple`, `struct` |
| Text | `string({ char, minLength, maxLength })`, `charOf(alphabet)`, `asciiChar`, `unicodeChar` |
| Structure | `map`, `flatMap`, `filter`, `gen`, `recursive(base, step)`, `lazy`, `sized`, `labeled` |
| From elsewhere | `fromSchema(schema)`, `fromArbitrary(arbitrary)`, `fromSeed(f)` |

`fromSchema` and `fromArbitrary` hand one seed to Effect's `Arbitrary`, so they
shrink only by trying other seeds. Where a small counterexample matters, build
the generator from the combinators above.

### Options

The fourth argument of `prop`, and the third of `Prop.check`.

| Option | Default | |
|---|---|---|
| `runs` | 100 | Generated inputs to judge. |
| `failures` | 1 | Stop after this many distinct failures. |
| `seed` | random | The same seed gives the same inputs. |
| `examples` | none | Values to run first on every run. Use it to pin a fixed bug's input. |
| `timeout` | none | One input taking longer fails as `Timeout`. |
| `budget` | none | Stop searching after this long. |
| `search` | `Search.random` | Also `Search.coverage`, `Search.target()` (climbs a score given with `Prop.target`), `Search.slow` (climbs run time). |
| `format` | JSON-like | How an input is printed in the report. |
| `layer` | | `prop` only. Provides the property's services, built once. |
| `regressions` | `.prop/regressions` | `prop` only. Where failures are saved, or `false`. |

Inside a property:

| | |
|---|---|
| `Prop.assume(condition)` | Skip this input. It counts as a discard, not a pass. |
| `Prop.label(name)`, `Prop.classify(condition, name)` | Count inputs by kind. The report shows the shares. |
| `Prop.signature(name)` | Name the failure group this input belongs to if it fails. |
| `Prop.target(score)` | Score this input, for `Search.target()`. |

### From the shell

`prop` reads these, so a run changes without editing the test.

| Variable | |
|---|---|
| `PROP_REPLAY` | Run only the input a report's `replay` line names. Pick the property with `-t`. |
| `PROP_FAILURES` | How many distinct failures to look for. |
| `PROP_RUNS`, `PROP_SCALE` | The number of inputs, or a multiplier for each property's own number. |
| `PROP_SEED` | The seed. |
| `PROP_BUDGET_MS` | Stop searching after this long. |
| `PROP_VERBOSE=1` | Print the report of a passing property too, with coverage. |

### Without vitest

`Prop.check(gen, property, options)` is the Effect underneath `prop`. It returns
a `Report` whether or not the property held, and reads no environment variable.

```ts
const report = await Effect.runPromise(Prop.check(Gen.array(Gen.int()), (xs) => xs.every((x) => x < 1000)))
report.failures[0]?.value // [1000]
console.log(Prop.formatReport(report))
```

## How it works

A generator never calls a random number generator. It asks a `Source` for
integers, and the source records each answer. That list of answers is the
input: running the generator on the same list builds the same value.

So replay is running the list again, shrinking is making the list shorter or
its numbers smaller and running again, and coverage-guided search is editing
the list of an input that reached new code. None of the three needs code per
type, and a shrunk input is always one the generator could have produced.

The design follows [ephyra](https://github.com/datadog-labs/ephyra) and
[Hypothesis](https://hypothesis.works).

## Shrinking, compared with fast-check

Six of the [shrinking challenges](https://github.com/jlink/shrinking-challenge),
30 seeds each. Both libraries found a failure on every seed. This is how often
each shrank it to the known smallest input:

| Challenge | effect-prop | fast-check |
|---|---|---|
| reverse | 30/30 | 17/30 |
| distinct | 30/30 | 24/30 |
| nestedlists | 30/30 | 0/30 |
| lengthlist | 30/30 | 5/30 |
| bound5 | 30/30 | 3/30 |
| calculator | 30/30 | 6/30 |

Run it with `bun run bench`. The code is in [`bench/`](bench).

## With a coding agent

[GUIDE.md](GUIDE.md) tells an agent how to test a project with this: choosing
what to check, writing generators, widening them from the coverage report, and
triaging what fails. A prompt to start from:

```text
Let's test <my library> with @maple-dev/effect-prop
(https://github.com/MapleTechLabs/effect-prop). Read its README and GUIDE.md
first, then write and widen properties until you find bugs; validate, triage
and report them to me.
```

## Not built yet

- A generator derived natively from a Schema. `fromSchema` shrinks by seed only.
- Concurrent stateful testing.
- An HTML report and a CLI.

## Developing

```sh
bun install
bun run typecheck
bun run test          # the library's tests and the examples
bun run bench         # the shrinking comparison
bun run test:package  # builds, packs, and runs a property from a fresh install
```

Releases go through [changesets](.changeset/README.md): add one with
`bun run changeset` in the pull request that changes behaviour.

## License

MIT. See [LICENSE](LICENSE).
