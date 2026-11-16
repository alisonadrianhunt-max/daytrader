// Settings view: API keys, refresh interval, theme, tab visibility and custom tabs.

import { esc, $, $$ } from './dom.js';
import { loadSettings, saveSettings, loadCustomTabs, saveCustomTabs, slugify } from '../core/settings.js';
import { clearCache } from '../core/cache.js';
import { BUILTIN_TABS } from '../tabs/registry.js';
import { loadSnapshot } from '../core/snapshot.js';
import { timeAgo } from './dom.js';

let health = null;
let healthError = '';

function loadHealth(draw) {
  loadSnapshot('health.json')
    .then((h) => (health = h))
    .catch((err) => (healthError = err.message))
    .finally(() => draw());
}

/** Source health report from the data pipeline (data/health.json). */
function healthHtml() {
  if (healthError) return `<p class="muted small">${esc(healthError)}</p>`;
  if (!health) return '<p class="muted small">Loading source health…</p>';
  const entries = Object.entries(health.sources);
  const feeds = entries.filter(([, h]) => h.type !== 'price');
  const prices = entries.filter(([, h]) => h.type === 'price');
  const titleOf = Object.fromEntries(BUILTIN_TABS.map((t) => [t.id, `${t.icon} ${t.title}`]));
  const byTab = {};
  for (const [id, h] of feeds) for (const t of h.tabs || []) (byTab[t] ||= []).push([id, h]);
  const badge = (h) => (h.ok ? '<span class="pos">● OK</span>' : h.status === 'disabled' ? '<span class="neg">⛔ Hidden</span>' : '<span class="neg">○ Failed</span>');
  const row = ([, h]) =>
    `<tr><td>${esc(h.name)}<div class="muted small">${esc(h.region || h.source || '')}${h.error ? ` · ${esc(h.error)}` : ''}</div></td><td>${badge(h)}</td><td class="num">${h.ok ? h.items ?? '' : '—'}</td><td class="num">${h.reliability}%<div class="muted small">${h.history.length} runs</div></td></tr>`;
  const okFeeds = feeds.filter(([, h]) => h.ok).length;
  const hidden = feeds.filter(([, h]) => h.status === 'disabled').length;
  const okPrices = prices.filter(([, h]) => h.ok).length;
  return `
    <p class="small">Last collection run ${timeAgo(Date.parse(health.generatedAt))}: <b>${okFeeds} of ${feeds.length}</b> news & data sources reporting, <b>${okPrices} of ${prices.length}</b> prices. Sources that fail ${health.disableAfter} runs in a row (about ${health.disableAfter / 2} hours) are hidden from the dashboard automatically${hidden ? ` (${hidden} hidden now)` : ''}, and come back when they recover.</p>
    ${Object.entries(byTab)
      .map(([t, list]) => `<details><summary><b>${esc(titleOf[t] || t)}</b> — ${list.filter(([, h]) => h.ok).length}/${list.length} reporting</summary>
        <div class="table-wrap"><table class="health-table"><thead><tr><th>Source</th><th>Status</th><th class="num">Items</th><th class="num">Reliability</th></tr></thead><tbody>${list.sort((a, b) => b[1].reliability - a[1].reliability).map(row).join('')}</tbody></table></div></details>`)
      .join('')}
    <details><summary><b>📈 Prices</b> — ${okPrices}/${prices.length} loaded</summary>
      <div class="table-wrap"><table class="health-table"><thead><tr><th>Symbol</th><th>Status</th><th class="num">Source</th><th class="num">Reliability</th></tr></thead><tbody>${prices
        .sort((a, b) => a[1].ok - b[1].ok)
        .map(([id, h]) => `<tr><td>${esc(h.name)} <span class="muted small">${esc(id.replace('price:', ''))}</span>${h.error ? `<div class="muted small">${esc(h.error)}</div>` : ''}</td><td>${badge(h)}</td><td class="num small">${esc(h.source || '—')}</td><td class="num">${h.reliability}%</td></tr>`)
        .join('')}</tbody></table></div></details>`;
}

export function renderSettings(root, _tab, { tabs }) {
  const draw = (flash = '') => {
    const s = loadSettings();
    const custom = loadCustomTabs();
    root.innerHTML = `
      <header class="tab-header"><div class="tab-title"><h1>⚙️ Settings</h1><p class="muted">Everything is stored only in this browser.</p></div></header>
      ${flash ? `<div class="notice ok" role="status">${esc(flash)}</div>` : ''}
      <form class="card form settings-form">
        <h2>Optional keys</h2>
        <p class="muted small">All news, hazard, cyber and price data works without any keys. These only add extras.</p>
        <label>Twelve Data API key <span class="muted small">(optional — track watchlist symbols that aren't in the built-in lists) · <a href="https://twelvedata.com/pricing" target="_blank" rel="noopener noreferrer">get one</a></span>
          <input name="twelveDataKey" type="password" autocomplete="off" value="${esc(s.twelveDataKey)}"></label>
        <label>Anthropic API key <span class="muted small">(optional — enables 🧠 AI briefings) · <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">get one</a></span>
          <input name="anthropicKey" type="password" autocomplete="off" value="${esc(s.anthropicKey)}"></label>
        <label>AI model <input name="aiModel" value="${esc(s.aiModel)}"></label>
        <label>CORS proxy for custom-tab RSS feeds <span class="muted small">(optional; e.g. <code>https://your-proxy.example/?url=</code> or a URL containing <code>{url}</code>)</span>
          <input name="corsProxy" value="${esc(s.corsProxy)}" placeholder="leave empty to skip blocked RSS feeds"></label>
        <h2>Display</h2>
        <label>Theme <select name="theme">${['auto', 'light', 'dark'].map((t) => `<option ${s.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Refresh data every (minutes) <input name="refreshMinutes" type="number" min="5" max="240" value="${s.refreshMinutes}"></label>
        <fieldset><legend>Visible tabs</legend>
          ${tabs
            .filter((t) => t.id !== 'overview')
            .map((t) => `<label class="check"><input type="checkbox" name="visible" value="${esc(t.id)}" ${s.hiddenTabs.includes(t.id) ? '' : 'checked'}> ${esc(t.icon)} ${esc(t.title)}</label>`)
            .join('')}
        </fieldset>
        <div class="row"><button class="btn primary" type="submit">Save settings</button> <button class="btn clear-cache" type="button">Clear cached data</button></div>
      </form>

      <section class="card form">
        <h2>Custom tabs</h2>
        <p class="muted small">Track any risk topic. Keywords are searched live across global news (GDELT); you can add a Hacker News search and RSS feeds too.</p>
        <ul class="custom-list">${
          custom.map((c) => `<li><span>${esc(c.icon || '⭐')} <b>${esc(c.title)}</b> <span class="muted small">${esc(c.keywords || '')}</span></span><button class="btn small danger" data-remove="${esc(c.id)}">Remove</button></li>`).join('') ||
          '<li class="muted small">No custom tabs yet.</li>'
        }</ul>
        <form class="custom-form">
          <div class="grid2">
            <label>Tab name <input name="title" required maxlength="40" placeholder="e.g. Energy & Oil"></label>
            <label>Icon <input name="icon" maxlength="4" placeholder="🛢️"></label>
          </div>
          <label>News keywords (comma separated) <input name="keywords" placeholder="oil, OPEC, crude prices, pipeline"></label>
          <div class="grid2">
            <label>Hacker News search <input name="hnQuery" placeholder="optional"></label>
            <label>RSS feed URLs (space separated) <input name="rss" placeholder="optional"></label>
          </div>
          <button class="btn primary" type="submit">Add tab</button>
        </form>
      </section>

      <section class="card form" id="data-sources">
        <h2>Data sources</h2>
        <div class="health">${healthHtml()}</div>
      </section>
      <p class="muted small">Day Trader · data collected every 30 minutes on GitHub from public feeds and APIs worldwide. Risk scores and signals are automated estimates.</p>
    `;
    if (!health && !healthError) loadHealth(draw);

    $('.settings-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const visible = new Set(f.getAll('visible'));
      saveSettings({
        twelveDataKey: String(f.get('twelveDataKey')).trim(),
        anthropicKey: String(f.get('anthropicKey')).trim(),
        aiModel: String(f.get('aiModel')).trim() || 'claude-opus-5-5',
        corsProxy: String(f.get('corsProxy')).trim(),
        theme: f.get('theme'),
        refreshMinutes: Math.max(5, Math.min(240, +f.get('refreshMinutes') || 15)),
        hiddenTabs: tabs.filter((t) => t.id !== 'overview' && !visible.has(t.id)).map((t) => t.id),
      });
      draw('Settings saved.');
    });
    $('.clear-cache', root).addEventListener('click', () => {
      clearCache();
      draw('Cached data cleared — tabs will reload fresh data.');
    });
    $('.custom-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.keywords?.trim() && !f.hnQuery?.trim() && !f.rss?.trim()) {
        draw('Add at least one keyword or source for the new tab.');
        return;
      }
      let id = slugify(f.title);
      const taken = new Set([...BUILTIN_TABS.map((t) => t.id), ...custom.map((c) => c.id)]);
      for (let n = 2; taken.has(id); n++) id = `${slugify(f.title)}-${n}`;
      saveCustomTabs([...custom, { ...f, id, title: f.title.trim() }]);
      location.hash = `#/${id}`;
    });
    $$('[data-remove]', root).forEach((b) =>
      b.addEventListener('click', () => {
        saveCustomTabs(custom.filter((c) => c.id !== b.dataset.remove));
        draw('Custom tab removed.');
      }),
    );
  };
  return draw;
}
