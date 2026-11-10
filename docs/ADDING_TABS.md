# Adding tabs to Day Trader

There are three ways to extend Day Trader, from easiest to most powerful.

## 1. Custom tab from the app (no code)

Open **⚙️ Settings → Custom tabs** and fill in:

* **Tab name** and **icon** (any emoji)
* **News keywords** (comma separated). These search global news through GDELT. Multi-word phrases are fine, e.g. `oil, OPEC, crude prices`.
* Optional: a **Hacker News search**, a **subreddit**, and **RSS feed URLs**.

The tab appears in the tab bar straight away. It is scored for risk, it shows up on the Overview, and it supports AI briefings. Custom tabs are stored in the browser they were created in.

## 2. Built-in tab (one object of code)

Add an entry to `BUILTIN_TABS` in `js/tabs/registry.js`:

```js
{
  id: 'energy',                       // unique, used in the URL: #/energy
  title: 'Energy & Commodities',
  icon: '🛢️',
  description: 'Oil, gas, power grids and critical minerals.',
  sources: [
    { type: 'gdelt', query: '(oil OR OPEC OR "natural gas" OR "power grid" OR lithium)' },
    { type: 'reddit', subreddit: 'energy' },
    { type: 'hn', query: 'oil OR energy OR grid', days: 3 },
    { type: 'rss', url: 'https://example.com/feed.xml', name: 'Example Energy' },
  ],
  lexicon: { blackout: 20, embargo: 20, 'supply cut': 15 },  // optional extra risk keywords
  aiFocus: 'Focus on supply disruption and price impact.',   // optional AI briefing focus
},
```

Also add the tab to the "all required risk areas" test in `tests/registry.test.mjs` if it is a core tab. That's all.

### Available source types

| `type` | Options | Notes |
|---|---|---|
| `gdelt` | `query`, `max` (default 50), `timespan` (default `24h`) | Global news. Supports `OR`, `"phrases"`, `domain:example.com` |
| `hn` | `query` (words joined by `OR`), `days`, or `frontPage: true` | Hacker News via Algolia |
| `reddit` | `subreddit`, optional `filter` (RegExp on titles) | Hot posts |
| `mastodon` | `tag`, `instance` (default `mastodon.social`) | Public hashtag timeline |
| `usgs` | `feed` (default `4.5_day`) | Earthquakes |
| `nws` | – | US severe and extreme weather alerts |
| `eonet` | `days` | NASA natural events |
| `cisa` | `max` | Known exploited vulnerabilities |
| `nvd` | `days`, `max` | Critical CVEs |
| `rss` | `url`, `name` | Needs the feed to allow CORS, or a CORS proxy set in Settings |

### Changing the commodities list

The Commodities tab reads its groups from the `groups` array on the `commodities` entry in `js/tabs/registry.js`. Each group is `{ id, title, icon, items: [{ symbol, name }] }`. To add a commodity, add `{ symbol: 'XYZ', name: 'Something' }` to a group, or add a new group. The symbol must be a ticker Twelve Data supports on your plan; US-listed ETFs that track the commodity work on the free plan.

## 3. New source type or new view

* **New data source:** write an async function in `js/sources/adapters.js` that returns normalized items `{ id, title, url, source, publishedAt, summary, severity (0..1), tags }`, add it to `ADAPTERS`, and add a label in `describeSource`. The API must allow browser (CORS) requests. If it has strict rate limits, add its host to `HOST_MIN_INTERVAL_MS` in `js/core/fetcher.js`.
* **New view type** (for example a map or a chart): create `js/ui/myview.js` exporting `renderMyView(root, tab, ctx)`. It returns a `draw()` function and reads data from `store.tabData.get(tab.id)`. Register it in `VIEWS` in `js/app.js` and set `view: 'myview'` on the tab.
* Add any new files to the `SHELL` list in `sw.js` so they work offline, and bump `VERSION`.
