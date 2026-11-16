// Commodities view: metals, energy, grains, softs and livestock grouped by
// type, each with a Buy / Hold / Sell signal and a verdict per group.
// Prices are real futures prices (Yahoo Finance / Stooq) from data/prices.json.

import { esc, safeUrl, timeAgo, riskBadge, $, $$ } from './dom.js';
import { riskLevel } from '../analysis/risk.js';
import { store } from '../core/store.js';
import { tabHeader, errorsNotice, aiPanel, runBriefing, sourcesLine } from './feed.js';
import { usePriceGroups, groupSections, groupVerdict, priceStatusLine } from './pricegroups.js';

export { groupVerdict };

export function newsList(data, n = 25) {
  return `<ul class="items compact">${(data?.items || [])
    .slice(0, n)
    .map((it) => `<li class="card item">${riskBadge(it.risk, riskLevel(it.risk))} <a class="item-title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a> <span class="muted small">${esc(it.source)}${it.region ? ` · ${esc(it.region)}` : ''} · ${timeAgo(it.publishedAt)}</span></li>`)
    .join('') || '<li class="card muted">Loading news…</li>'}</ul>`;
}

export function renderCommodities(root, tab, { refresh }) {
  const ui = store.ui(tab.id, { group: 'all' });
  let force = false;

  const draw = () => {
    const state = usePriceGroups(tab.priceGroups, draw, { force });
    force = false;
    const groups = state.groups || [];
    const data = store.tabData.get(tab.id);
    const shown = ui.group === 'all' ? groups : groups.filter((g) => g.id === ui.group);
    const allSymbols = groups.flatMap((g) => g.items.map((i) => i.symbol));
    const overall = groupVerdict(allSymbols.map((s) => store.markets.get(s)));
    const skeletons = '<ul class="signals">' + '<li class="card signal skeleton"><div></div><div></div></li>'.repeat(4) + '</ul>';

    root.innerHTML = `
      ${tabHeader(tab, data)}
      <div class="notice">⚠️ Signals are generated automatically from futures price trends (moving averages, RSI, MACD). They are educational information only — <b>not financial advice</b>.</div>
      ${priceStatusLine(state)}
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Commodity group">
          <button class="chip ${ui.group === 'all' ? 'active' : ''}" data-group="all">All</button>
          ${groups.map((g) => `<button class="chip ${ui.group === g.id ? 'active' : ''}" data-group="${esc(g.id)}">${esc(g.icon)} ${esc(g.title)}</button>`).join('')}
        </div>
      </div>
      <div class="toolbar">
        <button class="btn refresh">↻ Refresh</button>
        <button class="btn primary ai">🧠 AI briefing</button>
        <span class="muted small">Overall: <b class="pos">${overall.counts.BUY} Buy</b> · <b>${overall.counts.HOLD} Hold</b> · <b class="neg">${overall.counts.SELL} Sell</b> · ${overall.loaded}/${allSymbols.length} loaded</span>
      </div>
      ${aiPanel(tab.id)}
      ${!groups.length && !state.error ? skeletons : groupSections(shown)}
      <h2>Commodity news</h2>
      ${errorsNotice(tab, data)}
      ${sourcesLine(data)}
      ${newsList(data)}
    `;

    $$('[data-group]', root).forEach((b) => b.addEventListener('click', () => ((ui.group = b.dataset.group), draw())));
    $('.refresh', root).addEventListener('click', () => {
      refresh(true);
      force = true;
      draw();
    });
    $('.ai', root).addEventListener('click', () => {
      const lines = groups.map((g) => {
        const rows = g.items
          .map((i) => {
            const r = store.markets.get(i.symbol);
            if (!r?.signal) return null;
            const ind = r.signal.indicators;
            return `  ${i.name} (${i.symbol}${i.unit ? `, ${i.unit}` : ''}): ${r.signal.action}, score ${r.signal.score}, last ${ind.last}, RSI ${ind.rsi?.toFixed(0) ?? '—'}, 20d ${ind.change20d?.toFixed(1) ?? '—'}%`;
          })
          .filter(Boolean);
        return rows.length ? `${g.title}:\n${rows.join('\n')}` : `${g.title}: no price data loaded`;
      });
      runBriefing(tab, data?.items || [], draw, `Technical signals by commodity group (futures prices):\n${lines.join('\n')}`);
    });
  };
  return draw;
}
