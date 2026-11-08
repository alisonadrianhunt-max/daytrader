// Generic "feed" view used by every news-style tab (and by custom tabs).

import { esc, safeUrl, timeAgo, riskBadge, renderMarkdown, $ } from './dom.js';
import { aggregateRisk, topDrivers, riskLevel } from '../analysis/risk.js';
import { describeSource } from '../sources/adapters.js';
import { generateBriefing } from '../ai/claude.js';
import { store } from '../core/store.js';

export function tabHeader(tab, data) {
  const agg = aggregateRisk(data?.items || []);
  const drivers = topDrivers(data?.items || []);
  const loading = !data || data.pending > 0;
  return `
    <header class="tab-header">
      <div class="tab-title">
        <h1><span aria-hidden="true">${esc(tab.icon)}</span> ${esc(tab.title)}</h1>
        <p class="muted">${esc(tab.description || '')}</p>
      </div>
      <div class="tab-risk">
        ${data?.items?.length ? gauge(agg.score, agg.level) : `<div class="gauge placeholder">${loading ? 'Loading…' : 'No data'}</div>`}
      </div>
    </header>
    ${drivers.length ? `<div class="chips" aria-label="Main risk drivers"><span class="muted small">Risk drivers:</span> ${drivers.map((d) => `<button class="chip" data-search="${esc(d.word)}">${esc(d.word)} <b>${d.count}</b></button>`).join('')}</div>` : ''}
  `;
}

export function gauge(score, level) {
  const angle = (score / 100) * 180;
  return `
    <div class="gauge risk-${level.key}" role="img" aria-label="Risk ${level.label}, ${score} out of 100">
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path d="M10 60 A50 50 0 0 1 110 60" class="gauge-track"/>
        <path d="M10 60 A50 50 0 0 1 110 60" class="gauge-fill" pathLength="180" stroke-dasharray="${angle} 180"/>
      </svg>
      <div class="gauge-value"><strong>${score}</strong><span>${esc(level.label)}</span></div>
    </div>`;
}

function itemCard(it) {
  const level = riskLevel(it.risk);
  return `
    <li class="card item">
      <div class="item-top">
        ${riskBadge(it.risk, level)}
        <span class="muted small">${esc(it.source)} · ${timeAgo(it.publishedAt)}</span>
      </div>
      <a class="item-title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>
      ${it.summary ? `<p class="item-summary">${esc(it.summary)}</p>` : ''}
      ${it.discussionUrl ? `<a class="small" href="${esc(safeUrl(it.discussionUrl))}" target="_blank" rel="noopener noreferrer">Discussion ↗</a>` : ''}
    </li>`;
}

export function errorsNotice(tab, data) {
  if (!data?.errors?.length) return '';
  return `<details class="notice warn"><summary>${data.errors.length} of ${tab.sources.length} sources unavailable</summary>
    <ul>${data.errors.map((e) => `<li><b>${esc(e.source)}</b>: ${esc(e.message)}</li>`).join('')}</ul></details>`;
}

export function aiPanel(tabId) {
  const brief = store.briefings.get(tabId);
  if (!brief) return '';
  if (brief.status === 'loading') return `<section class="card ai-brief"><p class="muted">🧠 Writing AI briefing…</p></section>`;
  if (brief.status === 'error') return `<section class="card ai-brief error"><p>⚠️ ${esc(brief.error)}</p></section>`;
  return `<section class="card ai-brief"><div class="ai-brief-head"><b>🧠 AI briefing</b><span class="muted small">${timeAgo(brief.at)}</span></div>${renderMarkdown(brief.text)}</section>`;
}

export async function runBriefing(tab, items, rerender, extra) {
  store.briefings.set(tab.id, { status: 'loading' });
  rerender();
  try {
    const text = await generateBriefing(tab, [...items].sort((a, b) => b.risk - a.risk), extra);
    store.briefings.set(tab.id, { status: 'done', text, at: Date.now() });
  } catch (err) {
    store.briefings.set(tab.id, { status: 'error', error: err.message });
  }
  rerender();
}

export function renderFeed(root, tab, { refresh }) {
  const ui = store.ui(tab.id, { q: '', sort: 'newest', minRisk: 0 });

  const draw = () => {
    const data = store.tabData.get(tab.id);
    const q = ui.q.trim().toLowerCase();
    let items = (data?.items || []).filter((it) => it.risk >= ui.minRisk);
    if (q) items = items.filter((it) => `${it.title} ${it.summary} ${it.source}`.toLowerCase().includes(q));
    if (ui.sort === 'risk') items = [...items].sort((a, b) => b.risk - a.risk || b.publishedAt - a.publishedAt);

    root.innerHTML = `
      ${tabHeader(tab, data)}
      <div class="toolbar">
        <input type="search" class="search" placeholder="Filter headlines…" value="${esc(ui.q)}" aria-label="Filter headlines">
        <select class="sort" aria-label="Sort">
          <option value="newest" ${ui.sort === 'newest' ? 'selected' : ''}>Newest first</option>
          <option value="risk" ${ui.sort === 'risk' ? 'selected' : ''}>Highest risk first</option>
        </select>
        <select class="min-risk" aria-label="Minimum risk">
          ${[0, 20, 40, 60, 80].map((v) => `<option value="${v}" ${ui.minRisk === v ? 'selected' : ''}>${v ? `Risk ≥ ${v}` : 'All risk levels'}</option>`).join('')}
        </select>
        <button class="btn refresh">↻ Refresh</button>
        <button class="btn primary ai">🧠 AI briefing</button>
      </div>
      ${errorsNotice(tab, data)}
      ${aiPanel(tab.id)}
      <p class="muted small status">${
        data ? `${items.length} of ${data.items.length} items${data.pending > 0 ? ' · loading more sources…' : ''} · updated ${timeAgo(data.fetchedAt)}` : 'Loading sources…'
      } · Sources: ${esc((tab.sources || []).map(describeSource).join(', '))}</p>
      <ul class="items">${items.map(itemCard).join('') || (data && !data.pending ? '<li class="card muted">No items match.</li>' : skeleton())}</ul>
    `;

    const search = $('.search', root);
    search.addEventListener('input', () => {
      ui.q = search.value;
      const pos = search.selectionStart;
      draw();
      const s = $('.search', root);
      s.focus();
      s.setSelectionRange(pos, pos);
    });
    $('.sort', root).addEventListener('change', (e) => ((ui.sort = e.target.value), draw()));
    $('.min-risk', root).addEventListener('change', (e) => ((ui.minRisk = +e.target.value), draw()));
    $('.refresh', root).addEventListener('click', () => refresh(true));
    $('.ai', root).addEventListener('click', () => runBriefing(tab, data?.items || [], draw));
    root.querySelectorAll('.chip[data-search]').forEach((c) => c.addEventListener('click', () => ((ui.q = c.dataset.search), draw())));
  };
  return draw;
}

export const skeleton = (n = 5) => Array.from({ length: n }, () => '<li class="card item skeleton"><div></div><div></div></li>').join('');
