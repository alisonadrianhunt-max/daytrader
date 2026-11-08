# Day Trader — Global Risk Intelligence

Day Trader is a browser-based dashboard that collects **data, analysis and recommendations on every major area of world risk**. It runs in any modern browser on **iPhone, Android, Windows 11 and Mac**, and can be installed to the home screen or desktop like an app. It is a Progressive Web App (PWA).

## Tabs

| Tab | What it covers | Live data sources |
|---|---|---|
| 🌐 Overview | World Risk Index plus a risk score for every area, and the highest-risk items right now | All of the below |
| ⚔️ Military Conflict | Strikes, troop movements, escalation, ceasefires | GDELT global news, Reddit |
| 🏦 World Financial System | Central banks, debt, banking stress, inflation, FX | GDELT, Hacker News |
| 📈 Stocks & NASDAQ | **Buy / Hold / Sell** signals for your watchlist, plus market news | Twelve Data (free key), GDELT |
| 🏛️ Political News | Elections, governments, sanctions, unrest | GDELT, Reddit |
| 🛡️ Cybersecurity Threats | Actively exploited CVEs, critical CVEs, breaches, ransomware | CISA KEV, NIST NVD, GDELT, Hacker News |
| 🌪️ Weather Events | Severe weather alerts, earthquakes, wildfires, storms, volcanoes | NOAA/NWS, USGS, NASA EONET, GDELT |
| 💬 Social Media Commentary | What people are discussing now | Reddit, Mastodon, Hacker News |
| 📰 Mainstream Headlines | Reuters, AP, BBC, Guardian, NYT, CNN, Al Jazeera, NPR, FT | GDELT (+ optional RSS) |
| 🤖 AI Daily News | AI research, products, regulation | GDELT, Hacker News, Reddit |
| ⭐ Your own tabs | Any topic you choose (Settings → Custom tabs) | GDELT + optional HN / Reddit / RSS |

### Analysis & recommendations

* **Risk scoring.** Every item gets a 0–100 risk score from weighted risk keywords and structured severity (earthquake magnitude, CVSS score, NWS severity, CISA "known ransomware use"). Each tab gets an aggregate score and level (Low → Guarded → Elevated → High → Severe) and a list of "risk drivers". The Overview combines the tabs into a World Risk Index.
* **Buy / Hold / Sell signals.** These come from transparent technical analysis: 20/50/200-day moving averages, RSI(14), MACD(12,26,9), 20-day momentum and volatility. Every signal lists exactly why it was given. *This is educational information, not financial advice.*
* **🧠 AI briefings (optional).** On any tab, Claude writes an analyst briefing covering the situation, key risks, market implications, what to watch, and a risk rating. It uses your own Anthropic API key, which is stored only in your browser.

## Getting started

No build step and no server code are needed: it is plain HTML, CSS and JavaScript modules.

```bash
npm start          # serves the app at http://localhost:8080
npm test           # runs the unit tests (Node 18+)
```

Then open **Settings** (⚙️) to add:

* a free **Twelve Data** API key (https://twelvedata.com/pricing) for stock prices and Buy/Hold/Sell signals
* an **Anthropic** API key (https://console.anthropic.com/) for AI briefings (optional)
* a CORS proxy URL (optional). Some RSS feeds block direct browser access, and a proxy lets them load.

Every news, weather, cyber and social tab works without any keys.

### Install on your devices

1. Deploy the app (see below) or serve it over HTTPS.
2. **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
3. **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.
4. **Windows 11 / Mac (Chrome or Edge):** click the install icon in the address bar. On Mac Safari, use File → *Add to Dock*.

### Deploy to GitHub Pages

The workflow `.github/workflows/pages.yml` runs the tests and publishes the site whenever `main` changes. You turn it on once: in the repository go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. The app will then be at `https://<owner>.github.io/daytrader/`.

## Adding tabs later

The app is built to grow:

* **Users** can add tabs at runtime from **Settings → Custom tabs** by giving keywords, a subreddit, a Hacker News search or RSS feeds.
* **Developers** add a built-in tab by appending one object to `BUILTIN_TABS` in `js/tabs/registry.js`. New data sources and new kinds of view each plug into a single registry.

See **[docs/ADDING_TABS.md](docs/ADDING_TABS.md)** for step-by-step instructions.

## Project layout

```
index.html               app shell
css/styles.css           responsive light/dark styles
sw.js                    service worker (offline + installable)
manifest.webmanifest     PWA manifest
js/app.js                tab bar, router, refresh loop, view registry
js/tabs/registry.js      ← tab definitions (add tabs here)
js/sources/adapters.js   ← data-source adapters (add sources here)
js/sources/index.js      loads, caches, de-duplicates and scores a tab's sources
js/sources/markets.js    price history (Twelve Data)
js/analysis/risk.js      risk scoring and aggregation
js/analysis/technicals.js  SMA / RSI / MACD / volatility and the Buy/Hold/Sell engine
js/ai/claude.js          optional Claude AI briefings
js/ui/*.js               views: feed, markets, overview, settings
tests/                   unit tests (node --test)
```

## Privacy & limits

* Settings and API keys are kept in your browser's local storage. They are sent only to the service each key belongs to.
* Data is cached locally, 15 minutes by default (you can change this). Prices are cached for 1 hour to stay within free API limits.
* GDELT allows one request every 5 seconds. Day Trader queues requests automatically, so scanning every tab takes about a minute the first time.
* Risk scores and signals are automated estimates. Always check the original sources before you act.
