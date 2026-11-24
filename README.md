# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mokoooo/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mokoooo/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar — a ranked board of pre-token protocols by implied launch
value, built from the sealed DefiLlama snapshot. Of 758 protocols it selects
the ones that record no token yet (excluding wrapped, staked and bridged
products and versioned siblings) and ranks 198 candidates. Implied value is
TVL × the median market-cap/TVL multiple of token-bearing peers in the same
category (global median when a category has fewer than 3 peers), adjusted for
7-day TVL growth and for how long the protocol has run. All 40 house-watchlist
protocols are covered. The dashboard adds text search, category / chain /
watchlist / growth filters, column sorting, and a per-protocol detail view
with a farm plan; views are shareable through the URL hash
(`#q=…&cat=…&chain=…&watch=1&growth=1&slug=…`). It is this board's own
heuristic claim from the sealed snapshot, not a price prediction.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
node --test test/ranking.test.mjs
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, the dashboard's `data.js`, copies `dashboard/` and
`screenshots/` to the output directory, and writes `dossier.json` with
`buildDossier` from `vendor/makefun-board.ts`. Two runs produce byte-identical
outputs. `analyze.mjs` / `src/` are the earlier prototype the entry grew out
of; the entry itself is `main.ts` + `lib/` + `dashboard/` + `screenshots/` +
`vendor/`.

## License

MIT — see `LICENSE`.
