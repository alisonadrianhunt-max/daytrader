#!/usr/bin/env node
// Day Trader data pipeline. Runs on GitHub Actions (Node 20+, no dependencies).
//
//   node pipeline/build.mjs [--out data] [--prev https://site/data/health.json] [--only rss,gdelt]
//
// 1. Fetches every source in pipeline/sources.mjs server-side (no CORS, no API keys).
// 2. Validates and cleans items (titles, links, dates, duplicates, freshness).
// 3. Fetches daily price history for commodities, indices, stocks, FX, rates.
// 4. Tracks each source's reliability across runs (history from the live site)
//    and leaves out sources that have failed DISABLE_AFTER runs in a row.
// 5. Writes data/tabs/<tab>.json, data/prices.json, data/health.json, data/meta.json.

import { mkdir, writeFile } from 'node:fs/promises';
import { SOURCES, FILTERS, PRICE_GROUPS } from './sources.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const OUT = args.out || 'data';
const PREV_HEALTH_URL = args.prev || process.env.PREV_HEALTH_URL || '';
const ONLY = args.only ? new Set(args.only.split(',')) : null;

export const DISABLE_AFTER = 6; // consecutive failed runs (~3 hours at a 30-minute schedule)
const HISTORY_LEN = 48; // runs remembered per source (~1 day)
const MAX_ITEMS_PER_SOURCE = 30;
const DEFAULT_MAX_AGE_DAYS = 3;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 DayTraderDashboard/1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Polite pacing for hosts that rate-limit bursts ──────────────────────────
const MIN_GAP_MS = { 'cdn.cboe.com': 800, 'query2.finance.yahoo.com': 500, 'api.exchange.coinbase.com': 400 };
const nextSlot = new Map();
async function pace(url) {
  const host = new URL(url).host;
  const gap = MIN_GAP_MS[host];
  if (!gap) return;
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, at + gap);
  if (at > now) await sleep(at - now);
}

// ── HTTP with timeout + one retry ───────────────────────────────────────────
async function http(url, { as = 'text', timeoutMs = 25_000, headers = {}, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await pace(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*', ...headers },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      const text = await res.text();
      if (as !== 'json') return text;
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`invalid JSON: ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
      }
    } catch (err) {
      lastErr = err.name === 'AbortError' ? new Error('timeout') : err;
      if (err.retryable === false || (err.message?.startsWith('HTTP 4') && !err.message.includes('429'))) break;
      // Rate limited: back off for longer before trying again.
      if (attempt < retries) await sleep((err.message === 'HTTP 429' ? 6000 : 2000) * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ── Text helpers ─────────────────────────────────────────────────────────────
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
export function cleanText(s, max = 400) {
  let t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = decodeEntities(t); // entity-encoded HTML first…
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  t = decodeEntities(t).replace(/\s+/g, ' ').trim(); // …then remaining entities
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

// ── RSS / Atom / RDF parser (regex based; feeds are small and well-formed enough) ──
export function parseFeed(xml) {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('not an RSS/Atom feed');
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  const tag = (block, names) => {
    for (const n of names) {
      const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, 'i').exec(block);
      if (m && m[1].trim()) return m[1];
    }
    return '';
  };
  return blocks.map((b) => {
    const summary = cleanText(tag(b, ['description', 'summary', 'content:encoded', 'content']), 400);
    let link = '';
    const alt = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(b) || /<link[^>]*href=["']([^"']+)["']/i.exec(b);
    if (alt) link = alt[1];
    if (!link) link = cleanText(tag(b, ['link']), 2000);
    if (!/^https?:/i.test(link)) {
      const guid = cleanText(tag(b, ['guid', 'id']), 2000);
      if (/^https?:/i.test(guid)) link = guid;
    }
    // Social feeds (e.g. Bluesky) have posts without titles: use the post text.
    const title = cleanText(tag(b, ['title']), 300) || (summary.length > 160 ? summary.slice(0, 159) + '…' : summary);
    return {
      title,
      url: decodeEntities(link.trim()),
      date: cleanText(tag(b, ['pubDate', 'published', 'updated', 'dc:date', 'a10:updated']), 80),
      summary,
    };
  });
}

// ── Region lookup for GDELT source countries ────────────────────────────────
const REGION_BY_COUNTRY = (() => {
  const m = {};
  const add = (region, list) => list.split(',').forEach((c) => (m[c.trim().toLowerCase()] = region));
  add('Americas', 'United States,Canada,Mexico,Brazil,Argentina,Chile,Colombia,Peru,Venezuela,Ecuador,Bolivia,Uruguay,Paraguay,Cuba,Jamaica,Puerto Rico,Guatemala,Honduras,Panama,Costa Rica,Dominican Republic,Trinidad and Tobago,Bahamas,Barbados,Haiti,El Salvador,Nicaragua,Belize,Guyana');
  add('Europe', 'United Kingdom,Ireland,France,Germany,Italy,Spain,Portugal,Netherlands,Belgium,Switzerland,Austria,Sweden,Norway,Denmark,Finland,Iceland,Poland,Czech Republic,Slovakia,Hungary,Romania,Bulgaria,Greece,Ukraine,Russia,Belarus,Lithuania,Latvia,Estonia,Serbia,Croatia,Slovenia,Bosnia and Herzegovina,Albania,North Macedonia,Macedonia,Moldova,Montenegro,Kosovo,Malta,Cyprus,Luxembourg,Georgia,Armenia,Azerbaijan');
  add('Middle East', 'Israel,Palestine,Iran,Iraq,Syria,Lebanon,Jordan,Saudi Arabia,United Arab Emirates,Qatar,Kuwait,Bahrain,Oman,Yemen,Turkey');
  add('Africa', 'Nigeria,South Africa,Kenya,Egypt,Ethiopia,Ghana,Morocco,Algeria,Tunisia,Libya,Sudan,South Sudan,Uganda,Tanzania,Rwanda,Zimbabwe,Zambia,Botswana,Namibia,Mozambique,Angola,Cameroon,Senegal,Ivory Coast,Cote d\'Ivoire,Mali,Niger,Burkina Faso,Somalia,Democratic Republic of the Congo,Congo,Malawi,Madagascar,Mauritius,Sierra Leone,Liberia,Gambia');
  add('Asia-Pacific', 'China,Japan,India,Pakistan,Bangladesh,Sri Lanka,Nepal,Afghanistan,South Korea,North Korea,Taiwan,Hong Kong,Singapore,Malaysia,Indonesia,Philippines,Thailand,Vietnam,Cambodia,Myanmar,Laos,Australia,New Zealand,Fiji,Papua New Guinea,Mongolia,Kazakhstan,Uzbekistan,Brunei,Macau');
  return m;
})();
const regionFor = (country) => REGION_BY_COUNTRY[String(country || '').toLowerCase()] || 'Global';

// ── Source adapters (server-side) ────────────────────────────────────────────
const feedCache = new Map(); // one fetch per feed URL even when several tabs share it
const ADAPTERS = {
  async rss(src) {
    if (!feedCache.has(src.url)) feedCache.set(src.url, http(src.url).then(parseFeed));
    let items = (await feedCache.get(src.url)).map((it) => ({ ...it, source: src.name, region: src.region }));
    if (src.filter) items = items.filter((it) => FILTERS[src.filter].test(`${it.title} ${it.summary}`));
    if (src.severityFromGdacs) {
      items = items.map((it) => ({ ...it, severity: /\bred\b/i.test(it.title) ? 0.95 : /\borange\b/i.test(it.title) ? 0.7 : 0.3 }));
    }
    return items;
  },

  async gdelt(src) {
    const q = `${src.query} sourcelang:english`;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=artlist&sort=datedesc&maxrecords=${src.max || 50}&timespan=24h&query=${encodeURIComponent(q)}`;
    const data = await http(url, { as: 'json', timeoutMs: 25_000 });
    return (data.articles || []).map((a) => {
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(a.seendate || '');
      return {
        title: cleanText(a.title, 300),
        url: a.url,
        date: m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString() : '',
        summary: a.sourcecountry ? `${a.domain} · ${a.sourcecountry}` : a.domain,
        source: a.domain,
        region: regionFor(a.sourcecountry),
        via: 'GDELT',
      };
    });
  },

  async usgs() {
    const data = await http('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', { as: 'json' });
    const alert = { green: 0.3, yellow: 0.6, orange: 0.8, red: 1 };
    return (data.features || []).map((f) => {
      const p = f.properties;
      return {
        title: p.title || `M${p.mag} — ${p.place}`,
        url: p.url,
        date: new Date(p.time).toISOString(),
        summary: `Magnitude ${p.mag}${p.tsunami ? ' · tsunami flag issued' : ''}${p.alert ? ` · PAGER alert: ${p.alert}` : ''}`,
        severity: Math.max(Math.min(1, Math.max(0, (p.mag - 4.5) / 3)), alert[p.alert] || 0, p.tsunami ? 0.7 : 0),
        source: 'USGS',
        region: 'Global',
      };
    });
  },

  async emsc() {
    const start = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 19);
    const data = await http(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=4.5&limit=60&orderby=time&start=${start}`, { as: 'json' });
    return (data.features || []).map((f) => {
      const p = f.properties;
      return {
        title: `M${p.mag} earthquake — ${p.flynn_region || 'unknown region'}`,
        url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(p.unid || f.id)}`,
        date: p.time,
        summary: `Magnitude ${p.mag} ${p.magtype || ''} · depth ${p.depth ?? '?'} km`,
        severity: Math.min(1, Math.max(0, (p.mag - 4.5) / 3)),
        source: 'EMSC',
        region: 'Global',
      };
    });
  },

  async nws() {
    const data = await http('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe', {
      as: 'json',
      headers: { Accept: 'application/geo+json' },
    });
    return (data.features || []).slice(0, 60).map((f) => {
      const p = f.properties;
      return {
        title: `${p.event} — ${cleanText(p.areaDesc, 90)}`,
        url: `https://alerts.weather.gov/search?id=${encodeURIComponent(p.id)}`,
        date: p.sent,
        summary: cleanText(p.headline || p.description, 320),
        severity: p.severity === 'Extreme' ? 0.9 : 0.6,
        source: 'US National Weather Service',
        region: 'Americas',
      };
    });
  },

  async gdacs() {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
    const data = await http(
      `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&alertlevel=Green;Orange;Red&fromdate=${from}&todate=${to}`,
      { as: 'json', timeoutMs: 30_000 },
    );
    const types = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire' };
    const sev = { Green: 0.3, Orange: 0.7, Red: 0.95 };
    return (data.features || []).map((f) => {
      const p = f.properties || {};
      return {
        title: `${p.alertlevel || ''} alert: ${p.name || p.description || types[p.eventtype] || 'event'}`.trim(),
        url: p.url?.report || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`,
        date: p.todate || p.fromdate,
        summary: [types[p.eventtype], p.country, p.severitydata?.severitytext].filter(Boolean).join(' · '),
        severity: sev[p.alertlevel] ?? 0.3,
        source: 'GDACS',
        region: 'Global',
      };
    });
  },

  async eonet() {
    const data = await http('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=10&limit=60', { as: 'json' });
    const sev = { 'Severe Storms': 0.6, Volcanoes: 0.6, Wildfires: 0.4, Floods: 0.6 };
    return (data.events || []).map((e) => {
      const cat = e.categories?.[0]?.title || 'Event';
      const last = e.geometry?.[e.geometry.length - 1];
      return {
        title: e.title,
        url: e.sources?.[0]?.url || e.link,
        date: last?.date,
        summary: `${cat}${last?.magnitudeValue ? ` · ${last.magnitudeValue} ${last.magnitudeUnit || ''}` : ''}`,
        severity: sev[cat] ?? 0.3,
        source: `NASA EONET · ${cat}`,
        region: 'Global',
      };
    });
  },

  async cisa() {
    const data = await http('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { as: 'json', timeoutMs: 40_000 });
    return (data.vulnerabilities || [])
      .slice()
      .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : -1))
      .slice(0, 25)
      .map((v) => ({
        title: `${v.cveID}: ${v.vulnerabilityName}`,
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
        date: `${v.dateAdded}T12:00:00Z`,
        summary: cleanText(`${v.vendorProject} ${v.product} — ${v.shortDescription}`, 360),
        severity: v.knownRansomwareCampaignUse === 'Known' ? 1 : 0.85,
        source: 'CISA KEV (actively exploited)',
        region: 'Americas',
      }));
  },

  async nvd() {
    const fmt = (d) => d.toISOString().replace('Z', '');
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400_000);
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&resultsPerPage=40&pubStartDate=${fmt(start)}&pubEndDate=${fmt(end)}`;
    const data = await http(url, { as: 'json', timeoutMs: 45_000, retries: 2 });
    return (data.vulnerabilities || []).map(({ cve }) => {
      const score = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ?? cve.metrics?.cvssMetricV40?.[0]?.cvssData?.baseScore;
      return {
        title: `${cve.id}${score ? ` (CVSS ${score})` : ''}: ${cleanText(cve.descriptions?.find((d) => d.lang === 'en')?.value, 120)}`,
        url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
        date: cve.published,
        summary: cleanText(cve.descriptions?.find((d) => d.lang === 'en')?.value, 360),
        severity: score ? Math.min(1, score / 10) : 0.9,
        source: 'NIST NVD · Critical',
        region: 'Global',
      };
    });
  },

  async hn(src) {
    let url;
    if (src.frontPage) url = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30';
    else {
      const since = Math.floor(Date.now() / 1000) - (src.days || 2) * 86400;
      url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=30&query=${encodeURIComponent(src.query)}&optionalWords=${encodeURIComponent(src.query)}&numericFilters=${encodeURIComponent(`created_at_i>${since},points>15`)}`;
    }
    const data = await http(url, { as: 'json' });
    return (data.hits || []).map((h) => ({
      title: cleanText(h.title || h.story_title, 300),
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
      date: new Date((h.created_at_i || 0) * 1000).toISOString(),
      summary: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments`,
      engagement: (h.points || 0) + 2 * (h.num_comments || 0),
      source: 'Hacker News',
      region: 'Global',
    }));
  },

  async mastodon(src) {
    const data = await http(`https://${src.instance}/api/v1/timelines/tag/${encodeURIComponent(src.tag)}?limit=40`, { as: 'json' });
    return (Array.isArray(data) ? data : [])
      .filter((s) => !s.sensitive && s.language !== null && (!s.language || s.language === 'en'))
      .map((s) => {
        const text = cleanText(s.content, 400);
        return {
          title: text.length > 160 ? text.slice(0, 159) + '…' : text,
          url: s.url || s.uri,
          date: s.created_at,
          summary: text,
          engagement: (s.reblogs_count || 0) * 2 + (s.favourites_count || 0),
          source: `@${s.account?.acct || 'unknown'} · #${src.tag}`,
          region: 'Global',
        };
      });
  },

  async lemmy(src) {
    const data = await http(`https://${src.instance}/api/v3/post/list?community_name=${encodeURIComponent(src.community)}&sort=Hot&limit=30`, { as: 'json' });
    return (data.posts || []).map((p) => ({
      title: cleanText(p.post?.name, 300),
      url: p.post?.url || p.post?.ap_id,
      discussionUrl: p.post?.ap_id,
      date: p.post?.published?.endsWith('Z') ? p.post.published : `${p.post?.published}Z`,
      summary: `${p.counts?.score ?? 0} votes · ${p.counts?.comments ?? 0} comments`,
      engagement: (p.counts?.score || 0) + 2 * (p.counts?.comments || 0),
      source: `Lemmy c/${src.community}`,
      region: 'Global',
    }));
  },
};

// ── Quality control ──────────────────────────────────────────────────────────
const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|ocid|cmpid|ns_[a-z]+|at_[a-z]+|ref|src|mc_[a-z]+)$/i;
export function canonicalUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    for (const k of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) url.searchParams.delete(k);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
export const titleKey = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 12).join(' ');

/** Returns { items, rejected: {reason: count} } for one source's raw items. */
export function validate(raw, src, now = Date.now()) {
  const maxAge = (src.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86400_000;
  const rejected = {};
  const reject = (r) => (rejected[r] = (rejected[r] || 0) + 1);
  const seen = new Set();
  const items = [];
  for (const it of raw) {
    const title = cleanText(it.title, 300);
    if (title.length < 8) { reject('missing title'); continue; }
    const url = canonicalUrl(it.url);
    if (!url) { reject('bad link'); continue; }
    let t = Date.parse(it.date);
    if (!Number.isFinite(t)) { reject('no date'); continue; }
    if (t > now + 3600_000) t = now; // clock skew: clamp future dates
    if (now - t > maxAge) { reject('too old'); continue; }
    const key = titleKey(title);
    if (seen.has(url) || seen.has(key)) { reject('duplicate'); continue; }
    seen.add(url);
    seen.add(key);
    items.push({
      id: url,
      title,
      url,
      source: it.source || src.name,
      sourceId: src.id,
      region: it.region || src.region,
      publishedAt: t,
      summary: it.summary && it.summary !== title ? it.summary : '',
      ...(it.severity ? { severity: +it.severity.toFixed(2) } : {}),
      ...(it.engagement ? { engagement: it.engagement } : {}),
      ...(it.discussionUrl && it.discussionUrl !== url ? { discussionUrl: it.discussionUrl } : {}),
      ...(it.via ? { via: it.via } : {}),
    });
    if (items.length >= (src.maxItems || MAX_ITEMS_PER_SOURCE)) break;
  }
  return { items, rejected };
}

// ── Prices ───────────────────────────────────────────────────────────────────
// Each symbol tries a chain of free, keyless providers until one passes the
// quality checks: Yahoo Finance → Stooq → FRED → Cboe → Coinbase → ETF proxy.

// Yahoo needs a session cookie + "crumb" (the same handshake its own site does);
// without it, requests from data centres are rate-limited (HTTP 429).
let yahooSession;
function getYahooSession() {
  yahooSession ||= (async () => {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    if (!cookie) throw new Error('no Yahoo cookie');
    const crumb = (await http('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { Cookie: cookie }, retries: 0 })).trim();
    if (!crumb || crumb.length > 40 || /[<{\s]/.test(crumb)) throw new Error('no Yahoo crumb');
    return { cookie, crumb };
  })().catch((err) => ({ error: err.message }));
  return yahooSession;
}

async function yahooHistory(symbol) {
  const s = await getYahooSession();
  const crumb = s.crumb ? `&crumb=${encodeURIComponent(s.crumb)}` : '';
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false${crumb}`;
  const data = await http(url, { as: 'json', timeoutMs: 15_000, retries: 0, headers: s.cookie ? { Cookie: s.cookie } : {} });
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(data?.chart?.error?.description || 'no data');
  const closes = r.indicators?.quote?.[0]?.close || [];
  const out = [];
  r.timestamp?.forEach((ts, i) => Number.isFinite(closes[i]) && out.push([new Date(ts * 1000).toISOString().slice(0, 10), closes[i]]));
  return { points: out, currency: r.meta?.currency || '', exchange: r.meta?.fullExchangeName || r.meta?.exchangeName || '', source: 'Yahoo Finance' };
}

async function stooqHistory(symbol) {
  const csv = await http(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`, { timeoutMs: 15_000, retries: 0 });
  if (!/^Date,/i.test(csv)) throw new Error(`unexpected response: ${csv.slice(0, 60).replace(/\s+/g, ' ')}`);
  const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));
  const points = rows.filter((r) => Number.isFinite(+r[4]) && r[4] !== '').map((r) => [r[0], +r[4]]).slice(-260);
  return { points, currency: '', exchange: '', source: 'Stooq' };
}

// FRED (Federal Reserve Bank of St. Louis): free CSV download, no key.
async function fredHistory(series) {
  const start = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
  const csv = await http(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}&cosd=${start}`, { timeoutMs: 30_000, retries: 0 });
  const lines = csv.trim().split('\n');
  if (!/date/i.test(lines[0] || '')) throw new Error(`unexpected response: ${csv.slice(0, 60).replace(/\s+/g, ' ')}`);
  const points = lines.slice(1).map((l) => l.split(',')).filter((r) => r[1] !== '' && r[1] !== '.' && Number.isFinite(+r[1])).map((r) => [r[0], +r[1]]);
  return { points, currency: '', exchange: '', source: `FRED (${series})` };
}

// Cboe delayed-quotes charts: US stocks, ETFs and Cboe indices, no key.
// Memoised: an ETF used both on its own and as a proxy is fetched once.
const cboeMemo = new Map();
function cboeHistory(symbol) {
  if (!cboeMemo.has(symbol)) {
    const p = http(`https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/${encodeURIComponent(symbol)}.json`, { as: 'json', timeoutMs: 15_000, retries: 2 }).then((data) => {
      const rows = data?.data || [];
      const points = rows.map((r) => [String(r.date).slice(0, 10), +r.close]).filter((x) => Number.isFinite(x[1]) && x[1] > 0).slice(-260);
      return { points, currency: 'USD', exchange: 'Cboe', source: 'Cboe' };
    });
    p.catch(() => cboeMemo.delete(symbol));
    cboeMemo.set(symbol, p);
  }
  return cboeMemo.get(symbol);
}

// Coinbase Exchange public candles (crypto), no key.
async function coinbaseHistory(product) {
  const data = await http(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles?granularity=86400`, { as: 'json', timeoutMs: 15_000 });
  if (!Array.isArray(data)) throw new Error('unexpected response');
  const points = data.map((c) => [new Date(c[0] * 1000).toISOString().slice(0, 10), +c[4]]).reverse();
  return { points, currency: 'USD', exchange: 'Coinbase', source: 'Coinbase' };
}

// US Treasury daily par yield curve (official CSV, no key). One file per year.
const treasuryYears = new Map();
function treasuryYear(year) {
  if (!treasuryYears.has(year)) {
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
    treasuryYears.set(
      year,
      http(url, { timeoutMs: 30_000 }).then((csv) => {
        const lines = csv.trim().split('\n');
        const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
        if (head[0] !== 'Date') throw new Error(`unexpected response: ${csv.slice(0, 60).replace(/\s+/g, ' ')}`);
        return lines.slice(1).map((l) => {
          const cells = l.split(',').map((c) => c.replace(/"/g, '').trim());
          const [m, d, y] = cells[0].split('/');
          return Object.fromEntries([['date', `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`], ...head.slice(1).map((h, i) => [h, cells[i + 1]])]);
        });
      }),
    );
  }
  return treasuryYears.get(year);
}
async function treasuryHistory(column) {
  const y = new Date().getUTCFullYear();
  const rows = (await Promise.all([treasuryYear(y - 1), treasuryYear(y)])).flat();
  const points = rows
    .filter((r) => r[column] !== undefined && r[column] !== '' && Number.isFinite(+r[column]))
    .map((r) => [r.date, +r[column]])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { points, currency: '%', exchange: 'US Treasury', source: 'US Treasury (daily par yield curve)' };
}

// ECB euro foreign-exchange reference rates via the Frankfurter API (no key).
const fxCache = new Map();
function fxSeries(from, to) {
  const key = `${from}>${to}`;
  if (!fxCache.has(key)) {
    const start = new Date(Date.now() - 380 * 86400_000).toISOString().slice(0, 10);
    fxCache.set(
      key,
      (async () => {
        let lastErr;
        for (const host of ['https://api.frankfurter.app', 'https://api.frankfurter.dev/v1']) {
          try {
            const data = await http(`${host}/${start}..?from=${from}&to=${to}`, { as: 'json', timeoutMs: 20_000 });
            if (!data?.rates) throw new Error('unexpected response');
            return Object.entries(data.rates)
              .map(([d, r]) => [d, r[to.split(',')[0]], r])
              .sort((a, b) => (a[0] < b[0] ? -1 : 1));
          } catch (err) {
            lastErr = err;
          }
        }
        throw lastErr;
      })(),
    );
  }
  return fxCache.get(key);
}
async function fxHistory(pair) {
  const [from, to] = pair.split('/');
  const rows = await fxSeries(from, to);
  return { points: rows.map(([d, v]) => [d, v]).filter((p) => Number.isFinite(p[1])), currency: to, exchange: 'ECB', source: 'ECB reference rates (Frankfurter)' };
}
// US Dollar Index computed with ICE's published DXY formula from ECB rates.
async function dxyHistory() {
  const rows = await fxSeries('USD', 'EUR,JPY,GBP,CAD,SEK,CHF');
  const points = rows
    .map(([d, , r]) => {
      const eurusd = 1 / r.EUR;
      const gbpusd = 1 / r.GBP;
      const v = 50.14348112 * eurusd ** -0.576 * r.JPY ** 0.136 * gbpusd ** -0.119 * r.CAD ** 0.091 * r.SEK ** 0.042 * r.CHF ** 0.036;
      return [d, v];
    })
    .filter((p) => Number.isFinite(p[1]));
  return { points, currency: '', exchange: 'ECB', source: 'Computed from ECB rates (ICE DXY formula)' };
}

const round = (n) => +n.toPrecision(6);
const isUsTicker = (s) => /^[A-Z]{1,5}(-[A-Z])?$/.test(s);

// Circuit breaker: if a provider fails many times in a row (rate limit / block),
// stop calling it for the rest of the run instead of waiting on timeouts.
const breaker = {};
const BREAKER_LIMIT = { FRED: 3 }; // FRED tends to time out rather than refuse; give up sooner
const limitFor = (p) => BREAKER_LIMIT[p] ?? 6;

/** Ordered list of [providerName, fn, symbol, proxyNote] attempts for one price item. */
export function priceChain(item) {
  const chain = [];
  // Official sources first where they exist; then the general providers.
  if (item.treasury) chain.push(['Treasury', treasuryHistory, item.treasury]);
  if (item.fx) chain.push(['ECB', fxHistory, item.fx]);
  if (item.dxy) chain.push(['ECB', dxyHistory, 'DXY']);
  chain.push(['Yahoo', yahooHistory, item.symbol]);
  if (item.stooq) chain.push(['Stooq', stooqHistory, item.stooq]);
  if (item.cboe || isUsTicker(item.symbol)) chain.push(['Cboe', cboeHistory, item.cboe || item.symbol.replace('-', '.')]);
  if (item.coinbase) chain.push(['Coinbase', coinbaseHistory, item.coinbase]);
  if (item.fred) chain.push(['FRED', fredHistory, item.fred]);
  if (item.proxy) chain.push(['Cboe', cboeHistory, item.proxy, `ETF proxy: ${item.proxy}${item.proxyName ? ` (${item.proxyName})` : ''}`]);
  return chain;
}

async function priceFor(item) {
  const errors = [];
  for (const [provider, fn, sym, proxyNote] of priceChain(item)) {
    if ((breaker[provider] || 0) >= limitFor(provider)) {
      errors.push(`${provider}: skipped (failing this run)`);
      continue;
    }
    try {
      const h = await fn(sym);
      const last = h.points[h.points.length - 1];
      if (h.points.length < 60) throw new Error(`only ${h.points.length} days of history`);
      if (Date.now() - Date.parse(last[0]) > 10 * 86400_000) throw new Error(`stale (last ${last[0]})`);
      const jumps = h.points.slice(1).filter((p, i) => Math.abs(p[1] / h.points[i][1] - 1) > 0.5).length;
      if (jumps > 2) throw new Error('price series has implausible jumps');
      breaker[provider] = 0;
      return {
        name: item.name,
        unit: proxyNote ? `USD (${item.proxy} share)` : item.unit || '',
        currency: h.currency,
        exchange: h.exchange,
        source: proxyNote ? `${h.source} · ${proxyNote}` : h.source,
        // ~220 trading days covers the 200-day average; dates are implied (daily closes).
        lastDate: last[0],
        closes: h.points.slice(-220).map((p) => round(p[1])),
        ...(item.invert ? { invert: true } : {}),
      };
    } catch (err) {
      if (/HTTP|timeout|fetch failed|unexpected response/i.test(err.message)) breaker[provider] = (breaker[provider] || 0) + 1;
      errors.push(`${provider}: ${err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

// ── Health history ───────────────────────────────────────────────────────────
async function loadPrevHealth() {
  if (!PREV_HEALTH_URL) return {};
  try {
    const h = await http(PREV_HEALTH_URL, { as: 'json', retries: 0, timeoutMs: 15_000 });
    return h.sources || {};
  } catch (err) {
    console.log(`(no previous health history: ${err.message})`);
    return {};
  }
}
function nextHealth(prev = {}, ok, info) {
  const history = ((prev.history || '') + (ok ? '1' : '0')).slice(-HISTORY_LEN);
  const consecutiveFailures = ok ? 0 : (prev.consecutiveFailures || 0) + 1;
  const reliability = Math.round((100 * history.split('').filter((c) => c === '1').length) / history.length);
  return {
    ...info,
    ok,
    history,
    reliability,
    consecutiveFailures,
    lastOk: ok ? new Date().toISOString() : prev.lastOk || null,
    status: ok ? 'ok' : consecutiveFailures >= DISABLE_AFTER ? 'disabled' : 'failing',
  };
}

// ── Concurrency helper ───────────────────────────────────────────────────────
async function pool(list, size, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        out[idx] = await fn(list[idx], idx);
      }
    }),
  );
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function main() {
  const started = Date.now();
  const prevHealth = await loadPrevHealth();
  const health = {};
  const sources = SOURCES.filter((s) => !ONLY || ONLY.has(s.type) || ONLY.has(s.id));

  const runSource = async (src) => {
    const t0 = Date.now();
    try {
      const raw = await ADAPTERS[src.type](src);
      const { items, rejected } = validate(raw, src);
      // A feed that loads but has nothing recent counts as healthy-but-quiet only
      // for slow official feeds (maxAgeDays), topic-filtered feeds, or feeds marked
      // quietOk (e.g. hurricane centres out of season); news feeds must have items.
      // A topic-filtered feed that loaded is healthy even when nothing matches the topic right now.
      const ok = items.length > 0 || (src.maxAgeDays && raw.length > 0) || !!src.filter || !!src.quietOk;
      const topReason = Object.entries(rejected).sort((a, b) => b[1] - a[1])[0];
      health[src.id] = nextHealth(prevHealth[src.id], ok, {
        name: src.name, region: src.region, tabs: src.tabs, type: src.type,
        items: items.length, raw: raw.length, rejected, ms: Date.now() - t0,
        error: ok ? null : raw.length ? `no valid recent items (${raw.length} rejected, mostly: ${topReason?.[0]})` : 'empty feed',
      });
      return { src, items };
    } catch (err) {
      health[src.id] = nextHealth(prevHealth[src.id], false, {
        name: src.name, region: src.region, tabs: src.tabs, type: src.type,
        items: 0, raw: 0, ms: Date.now() - t0, error: String(err.message || err).slice(0, 200),
      });
      return { src, items: [] };
    }
  };

  // GDELT allows 1 request / 5 s → run those sequentially alongside everything else.
  const gdelt = sources.filter((s) => s.type === 'gdelt');
  const others = sources.filter((s) => s.type !== 'gdelt');
  const gdeltDeadline = Date.now() + 5 * 60_000;
  const gdeltRun = (async () => {
    const res = [];
    for (const s of gdelt) {
      if (Date.now() > gdeltDeadline) {
        health[s.id] = nextHealth(prevHealth[s.id], false, { name: s.name, region: s.region, tabs: s.tabs, type: s.type, items: 0, raw: 0, ms: 0, error: 'skipped: run time budget reached' });
        res.push({ src: s, items: [] });
        continue;
      }
      res.push(await runSource(s));
      await sleep(10_000);
    }
    return res;
  })();
  const results = [...(await pool(others, 8, runSource)), ...(await gdeltRun)];

  // Build per-tab files. Sources disabled after repeated failures are left out entirely.
  const tabs = {};
  for (const { src, items } of results) {
    if (health[src.id].status === 'disabled') continue;
    for (const tab of src.tabs) (tabs[tab] ||= { items: [], sources: [] }).sources.push(src.id);
    for (const tab of src.tabs) tabs[tab].items.push(...items);
  }
  await mkdir(`${OUT}/tabs`, { recursive: true });
  const tabSummary = {};
  for (const [tab, { items, sources: ids }] of Object.entries(tabs)) {
    // Cross-source de-duplication: keep the earliest report of each story.
    const seen = new Set();
    const deduped = items
      .sort((a, b) => a.publishedAt - b.publishedAt)
      .filter((it) => {
        const k1 = it.url;
        const k2 = titleKey(it.title);
        if (seen.has(k1) || seen.has(k2)) return false;
        seen.add(k1);
        seen.add(k2);
        return true;
      })
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 400);
    const working = ids.filter((id) => health[id].ok);
    const regions = [...new Set(deduped.map((i) => i.region))].sort();
    tabSummary[tab] = { items: deduped.length, sources: ids.length, working: working.length, regions };
    await writeFile(
      `${OUT}/tabs/${tab}.json`,
      JSON.stringify({
        tab,
        generatedAt: new Date().toISOString(),
        sources: ids.map((id) => ({ id, name: health[id].name, region: health[id].region, ok: health[id].ok, items: health[id].items, reliability: health[id].reliability })),
        items: deduped,
      }),
    );
  }

  // Prices.
  const prices = {};
  const priceHealth = {};
  if (!ONLY || ONLY.has('prices')) {
    const all = [];
    for (const [tab, groups] of Object.entries(PRICE_GROUPS)) for (const g of groups) for (const item of g.items) all.push({ ...item, tab });
    const unique = [...new Map(all.map((i) => [i.symbol, i])).values()];
    const priceDeadline = Date.now() + 6 * 60_000; // never let prices hold up a run for long
    await pool(unique, 2, async (item) => {
      const t0 = Date.now();
      if (t0 > priceDeadline) {
        priceHealth[item.symbol] = nextHealth(prevHealth[`price:${item.symbol}`], false, { name: item.name, error: 'skipped: run time budget reached', ms: 0 });
        return;
      }
      try {
        prices[item.symbol] = await priceFor(item);
        priceHealth[item.symbol] = nextHealth(prevHealth[`price:${item.symbol}`], true, { name: item.name, source: prices[item.symbol].source, ms: Date.now() - t0 });
      } catch (err) {
        priceHealth[item.symbol] = nextHealth(prevHealth[`price:${item.symbol}`], false, { name: item.name, error: err.message.slice(0, 200), ms: Date.now() - t0 });
      }
      await sleep(400);
    });
    for (const [sym, h] of Object.entries(priceHealth)) health[`price:${sym}`] = { ...h, type: 'price', tabs: ['prices'] };
    // Groups the dashboard should show: only symbols that loaded.
    const groupsOut = {};
    for (const [tab, groups] of Object.entries(PRICE_GROUPS)) {
      groupsOut[tab] = groups
        .map((g) => ({ ...g, items: g.items.filter((i) => prices[i.symbol]).map(({ symbol, name, unit }) => ({ symbol, name, unit })) }))
        .filter((g) => g.items.length);
    }
    await writeFile(`${OUT}/prices.json`, JSON.stringify({ generatedAt: new Date().toISOString(), groups: groupsOut, prices }));
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    tabs: tabSummary,
    sources: { total: sources.length, ok: sources.filter((s) => health[s.id].ok).length, disabled: sources.filter((s) => health[s.id].status === 'disabled').length },
    prices: { total: Object.keys(priceHealth).length, ok: Object.keys(prices).length },
  };
  await writeFile(`${OUT}/health.json`, JSON.stringify({ generatedAt: meta.generatedAt, disableAfter: DISABLE_AFTER, sources: health }));
  await writeFile(`${OUT}/meta.json`, JSON.stringify(meta));

  // Human-readable report (Actions log + job summary).
  const lines = [`## Day Trader data run — ${meta.generatedAt}`, '', `Sources OK: **${meta.sources.ok}/${meta.sources.total}** · disabled: ${meta.sources.disabled} · prices OK: **${meta.prices.ok}/${meta.prices.total}** · ${Math.round(meta.durationMs / 1000)}s`, '', '| Tab | Items | Working sources | Regions |', '|---|---|---|---|'];
  for (const [t, s] of Object.entries(tabSummary)) lines.push(`| ${t} | ${s.items} | ${s.working}/${s.sources} | ${s.regions.join(', ')} |`);
  lines.push('', '| Source | Status | Items | Reliability | Error |', '|---|---|---|---|---|');
  for (const [id, h] of Object.entries(health).sort((a, b) => a[1].ok - b[1].ok)) {
    lines.push(`| ${id} | ${h.ok ? '✅' : h.status === 'disabled' ? '⛔' : '❌'} | ${h.items ?? ''} | ${h.reliability}% (${h.history.length} runs) | ${h.error || ''} |`);
  }
  const report = lines.join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
