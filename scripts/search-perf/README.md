# Search perf harness

Times the first page of filtered local search on 100k stored messages, in headless Chromium
with the app's own Dexie store. fake-indexeddb says nothing about IndexedDB speed, so this is
not a unit test and CI does not run it.

## Run

```sh
# once: seed 100k messages into a throwaway browser profile (about a minute)
PLAYWRIGHT_BROWSERS_PATH=<dir with Playwright's chromium> node scripts/search-perf/run.mjs --seed

# any time: time the queries against the seeded profile
node scripts/search-perf/run.mjs --runs 9
```

Needs `@playwright/test` and `esbuild` (which Vite brings) from `node_modules`.

Options: `--profile <dir>` (default: a folder in the system temp dir), `--rows <n>`, `--runs <n>`,
`--root <dir>` (a checkout or `src` copy to measure, for before/after).

Each query runs once to warm up, then `--runs` times. The table has the median, min and max
in ms, the number of rows on the first page, and a short hash of their ids. The same hash in
two runs means both gave the same rows.

## Comparing two versions

Seed once, then point `--root` at the other version's folder (it needs `src/` and a
`node_modules`). The profile, and so the data, stays the same.

```sh
git archive <ref> src | tar -x -C /tmp/base && ln -s "$PWD/node_modules" /tmp/base/node_modules
node scripts/search-perf/run.mjs --root /tmp/base
node scripts/search-perf/run.mjs
```

Timings move by a third between runs on a busy machine; alternate the two and compare medians.

## The data

Seeded from a fixed random seed:

- 5 years of messages. 70% in server 1, 12% in server 2, 10% in server 3, 8% in DMs. Channel 99
  of server 1 has 40 messages.
- 15% are by 40 imported authors that share one account, one of them named `Old Name`. The rest
  are by 400 users named `user2` to `user401`.
- 5% have an image, 1.5% a video, 1.5% another file; 6% have a bare URL and 2% a masked link.
- 47% contain the word `mirage`.
