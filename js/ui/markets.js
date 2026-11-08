// Stocks & NASDAQ view: Buy / Hold / Sell signals for the watchlist plus market news.

import { esc, safeUrl, timeAgo, riskBadge, $ } from './dom.js';
import { riskLevel } from '../analysis/risk.js';
import { analyzeSymbol } from '../sources/markets.js';
import { loadSettings, saveSettings, parseWatchlist } from '../core/settings.js';
import { store } from '../core/store.js';
import { tabHeader, errorsNotice, aiPanel, runBriefing } from './feed.js';

const fmt = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`);

function sparkline(closes) {
  const pts = closes.slice(-60);
  if (pts.length < 2) return '';
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const w = 120;
  const h = 32;
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${d}"/></svg>`;
}

function signalCard(sym, r) {
  if (!r) return `<li class="card signal skeleton"><b>${esc(sym)}</b><div></div></li>`;
  if (r.error) return `<li class="card signal"><div class="signal-head"><b>${esc(sym)}</b><span class="badge">N/A</span></div><p class="muted small">${esc(r.error)}</p></li>`;
  const s = r.signal;
  const i = s.indicators;
  return `
    <li class="card signal">
      <div class="signal-head">
        <div><b class="sym">${esc(sym)}</b> <span class="muted small">${esc(r.exchange)}</span></div>
        <span class="action action-${s.action.toLowerCase()}" title="Signal score ${s.score} (−100…+100)">${s.action}</span>
      </div>
      <div class="signal-price">
        <span class="price">${fmt(i.last)} <small class="muted">${esc(r.currency)}</small></span>
        <span class="${(i.change5d ?? 0) >= 0 ? 'pos' : 'neg'}">${pct(i.change5d)} 5d</span>
      </div>
      ${sparkline(r.closes)}
      <dl class="indicators">
        <div><dt>RSI 14</dt><dd>${fmt(i.rsi, 0)}</dd></div>
        <div><dt>SMA 50</dt><dd>${fmt(i.sma50)}</dd></div>
        <div><dt>SMA 200</dt><dd>${fmt(i.sma200)}</dd></div>
        <div><dt>20d</dt><dd>${pct(i.change20d)}</dd></div>
      </dl>
      <details><summary class="small">Why ${s.action}? (confidence: ${s.confidence})</summary><ul class="reasons">${s.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
    </li>`;
}

export function renderMarkets(root, tab, { refresh }) {
  const draw = () => {
    const settings = loadSettings();
    const symbols = parseWatchlist(settings.watchlist);
    const data = store.tabData.get(tab.id);
    const news = [...(data?.items || [])].slice(0, 25);
    const counts = { BUY: 0, HOLD: 0, SELL: 0 };
    for (const s of symbols) {
      const r = store.markets.get(s);
      if (r?.signal) counts[r.signal.action]++;
    }
    root.innerHTML = `
      ${tabHeader(tab, data)}
      <div class="notice">⚠️ Signals are generated automatically from price trends (moving averages, RSI, MACD). They are educational information only — <b>not financial advice</b>. Always do your own research.</div>
      ${!settings.twelveDataKey ? `<div class="notice warn">To load live prices, get a free API key at <a href="https://twelvedata.com/pricing" target="_blank" rel="noopener noreferrer">twelvedata.com</a> and paste it in <a href="#/settings">Settings</a>.</div>` : ''}
      <form class="toolbar watchlist-form">
        <input name="watchlist" class="search" value="${esc(settings.watchlist)}" aria-label="Watchlist symbols" placeholder="Symbols, comma separated (e.g. AAPL, MSFT)">
        <button class="btn" type="submit">Save watchlist</button>
        <button class="btn refresh" type="button">↻ Refresh</button>
        <button class="btn primary ai" type="button">🧠 AI briefing</button>
      </form>
      <p class="muted small">Signals: <b class="pos">${counts.BUY} Buy</b> · <b>${counts.HOLD} Hold</b> · <b class="neg">${counts.SELL} Sell</b> · prices update hourly (free-plan limits)</p>
      ${aiPanel(tab.id)}
      <ul class="signals">${symbols.map((s) => signalCard(s, store.markets.get(s))).join('')}</ul>
      <h2>Market news</h2>
      ${errorsNotice(tab, data)}
      <ul class="items compact">${news
        .map((it) => `<li class="card item">${riskBadge(it.risk, riskLevel(it.risk))} <a class="item-title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a> <span class="muted small">${esc(it.source)} · ${timeAgo(it.publishedAt)}</span></li>`)
        .join('') || '<li class="card muted">Loading market news…</li>'}</ul>
    `;
    $('.watchlist-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings({ watchlist: parseWatchlist(new FormData(e.target).get('watchlist')).join(', ') });
      loadSignals(draw);
    });
    $('.refresh', root).addEventListener('click', () => {
      refresh(true);
      loadSignals(draw, true);
    });
    $('.ai', root).addEventListener('click', () => {
      const lines = symbols
        .map((s) => store.markets.get(s))
        .filter((r) => r?.signal)
        .map((r) => `${r.symbol}: ${r.signal.action} (score ${r.signal.score}, RSI ${fmt(r.signal.indicators.rsi, 0)}, 20d ${pct(r.signal.indicators.change20d)}) — ${r.signal.reasons.join('; ')}`);
      const extra = lines.length ? `Technical signals for the watchlist:\n${lines.join('\n')}` : 'No price data loaded for the watchlist.';
      runBriefing(tab, data?.items || [], draw, extra);
    });
  };
  loadSignals(draw);
  return draw;
}

let inFlight = null;
async function loadSignals(draw, force = false) {
  if (inFlight && !force) return inFlight;
  const symbols = parseWatchlist(loadSettings().watchlist);
  inFlight = (async () => {
    for (const s of symbols) {
      if (!force && store.markets.get(s)?.signal) continue;
      try {
        store.markets.set(s, await analyzeSymbol(s, { force }));
      } catch (err) {
        store.markets.set(s, { error: err.message });
        if (/API key/i.test(err.message)) {
          for (const rest of symbols) if (!store.markets.get(rest)) store.markets.set(rest, { error: err.message });
          break;
        }
      }
      draw();
    }
    draw();
  })().finally(() => (inFlight = null));
  return inFlight;
}
