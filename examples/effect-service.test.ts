// A property that is an Effect: it uses a service, and gets a fresh one per input.
import { Context, Effect, Layer, Ref } from "effect"
import { expect, it } from "vitest"
import { Gen, Prop } from "@maple-dev/effect-prop"

class Accounts extends Context.Service<
	Accounts,
	{
		readonly balances: Ref.Ref<ReadonlyArray<number>>
		readonly transfer: (from: number, to: number, amount: number) => Effect.Effect<void>
	}
>()("example/Accounts") {}

/** Three accounts of 100 each. Bug: both balances are read before either is written. */
const AccountsLive = Layer.effect(
	Accounts,
	Effect.gen(function* () {
		const balances = yield* Ref.make<ReadonlyArray<number>>([100, 100, 100])
		return {
			balances,
			transfer: (from, to, amount) =>
				Effect.gen(function* () {
					const before = yield* Ref.get(balances)
					const debited = before[from]! - amount
					const credited = before[to]! + amount
					yield* Ref.update(balances, (all) => all.map((balance, i) => (i === from ? debited : balance)))
					yield* Ref.update(balances, (all) => all.map((balance, i) => (i === to ? credited : balance)))
				}),
		}
	}),
)

const transfers = Gen.array(Gen.struct({ from: Gen.int(0, 2), to: Gen.int(0, 2), amount: Gen.int(1, 50) }), { maxLength: 10 })

const total = (balances: ReadonlyArray<number>) => balances.reduce((sum, balance) => sum + balance, 0)

const moneyIsConserved = (list: ReadonlyArray<{ readonly from: number; readonly to: number; readonly amount: number }>) =>
	Effect.gen(function* () {
		const accounts = yield* Accounts
		const before = total(yield* Ref.get(accounts.balances))
		for (const { from, to, amount } of list) yield* accounts.transfer(from, to, amount)
		expect(total(yield* Ref.get(accounts.balances))).toBe(before)
		// Provided inside the property: every input starts from fresh accounts.
	}).pipe(Effect.provide(AccountsLive))

it("finds the transfer that makes money: an account paying itself", async () => {
	const report = await Effect.runPromise(Prop.check(transfers, moneyIsConserved, { seed: 1, runs: 300 }))
	expect(report.failures.map((failure) => failure.value)).toEqual([[{ from: 0, to: 0, amount: 1 }]])
})
