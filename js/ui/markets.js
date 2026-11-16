// Stocks & NASDAQ view: Buy / Hold / Sell signals for your watchlist, world
// indices, major stocks and ETFs, plus market news.

import { esc, $, $$ } from './dom.js';
import { analyzeSymbol } from '../sources/markets.js';
import { loadSettings, saveSettings, parseWatchlist } from '../core/settings.js';
import { store } from '../core/store.js';
import { tabHeader, errorsNotice, aiPanel, runBriefing, sourcesLine } from './feed.js';
import { usePriceGroups, groupSections, priceStatusLine } from './pricegroups.js';
import { newsList } from './commodities.js';

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

/** One Buy/Hold/Sell card. `label` (optional) is a friendly name shown above the ticker. */
export function signalCard(sym, r, label = '', unit = '') {
  const title = label ? `<b class="sym">${esc(label)}</b> <span class="muted small">${esc(sym)}</span>` : `<b class="sym">${esc(sym)}</b>`;
  if (!r) return `<li class="card signal skeleton"><div>${title}</div><div></div></li>`;
  if (r.error) return `<li class="card signal"><div class="signal-head"><div>${title}</div><span class="badge">N/A</span></div><p class="muted small">${esc(r.error)}</p></li>`;
  const s = r.signal;
  const i = s.indicators;
  return `
    <li class="card signal">
      <div class="signal-head">
        <div>${title}${label ? '' : ` <span class="muted small">${esc(r.exchange)}</span>`}</div>
        <span class="action action-${s.action.toLowerCase()}" title="Signal score ${s.score} (−100…+100)">${s.action}</span>
      </div>
      <div class="signal-price">
        <span class="price">${fmt(i.last)} <small class="muted">${esc(unit || r.currency || '')}</small></span>
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

const watchSymbols = () => parseWatchlist(loadSettings().watchlist);

export function renderMarkets(root, tab, { refresh }) {
  const ui = store.ui(tab.id, { group: 'watchlist' });
  let force = false;

  const draw = () => {
    const settings = loadSettings();
    const symbols = parseWatchlist(settings.watchlist);
    const state = usePriceGroups(tab.priceGroups, draw, { force, extraSymbols: symbols });
    force = false;
    const groups = state.groups || [];
    const data = store.tabData.get(tab.id);
    const counts = { BUY: 0, HOLD: 0, SELL: 0 };
    for (const s of symbols) {
      const r = store.markets.get(s);
      if (r?.signal) counts[r.signal.action]++;
    }
    const nameOf = new Map(groups.flatMap((g) => g.items.map((i) => [i.symbol, i.name])));
    const label = (s) => (nameOf.get(s) && nameOf.get(s) !== s ? nameOf.get(s) : '');
    const watchlistHtml = `
      <form class="toolbar watchlist-form">
        <input name="watchlist" class="search" value="${esc(settings.watchlist)}" aria-label="Watchlist symbols" placeholder="Symbols, comma separated (e.g. AAPL, MSFT)">
        <button class="btn" type="submit">Save watchlist</button>
        <button class="btn refresh" type="button">↻ Refresh</button>
        <button class="btn primary ai" type="button">🧠 AI briefing</button>
      </form>
      <p class="muted small">Watchlist: <b class="pos">${counts.BUY} Buy</b> · <b>${counts.HOLD} Hold</b> · <b class="neg">${counts.SELL} Sell</b>. Every symbol in the other groups works without a key; any other symbol needs a free Twelve Data key in Settings.</p>
      ${aiPanel(tab.id)}
      <ul class="signals">${symbols.map((s) => signalCard(s, store.markets.get(s), label(s))).join('')}</ul>`;
    const groupsHtml = `
      <div class="toolbar"><button class="btn refresh" type="button">↻ Refresh</button><button class="btn primary ai" type="button">🧠 AI briefing</button></div>
      ${aiPanel(tab.id)}
      ${groupSections(ui.group === 'all' ? groups : groups.filter((g) => g.id === ui.group))}`;

    root.innerHTML = `
      ${tabHeader(tab, data)}
      <div class="notice">⚠️ Signals are generated automatically from price trends (moving averages, RSI, MACD). They are educational information only — <b>not financial advice</b>. Always do your own research.</div>
      ${priceStatusLine(state)}
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Market group">
          <button class="chip ${ui.group === 'watchlist' ? 'active' : ''}" data-group="watchlist">⭐ My watchlist</button>
          ${groups.map((g) => `<button class="chip ${ui.group === g.id ? 'active' : ''}" data-group="${esc(g.id)}">${esc(g.icon)} ${esc(g.title)}</button>`).join('')}
          <button class="chip ${ui.group === 'all' ? 'active' : ''}" data-group="all">All</button>
        </div>
      </div>
      ${ui.group === 'watchlist' ? watchlistHtml : groupsHtml}
      <h2>Market news</h2>
      ${errorsNotice(tab, data)}
      ${sourcesLine(data)}
      ${newsList(data)}
    `;
    $$('[data-group]', root).forEach((b) => b.addEventListener('click', () => ((ui.group = b.dataset.group), draw())));
    $('.watchlist-form', root)?.addEventListener('submit', (e) => {
      e.preventDefault();
      saveSettings({ watchlist: parseWatchlist(new FormData(e.target).get('watchlist')).join(', ') });
      loadSignals(watchSymbols(), draw);
    });
    $('.refresh', root).addEventListener('click', () => {
      refresh(true);
      force = true;
      draw();
    });
    $('.ai', root).addEventListener('click', () => {
      const shown = ui.group === 'watchlist' ? symbols : groups.filter((g) => ui.group === 'all' || g.id === ui.group).flatMap((g) => g.items.map((i) => i.symbol));
      const lines = shown
        .map((s) => store.markets.get(s))
        .filter((r) => r?.signal)
        .map((r) => `${r.name && r.name !== r.symbol ? `${r.name} (${r.symbol})` : r.symbol}: ${r.signal.action} (score ${r.signal.score}, RSI ${fmt(r.signal.indicators.rsi, 0)}, 20d ${pct(r.signal.indicators.change20d)}) — ${r.signal.reasons.join('; ')}`);
      runBriefing(tab, data?.items || [], draw, lines.length ? `Technical signals:\n${lines.join('\n')}` : 'No price data loaded.');
    });
  };
  return draw;
}

const inFlight = new Map();
/** Symbols currently being loaded (so overlapping calls don't load them twice). */
export const pendingSymbols = new Set();

/**
 * Loads price history + signals for `symbols` one at a time, calling draw()
 * as each lands. Concurrent calls for the same list share one run.
 */
export function loadSignals(symbols, draw, force = false) {
  const key = symbols.join(',');
  if (inFlight.has(key) && !force) return inFlight.get(key);
  const run = (async () => {
    let changed = false;
    for (const s of symbols) {
      if (pendingSymbols.has(s) || (!force && store.markets.get(s)?.signal)) continue;
      pendingSymbols.add(s);
      try {
        store.markets.set(s, await analyzeSymbol(s, { force }));
      } catch (err) {
        store.markets.set(s, { error: err.message });
      } finally {
        pendingSymbols.delete(s);
      }
      changed = true;
      draw();
    }
    if (changed) draw();
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}
