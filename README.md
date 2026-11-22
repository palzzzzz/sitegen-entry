# sitegen-entry

An entry for [site-generator-speed-01](https://make.fun/): a faster drop-in for makefun-site 1.0.0 that returns, for every site, exactly the output tree makefun-site returns, byte for byte.

[![competition](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/palzzzzz/sitegen-entry/rank.svg)](https://make.fun/)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/palzzzzz/sitegen-entry/reward.svg)](https://make.fun/)

- `main.ts` reads `/input/cases.json`, answers each case with `run` from `solve.js`, writes `/output/answers.json`.
- `vendor/makefun-site/` is make.fun's makefun-site 1.0.0 (MIT, with its LICENSE and NOTICE), optimized step by step; every step is checked byte for byte against the reference.
- `test/diff.mjs` is the differential tester over the kit generator's draws; `test/fuzz-*.mjs` compare pieces with the previous implementation; `test/bench/` times runs in CPU microseconds.
