// Shared rendering for grouped price signals (Commodities, Stocks, Finance).
// Groups and prices come from data/prices.json, published by the pipeline.

import { esc, timeAgo } from './dom.js';
import { store } from '../core/store.js';
import { isStale } from '../core/snapshot.js';
import { loadPriceSnapshot } from '../sources/markets.js';
import { signalCard, loadSignals, pendingSymbols } from './markets.js';

/** Average the signal scores of a group into one verdict. */
export function groupVerdict(results) {
  const scored = results.filter((r) => r?.signal);
  const counts = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const r of scored) counts[r.signal.action]++;
  if (!scored.length) return { action: null, score: null, counts, loaded: 0 };
  const score = Math.round(scored.reduce((a, r) => a + r.signal.score, 0) / scored.length);
  const action = score >= 30 ? 'BUY' : score <= -30 ? 'SELL' : 'HOLD';
  return { action, score, counts, loaded: scored.length };
}

/**
 * Loads the groups for `key` ('commodities' | 'markets' | 'finance') and their
 * signals, calling draw() as data lands. Returns the cached state immediately.
 */
export function usePriceGroups(key, draw, { force = false, extraSymbols = [] } = {}) {
  const state = store.priceGroups.get(key) || { groups: null, error: null, generatedAt: null };
  store.priceGroups.set(key, state);
  if (!state.loading && (force || !state.groups)) {
    state.loading = true;
    loadPriceSnapshot({ force })
      .then((snap) => {
        state.groups = snap.groups?.[key] || [];
        state.generatedAt = snap.generatedAt;
        state.error = null;
      })
      .catch((err) => {
        state.groups = [];
        state.error = err.message;
      })
      .finally(() => {
        state.loading = false;
        draw();
        const symbols = [...new Set([...extraSymbols, ...state.groups.flatMap((g) => g.items.map((i) => i.symbol))])];
        loadSignals(symbols, draw, force);
      });
  } else if (state.groups) {
    // Only symbols never attempted (e.g. just added to the watchlist) — avoids redraw loops.
    const missing = extraSymbols.filter((s) => !store.markets.has(s) && !pendingSymbols.has(s));
    if (missing.length) loadSignals(missing, draw);
  }
  return state;
}

export function priceStatusLine(state) {
  if (state.error) return `<div class="notice warn">Prices unavailable: ${esc(state.error)}</div>`;
  if (!state.generatedAt) return '';
  return `<p class="muted small">Prices: daily closes from Yahoo Finance / Stooq, updated ${timeAgo(Date.parse(state.generatedAt))}${
    isStale(state.generatedAt) ? ' — <b class="neg">data is older than usual</b>' : ''
  }. No API key needed.</p>`;
}

export function groupSections(groups) {
  return groups
    .map((g) => {
      const v = groupVerdict(g.items.map((i) => store.markets.get(i.symbol)));
      return `<section class="commodity-group">
        <div class="group-head">
          <h2><span aria-hidden="true">${esc(g.icon)}</span> ${esc(g.title)}</h2>
          ${v.action ? `<span class="action action-${v.action.toLowerCase()}" title="Average signal score ${v.score}">Group: ${v.action}</span>` : '<span class="muted small">loading…</span>'}
        </div>
        <ul class="signals">${g.items.map((i) => signalCard(i.symbol, store.markets.get(i.symbol), i.name === i.symbol ? '' : i.name, i.unit)).join('')}</ul>
      </section>`;
    })
    .join('');
}

const pct = (n) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—');
const num = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 4 : 2 }) : '—');

/** Compact table for indicators (rates, FX, volatility): level, change and trend. */
export function indicatorTable(groups) {
  const rows = groups.flatMap((g) =>
    g.items.map((i) => {
      const r = store.markets.get(i.symbol);
      const ind = r?.signal?.indicators;
      const trend = !r?.signal ? '…' : r.signal.score >= 30 ? '▲ Rising' : r.signal.score <= -30 ? '▼ Falling' : '◆ Flat';
      const cls = !r?.signal ? '' : r.signal.score >= 30 ? (r.invert ? 'neg' : 'pos') : r.signal.score <= -30 ? (r.invert ? 'pos' : 'neg') : '';
      return `<tr><td>${esc(g.icon)} ${esc(i.name)}</td><td class="num">${r?.error ? '<span class="muted small">n/a</span>' : num(ind?.last)}</td><td class="num">${pct(ind?.change5d)}</td><td class="num">${pct(ind?.change20d)}</td><td class="${cls}">${trend}</td></tr>`;
    }),
  );
  if (!rows.length) return '';
  return `<div class="card table-wrap"><table class="indicators-table"><thead><tr><th>Indicator</th><th class="num">Level</th><th class="num">5 days</th><th class="num">20 days</th><th>Trend</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <p class="muted small">Trend uses the same moving-average/RSI/MACD scoring as the Buy/Hold/Sell signals. For the VIX, rising means more market stress.</p></div>`;
}
