// Commodities view: metals, energy and agriculture grouped by type, each with
// a Buy / Hold / Sell signal and a summary verdict per group.

import { esc, safeUrl, timeAgo, riskBadge, $, $$ } from './dom.js';
import { riskLevel } from '../analysis/risk.js';
import { loadSettings } from '../core/settings.js';
import { store } from '../core/store.js';
import { tabHeader, errorsNotice, aiPanel, runBriefing } from './feed.js';
import { signalCard, loadSignals } from './markets.js';

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

export function renderCommodities(root, tab, { refresh }) {
  const groups = tab.groups || [];
  const allSymbols = [...new Set(groups.flatMap((g) => g.items.map((i) => i.symbol)))];
  const ui = store.ui(tab.id, { group: 'all' });

  const draw = () => {
    const settings = loadSettings();
    const data = store.tabData.get(tab.id);
    const shown = ui.group === 'all' ? groups : groups.filter((g) => g.id === ui.group);
    const overall = groupVerdict(allSymbols.map((s) => store.markets.get(s)));

    root.innerHTML = `
      ${tabHeader(tab, data)}
      <div class="notice">⚠️ Signals are generated automatically from price trends (moving averages, RSI, MACD) of exchange-traded funds that track each commodity. They are educational information only — <b>not financial advice</b>. ETF prices can differ from spot or futures prices.</div>
      ${!settings.twelveDataKey ? `<div class="notice warn">To load commodity prices, get a free API key at <a href="https://twelvedata.com/pricing" target="_blank" rel="noopener noreferrer">twelvedata.com</a> and paste it in <a href="#/settings">Settings</a>.</div>` : ''}
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Commodity group">
          <button class="chip ${ui.group === 'all' ? 'active' : ''}" data-group="all">All</button>
          ${groups.map((g) => `<button class="chip ${ui.group === g.id ? 'active' : ''}" data-group="${esc(g.id)}">${esc(g.icon)} ${esc(g.title)}</button>`).join('')}
        </div>
      </div>
      <div class="toolbar">
        <button class="btn refresh">↻ Refresh</button>
        <button class="btn primary ai">🧠 AI briefing</button>
        <span class="muted small">Overall: <b class="pos">${overall.counts.BUY} Buy</b> · <b>${overall.counts.HOLD} Hold</b> · <b class="neg">${overall.counts.SELL} Sell</b>
          · ${overall.loaded}/${allSymbols.length} loaded · free plan loads ~8 prices a minute, then caches for an hour</span>
      </div>
      ${aiPanel(tab.id)}
      ${shown
        .map((g) => {
          const v = groupVerdict(g.items.map((i) => store.markets.get(i.symbol)));
          return `<section class="commodity-group">
            <div class="group-head">
              <h2><span aria-hidden="true">${esc(g.icon)}</span> ${esc(g.title)}</h2>
              ${v.action ? `<span class="action action-${v.action.toLowerCase()}" title="Average signal score ${v.score}">Group: ${v.action}</span>` : '<span class="muted small">loading…</span>'}
            </div>
            <ul class="signals">${g.items.map((i) => signalCard(i.symbol, store.markets.get(i.symbol), i.name)).join('')}</ul>
          </section>`;
        })
        .join('')}
      <h2>Commodity news</h2>
      ${errorsNotice(tab, data)}
      <ul class="items compact">${(data?.items || [])
        .slice(0, 25)
        .map((it) => `<li class="card item">${riskBadge(it.risk, riskLevel(it.risk))} <a class="item-title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a> <span class="muted small">${esc(it.source)} · ${timeAgo(it.publishedAt)}</span></li>`)
        .join('') || '<li class="card muted">Loading commodity news…</li>'}</ul>
    `;

    $$('[data-group]', root).forEach((b) => b.addEventListener('click', () => ((ui.group = b.dataset.group), draw())));
    $('.refresh', root).addEventListener('click', () => {
      refresh(true);
      loadSignals(allSymbols, draw, true);
    });
    $('.ai', root).addEventListener('click', () => {
      const lines = groups.map((g) => {
        const rows = g.items
          .map((i) => {
            const r = store.markets.get(i.symbol);
            if (!r?.signal) return null;
            const ind = r.signal.indicators;
            return `  ${i.name} (${i.symbol}): ${r.signal.action}, score ${r.signal.score}, RSI ${ind.rsi?.toFixed(0) ?? '—'}, 20d ${ind.change20d?.toFixed(1) ?? '—'}%`;
          })
          .filter(Boolean);
        return rows.length ? `${g.title}:\n${rows.join('\n')}` : `${g.title}: no price data loaded`;
      });
      runBriefing(tab, data?.items || [], draw, `Technical signals by commodity group (ETF proxies):\n${lines.join('\n')}`);
    });
  };

  loadSignals(allSymbols, draw);
  return draw;
}
