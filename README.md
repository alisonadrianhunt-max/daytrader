# Day Trader — Global Risk Intelligence

Day Trader is a browser-based dashboard that collects **data, analysis and recommendations on every major area of world risk**. It runs in any modern browser on **iPhone, Android, Windows 11 and Mac**, and can be installed to the home screen or desktop like an app. It is a Progressive Web App (PWA).

**No API keys are needed.** All data is collected every 30 minutes by a pipeline running on GitHub Actions and published with the site.

## Tabs

| Tab | What it covers | Main sources (all regions tagged) |
|---|---|---|
| 🌐 Overview | World Risk Index, a risk score for every area, the highest-risk items right now, and data freshness | Everything below |
| ⚔️ Military Conflict | Strikes, troop movements, escalation, ceasefires | Defense News, Breaking Defense, Military Times, War on the Rocks, Kyiv Independent, UN Peace & Security, International Crisis Group, The Diplomat, plus conflict coverage from BBC, Al Jazeera, Arab News, SCMP, The Hindu, Africanews, MercoPress |
| 🏦 World Financial System | Central banks, rates, currencies, market stress, crypto, financial news | Fed, ECB, Bank of England, Reserve Bank of Australia, BIS, CNBC, MarketWatch, FT, BBC, Guardian, SCMP, Economic Times, BusinessDay (Nigeria). Indicators: VIX, US Treasury yields (3-month to 30-year), US Dollar Index, 8 currency pairs (ECB reference rates), Bitcoin, Ether |
| 📈 Stocks & NASDAQ | **Buy / Hold / Sell** signals for your watchlist, 38 major stocks, market ETFs, and US and 18 international stock markets | Prices: Cboe, Yahoo Finance; international markets use country ETFs (labelled). News: MarketWatch, FT, BBC, Investing.com, Economic Times, SCMP, Guardian, BusinessDay, Arab News |
| 🪙 Commodities | Gold, silver, platinum, palladium; copper, base metals, lithium, uranium; WTI, Brent, natural gas, gasoline; corn, wheat, soybeans; sugar, an agriculture basket and a broad commodities basket. Grouped by type, each with a **Buy / Hold / Sell** signal and a group verdict | Futures prices (Yahoo Finance / Stooq) with labelled ETF fallbacks via Cboe. News: OilPrice, MINING.COM, Investing.com, CNBC Energy, plus commodity coverage from BBC, SCMP, Economic Times, BusinessDay, Daily Maverick, Arab News |
| 🏛️ Political News | Elections, governments, sanctions, diplomacy | Politico (US & Europe), NPR, Guardian, BBC, Foreign Policy, Euractiv, SCMP, The Hindu, Al Jazeera, Africanews, MercoPress, International Crisis Group, UN News |
| 🛡️ Cybersecurity Threats | Actively exploited and critical vulnerabilities, national cyber alerts, breaches, ransomware | CISA KEV & advisories, NIST NVD, UK NCSC, CERT-EU, SANS ISC, Krebs, BleepingComputer, The Hacker News, The Record, SecurityWeek, Dark Reading, ESET, Hacker News |
| 🌪️ Weather & Hazards | Disaster alerts, earthquakes, cyclones, tsunamis, volcanoes, wildfires, severe weather | GDACS (UN/EU), USGS, EMSC, US National Weather Service, National Hurricane Center, Pacific Tsunami Warning Center, Smithsonian volcano reports, NASA EONET, UN climate news, plus hazard coverage from BBC, SCMP, Africanews, Al Jazeera |
| 💬 Social Media Commentary | What people are discussing now | Mastodon, Lemmy, Bluesky (Reuters, AP), Reddit r/worldnews, Hacker News |
| 📰 Mainstream Headlines | Top stories from every continent | BBC, Guardian, DW, France 24, Euronews, Sky, NYT, NPR, CBC, ABC (US & Australia), Al Jazeera, Arab News, Africanews, AllAfrica, Premium Times, Daily Maverick, SCMP, Japan Times, The Hindu, Times of India, Straits Times, CNA, MercoPress, UN News |
| 🤖 AI Daily News | AI research, products, regulation | The Verge, TechCrunch, MIT Technology Review, Ars Technica, Guardian, BBC, SCMP, OpenAI, Google DeepMind, Hugging Face, arXiv, Hacker News |
| ⭐ Your own tabs | Any topic you choose (Settings → Custom tabs) | GDELT + optional Hacker News / RSS, fetched live in your browser |

The live list of sources, and whether each one is working, is under **Settings → Data sources** and in each tab's "sources reporting" line. Every news item is labelled with its region, and news tabs can be filtered by region.

## Data quality & reliability

* **Collected on GitHub's servers every 30 minutes.** Browser restrictions (CORS) and API keys don't apply, and visitors' browsers only load small files from the app's own address.
* **Checked before publishing.** Every item must have a title, a working link and a date, and must be recent (3 days by default; longer for slow official feeds). Tracking parameters are stripped. Duplicates are removed within a source and across sources, keeping the earliest report.
* **Prices are validated and have fallbacks.** A symbol needs at least 60 days of history, must not be stale, and must not contain implausible jumps. Each symbol tries several keyless providers in order: official sources first (US Treasury, ECB), then Yahoo Finance, Stooq, Cboe, Coinbase and FRED, and finally a tracking ETF. Every price card says which source was used, and when an ETF stood in.
* **Failing sources are removed automatically.** Every source's success is recorded on every run. A source that fails **6 runs in a row (about 3 hours)** is hidden from the dashboard, and it returns as soon as it recovers. Reliability is shown as the success rate over the last 48 runs.
* **Freshness is shown everywhere.** Each tab shows when its data was collected, and warns if that was more than 2 hours ago.
* **Safeguards on each run.** A run has time budgets and a circuit breaker, so one slow or blocked provider can't hold up the whole collection. If a run fails entirely, the site keeps serving the last good data.

## Analysis & recommendations

* **Risk scoring.** Every item gets a 0–100 risk score from weighted risk keywords and structured severity: earthquake magnitude, GDACS alert colour, CVSS score, NWS severity, and CISA "known ransomware use". Each tab gets an overall score and level (Low → Guarded → Elevated → High → Severe) and a list of "risk drivers". The Overview combines the tabs into a World Risk Index.
* **Buy / Hold / Sell signals** (stocks, indices and commodities). These come from transparent technical analysis: 20/50/200-day moving averages, RSI(14), MACD(12,26,9), 20-day momentum and volatility. Every signal lists exactly why it was given, and groups get an overall verdict. *This is educational information, not financial advice.*
* **🧠 AI briefings (optional).** On any tab, Claude writes an analyst briefing covering the situation, key risks, market implications, what to watch, and a risk rating. It uses your own Anthropic API key, stored only in your browser.

## Getting started

The app is plain HTML, CSS and JavaScript modules, with no build step. The data pipeline is a dependency-free Node script.

```bash
npm test           # unit tests (Node 20+)
npm run data       # collect data into ./data (needs internet)
npm start          # serve the app at http://localhost:8080
```

Optional keys, in **Settings**:

* **Anthropic** API key: enables AI briefings.
* **Twelve Data** API key: lets you track watchlist symbols that aren't in the built-in lists.

### Install on your devices

1. Open https://alisonadrianhunt-max.github.io/daytrader/
2. **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
3. **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.
4. **Windows 11 / Mac (Chrome or Edge):** click the install icon in the address bar. On Mac Safari, use File → *Add to Dock*.

### Deployment

`.github/workflows/pages.yml` runs the tests, collects data, and deploys to GitHub Pages:

* on every push to `main`;
* every 30 minutes, on a schedule;
* on demand, using **Actions → Test, collect data & deploy → Run workflow**.

Each run's job summary has a full source report. Note: GitHub pauses scheduled workflows in a repository with no activity for 60 days. Re-enable it from the Actions tab if that happens.

## Adding tabs and sources

See **[docs/ADDING_TABS.md](docs/ADDING_TABS.md)**. In short:

* add a source → one line in `pipeline/sources.mjs`;
* add a tab → one entry in `js/tabs/registry.js`, plus sources tagged with its id;
* add a commodity, index or stock → one line in `PRICE_GROUPS`.

## Project layout

```
index.html                 app shell
css/styles.css             responsive light/dark styles
sw.js                      service worker (offline + installable)
pipeline/sources.mjs       ← every data source and price symbol
pipeline/build.mjs         collector: fetch, validate, dedupe, health tracking, write data/
js/app.js                  tab bar, router, refresh loop, view registry
js/tabs/registry.js        ← tab definitions
js/core/snapshot.js        reads data/*.json
js/sources/                tab loading, live adapters for custom tabs, prices
js/analysis/               risk scoring; SMA / RSI / MACD Buy/Hold/Sell engine
js/ai/claude.js            optional Claude AI briefings
js/ui/*.js                 views: feed, markets, commodities, price groups, overview, settings
tests/                     unit tests (node --test)
```

## Privacy

* Settings and API keys are kept in your browser's local storage, and are sent only to the service each key belongs to.
* Risk scores and signals are automated estimates. Always check the original sources before you act.
