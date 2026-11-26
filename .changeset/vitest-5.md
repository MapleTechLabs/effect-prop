---
"@maple-dev/effect-prop": patch
---

Works with vitest 5 as well as vitest 4: the `vitest` peer range is now `^4.0.0 || ^5.0.0`. Under vitest 5 the coverage report gives the lines of your source again, not of vitest's transform: vitest 5 no longer inlines the source map in the code it runs, so `Coverage` reads it from the module vitest keeps.
