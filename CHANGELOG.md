# @maple-dev/effect-prop

## 0.1.1

### Patch Changes

- 158fd52: Works with vitest 5 as well as vitest 4: the `vitest` peer range is now `^4.0.0 || ^5.0.0`. Under vitest 5 the coverage report gives the lines of your source again, not of vitest's transform: vitest 5 no longer inlines the source map in the code it runs, so `Coverage` reads it from the module vitest keeps.

## 0.1.0

### Minor Changes

- 411122b: First release, moved out of [effect-orm](https://github.com/MapleTechLabs/effect-orm), where it found bugs in the query builder and in ClickHouse 26.2.
  
  - `Gen`: generators that record every random decision, so replay, shrinking and mutation need no code per type.
  - `Prop.check`: properties as Effects, each input in its own `Scope`, several distinct failures per run, each shrunk and with a `PROP_REPLAY` token.
  - `Search`: random, coverage-guided, target and slow.
  - Feedback from V8 coverage (`@maple-dev/effect-prop/node`) or from span names.
  - Regression files, `Inspect` for checking a generator, `Stateful` for command sequences against a model.
  - `prop` for vitest (`@maple-dev/effect-prop/vitest`).
