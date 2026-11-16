import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanText, validate, canonicalUrl, decodeEntities } from '../pipeline/build.mjs';
import { SOURCES, PRICE_GROUPS, FILTERS } from '../pipeline/sources.mjs';
import { BUILTIN_TABS } from '../js/tabs/registry.js';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
<item><title><![CDATA[Missile strike &amp; ceasefire talks]]></title><link>https://ex.com/a?utm_source=rss&id=1</link>
<pubDate>${new Date().toUTCString()}</pubDate><description>&lt;p&gt;Body &lt;b&gt;text&lt;/b&gt;&lt;/p&gt;</description></item>
<item><title>Old story here</title><link>https://ex.com/old</link><pubDate>Mon, 01 Jan 2001 00:00:00 GMT</pubDate></item>
<item><title>No link at all</title><pubDate>${new Date().toUTCString()}</pubDate></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom entry title</title>
<link rel="alternate" href="https://ex.org/e1"/><updated>${new Date().toISOString()}</updated><summary>Sum</summary></entry></feed>`;

test('parses RSS and Atom, decoding CDATA, entities and HTML', () => {
  const r = parseFeed(RSS);
  assert.equal(r.length, 3);
  assert.equal(r[0].title, 'Missile strike & ceasefire talks');
  assert.equal(r[0].summary, 'Body text');
  const a = parseFeed(ATOM);
  assert.equal(a[0].url, 'https://ex.org/e1');
  assert.throws(() => parseFeed('<html>blocked</html>'));
});

test('validation drops stale, linkless and duplicate items and strips tracking params', () => {
  const raw = [...parseFeed(RSS), ...parseFeed(RSS)];
  const { items, rejected } = validate(raw, { id: 's', name: 'S', region: 'Global' });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://ex.com/a?id=1');
  assert.equal(rejected['too old'], 2);
  assert.equal(rejected['bad link'], 2);
  assert.equal(rejected.duplicate, 1);
});

test('helpers', () => {
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  assert.equal(decodeEntities('&#8217;&#x2019;&amp;'), '’’&');
  assert.equal(cleanText('a'.repeat(10), 5), 'aaaa…');
});

test('source catalogue is well formed and covers every news tab', () => {
  const ids = SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  const tabIds = new Set(BUILTIN_TABS.map((t) => t.id));
  for (const s of SOURCES) {
    assert.ok(s.name && s.region && s.tabs?.length && s.type, s.id);
    for (const t of s.tabs) assert.ok(tabIds.has(t), `${s.id} -> unknown tab ${t}`);
    if (s.filter) assert.ok(FILTERS[s.filter], s.id);
    if (s.type === 'rss') assert.match(s.url, /^https:\/\//);
  }
  for (const t of BUILTIN_TABS.filter((t) => t.view !== 'overview')) {
    const n = SOURCES.filter((s) => s.tabs.includes(t.id)).length;
    assert.ok(n >= 3, `${t.id} has ${n} sources`);
    const regions = new Set(SOURCES.filter((s) => s.tabs.includes(t.id)).map((s) => s.region));
    assert.ok(regions.size >= 2, `${t.id} regions`);
  }
  const syms = Object.values(PRICE_GROUPS).flatMap((gs) => gs.flatMap((g) => g.items.map((i) => i.symbol)));
  assert.ok(syms.includes('GC=F') && syms.includes('SI=F'));
});
