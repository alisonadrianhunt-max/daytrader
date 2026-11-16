import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TABS, toGdeltQuery, customTabToDefinition } from '../js/tabs/registry.js';
import { ADAPTERS, parseGdeltDate, stripHtml } from '../js/sources/adapters.js';
import { parseWatchlist, slugify } from '../js/core/settings.js';
import { PRICE_GROUPS } from '../pipeline/sources.mjs';

test('all required risk areas are present with unique ids', () => {
  const titles = BUILTIN_TABS.map((t) => t.title).join('|');
  for (const t of ['Commodities', 'Military', 'Financial', 'NASDAQ', 'Political', 'Cyber', 'Weather', 'Social', 'Headlines', 'AI']) {
    assert.match(titles, new RegExp(t));
  }
  assert.equal(new Set(BUILTIN_TABS.map((t) => t.id)).size, BUILTIN_TABS.length);
});

test('built-in tabs read pipeline data; price tabs name a price group', () => {
  for (const tab of BUILTIN_TABS.filter((t) => t.view !== 'overview')) {
    assert.equal(tab.snapshot, true, tab.id);
    assert.ok(!tab.sources, `${tab.id} should not define live sources`);
  }
  for (const id of ['markets', 'commodities', 'finance']) {
    assert.ok(BUILTIN_TABS.find((t) => t.id === id).priceGroups, id);
  }
});

test('custom tabs become live feed tabs with registered adapters', () => {
  assert.equal(toGdeltQuery('oil, opec, crude prices'), '(oil OR opec OR "crude prices")');
  assert.equal(toGdeltQuery('lithium'), 'lithium');
  const def = customTabToDefinition({ id: 'custom-energy', title: 'Energy', keywords: 'oil, gas', hnQuery: 'oil', rss: 'https://a.example/feed' });
  assert.deepEqual(def.sources.map((s) => s.type), ['gdelt', 'hn', 'rss']);
  for (const s of def.sources) assert.ok(ADAPTERS[s.type], s.type);
});

test('helpers', () => {
  assert.equal(parseGdeltDate('20261108T063000Z'), Date.UTC(2026, 10, 8, 6, 30, 0));
  assert.equal(stripHtml('<p>Hello &amp; <b>world</b></p>'), 'Hello & world');
  assert.deepEqual(parseWatchlist('aapl, msft;;  BRK.B <script>'), ['AAPL', 'MSFT', 'BRK.B']);
  assert.equal(slugify('Energy & Oil!'), 'custom-energy-oil');
});

test('commodities are grouped by type and include gold and silver', () => {
  const c = BUILTIN_TABS.find((t) => t.id === 'commodities');
  assert.equal(c.view, 'commodities');
  const groups = PRICE_GROUPS[c.priceGroups];
  const names = groups.flatMap((g) => g.items.map((i) => i.name));
  assert.ok(names.includes('Gold') && names.includes('Silver'));
  assert.ok(groups.length >= 5);
  const syms = Object.values(PRICE_GROUPS).flatMap((gs) => gs.flatMap((g) => g.items.map((i) => i.symbol)));
  assert.equal(new Set(syms).size, syms.length, 'no duplicate symbols across groups');
});
