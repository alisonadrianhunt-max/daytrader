// Overview: one card per tab with its risk score, plus a world risk index.

import { esc, safeUrl, timeAgo, $ } from './dom.js';
import { aggregateRisk, worldRisk, topDrivers } from '../analysis/risk.js';
import { store } from '../core/store.js';
import { gauge } from './feed.js';

export function renderOverview(root, tab, { tabs, scanAll, isScanning }) {
  const draw = () => {
    const feedTabs = tabs.filter((t) => t.view !== 'overview' && t.sources?.length);
    const scored = feedTabs.map((t) => {
      const d = store.tabData.get(t.id);
      return { t, d, agg: d?.items?.length ? aggregateRisk(d.items) : null };
    });
    const world = worldRisk(scored.map((s) => s.agg?.score));
    const loaded = scored.filter((s) => s.agg).length;
    const hottest = scored
      .filter((s) => s.d?.items?.length)
      .flatMap((s) => s.d.items.map((it) => ({ ...it, tab: s.t })))
      .sort((a, b) => b.risk - a.risk)
      .filter((it, i, arr) => arr.findIndex((x) => x.url === it.url || x.title === it.title) === i)
      .slice(0, 8);

    root.innerHTML = `
      <header class="tab-header">
        <div class="tab-title">
          <h1><span aria-hidden="true">${esc(tab.icon)}</span> World Risk Overview</h1>
          <p class="muted">${esc(tab.description)} ${loaded < feedTabs.length ? `(${loaded}/${feedTabs.length} areas scanned)` : ''}</p>
        </div>
        <div class="tab-risk">${world ? gauge(world.score, world.level) : '<div class="gauge placeholder">Not scanned</div>'}</div>
      </header>
      <div class="toolbar">
        <button class="btn primary scan" ${isScanning() ? 'disabled' : ''}>${isScanning() ? 'Scanning all areas…' : '🔎 Scan all risk areas'}</button>
        <span class="muted small">The free news API allows one request every 5 seconds, so a full scan takes about a minute. Results are cached.</span>
      </div>
      <ul class="overview-grid">
        ${scored
          .map(({ t, d, agg }) => {
            const drivers = topDrivers(d?.items || [], 4);
            return `<li><a class="card area ${agg ? `risk-edge-${agg.level.key}` : ''}" href="#/${esc(t.id)}">
              <div class="area-head"><span class="area-icon" aria-hidden="true">${esc(t.icon)}</span><b>${esc(t.title)}</b></div>
              ${
                agg
                  ? `<div class="area-score risk-${agg.level.key}"><strong>${agg.score}</strong> ${esc(agg.level.label)}</div>
                     <div class="meter"><span class="risk-bg-${agg.level.key}" style="width:${agg.score}%"></span></div>
                     <p class="muted small">${agg.highCount} high-risk of ${agg.total} items · ${timeAgo(d.fetchedAt)}</p>
                     ${drivers.length ? `<p class="small">${drivers.map((x) => esc(x.word)).join(' · ')}</p>` : ''}`
                  : `<p class="muted small">${d?.pending ? 'Loading…' : 'Not scanned yet — tap to open'}</p>`
              }
            </a></li>`;
          })
          .join('')}
      </ul>
      ${
        hottest.length
          ? `<h2>Highest-risk items right now</h2><ul class="items compact">${hottest
              .map(
                (it) => `<li class="card item"><span class="badge risk-${riskKey(it.risk)}">${it.risk}</span> <span aria-hidden="true">${esc(it.tab.icon)}</span>
                <a class="item-title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a>
                <span class="muted small">${esc(it.source)} · ${timeAgo(it.publishedAt)}</span></li>`,
              )
              .join('')}</ul>`
          : ''
      }
    `;
    $('.scan', root).addEventListener('click', () => scanAll());
  };
  return draw;
}

const riskKey = (s) => (s >= 80 ? 'severe' : s >= 60 ? 'high' : s >= 40 ? 'elevated' : s >= 20 ? 'guarded' : 'low');
