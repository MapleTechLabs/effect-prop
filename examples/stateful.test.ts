// Stateful code against a model: sequences of commands, shrunk to the shortest that fails.
import { Effect } from "effect"
import { expect, it } from "vitest"
import { Gen, Prop, Stateful } from "@maple-dev/effect-prop"

const CAPACITY = 3

/** A queue of at most three items. Bug: a push onto a full queue overwrites the oldest but keeps pointing at it. */
class RingQueue {
	private readonly items = new Array<number>(CAPACITY).fill(0)
	private head = 0
	private count = 0
	push(value: number): void {
		this.items[(this.head + this.count) % CAPACITY] = value
		if (this.count < CAPACITY) this.count++
	}
	pop(): number | undefined {
		if (this.count === 0) return undefined
		const value = this.items[this.head]!
		this.head = (this.head + 1) % CAPACITY
		this.count--
		return value
	}
}

/** The model: what a correct queue holds. */
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
	// `false` means the queue and the model disagree.
	run: (queue, model) => Effect.sync(() => queue.pop() === model[0]),
}

const commands = Stateful.commands<Model, Command>({
	initial: [],
	// Each command is generated for the state the earlier ones lead to: no pop on an empty queue.
	command: (model) => (model.length === 0 ? Gen.map(Gen.int(0, 9), push) : Gen.oneOf(Gen.map(Gen.int(0, 9), push), Gen.constant(pop))),
})

it("finds the overflow bug in five commands", async () => {
	const report = await Effect.runPromise(
		Prop.check(commands, (sequence) => Stateful.run([], new RingQueue(), sequence), {
			seed: 1,
			runs: 2000,
			format: (sequence) => sequence.map((command) => command.show).join(", "),
		}),
	)
	expect(report.failures.map((failure) => report.format(failure.value))).toEqual(["push(0), push(0), push(0), push(1), pop"])
})
