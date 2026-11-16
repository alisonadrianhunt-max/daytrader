# Adding tabs and sources to Day Trader

Day Trader's built-in tabs are filled by a **data pipeline** (`pipeline/build.mjs`) that runs on GitHub Actions every 30 minutes. It fetches every source on GitHub's servers, so no API keys are needed and browser restrictions (CORS) don't apply. It cleans and checks the data, tracks how reliable each source is, and publishes `data/*.json` alongside the app. The browser then only reads those files.

There are three ways to extend it.

## 1. Custom tab from the app (no code)

Open **⚙️ Settings → Custom tabs** and fill in a tab name, an icon, **news keywords** (searched live across global news through GDELT), and optionally a **Hacker News search** and **RSS feed URLs**. The tab appears straight away, is scored for risk, shows on the Overview and supports AI briefings. Custom tabs are stored in the browser they were created in, and fetch their data live from that browser.

## 2. Add a source to an existing tab

Add one line to `SOURCES` in `pipeline/sources.mjs`:

```js
rss('reuters-africa', 'Example Africa Desk', 'Africa', ['headlines', 'politics'], 'https://example.com/africa/rss.xml'),
```

The arguments are: a unique id, the display name, a region (`Global`, `Americas`, `Europe`, `Middle East`, `Africa` or `Asia-Pacific`), the tabs it feeds, and the feed URL. Optional extras:

* `{ filter: 'conflict' | 'politics' | 'ai' }` keeps only items on that topic (useful for general feeds).
* `{ maxAgeDays: 30 }` keeps older items, for slow official feeds such as central-bank or cyber-agency alerts. The default is 3 days.
* `{ maxItems: 15 }` caps how many items the source contributes.

Other source types (`gdelt`, `usgs`, `emsc`, `nws`, `eonet`, `cisa`, `nvd`, `hn`, `mastodon`, `lemmy`) are written as objects; copy an existing entry.

Run `npm test` (it checks the catalogue is well formed), then push. The next pipeline run reports the new source's status in the Actions job summary and in the app under **Settings → Data sources**.

**Reliability rules (automatic):**
* Every item must have a title, a valid http(s) link and a date, and must be recent. Duplicates are removed, both within a source and across sources.
* A source that fails **6 runs in a row** (about 3 hours) is hidden from the dashboard, but the pipeline keeps trying it and shows it again as soon as it recovers.
* Reliability is the percentage of the last 48 runs (about one day) that succeeded.

## 3. Add a built-in tab

1. Add an entry to `BUILTIN_TABS` in `js/tabs/registry.js`:

   ```js
   {
     id: 'energy',                 // used in the URL (#/energy) and as the data file name
     title: 'Energy',
     icon: '⚡',
     snapshot: true,               // data comes from the pipeline
     description: 'Power grids, oil and gas supply, and energy policy worldwide.',
     lexicon: { blackout: 20, embargo: 20 },        // optional extra risk keywords
     aiFocus: 'Focus on supply disruption and price impact.',  // optional
   },
   ```

2. Add sources for it in `pipeline/sources.mjs` with `tabs: ['energy']`. The tests require at least 3 sources from at least 2 regions.

### Prices (commodities, indices, stocks, FX, rates)

Price lists live in `PRICE_GROUPS` in `pipeline/sources.mjs`, keyed by tab (`commodities`, `markets`, `finance`). Each item is `{ symbol, name, unit?, stooq? }`:

* `symbol` is a Yahoo Finance symbol, e.g. `GC=F` (gold futures), `^N225` (Nikkei) or `EURUSD=X`.
* `stooq` is an optional fallback symbol on Stooq, used if Yahoo fails.

A tab shows a price group by setting `priceGroups: '<key>'`. Symbols that fail validation (too little history, stale prices, implausible jumps) are left out of the dashboard automatically.

### A new kind of view

Create `js/ui/myview.js` exporting `renderMyView(root, tab, ctx)`. It returns a `draw()` function and reads its data from `store.tabData.get(tab.id)`. Register it in `VIEWS` in `js/app.js`, and set `view: 'myview'` on the tab. Add any new files to `SHELL` in `sw.js` and bump `VERSION`.

## Running the pipeline yourself

```bash
npm run data      # writes ./data (needs internet access)
npm start         # serves the app with that data at http://localhost:8080
```
