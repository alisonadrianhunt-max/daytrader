// Data-source adapters. Each adapter takes the source options from the tab
// definition and returns an array of normalized items:
//
//   { id, title, url, source, publishedAt (ms epoch), summary, severity (0..1), tags: [] }
//
// To add a new kind of source, write an async function here and register it in
// ADAPTERS at the bottom. All sources are free and called directly from the
// browser (they allow cross-origin requests). Sources that need a key read it
// from settings.

import { fetchData, FetchError } from '../core/fetcher.js';
import { loadSettings } from '../core/settings.js';

export const stripHtml = (html = '') =>
  String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const clip = (s, n = 280) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

/** GDELT seendate "20261108T063000Z" -> epoch ms */
export function parseGdeltDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : Date.now();
}

// --- GDELT 2.0 DOC API: global news in 65 languages, updated every 15 min ---
async function gdelt({ query, max = 50, timespan = '24h' }) {
  const q = `${query} sourcelang:english`;
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=artlist&sort=datedesc' +
    `&maxrecords=${max}&timespan=${timespan}&query=${encodeURIComponent(q)}`;
  const { data } = await fetchData(url);
  return (data.articles || []).map((a) => ({
    id: a.url,
    title: a.title,
    url: a.url,
    source: a.domain,
    publishedAt: parseGdeltDate(a.seendate),
    summary: a.sourcecountry ? `Source country: ${a.sourcecountry}` : '',
    severity: 0,
    tags: ['news'],
  }));
}

// --- Hacker News via Algolia ---
async function hn({ query, frontPage = false, days = 2, max = 30 }) {
  let url;
  if (frontPage) {
    url = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${max}`;
  } else {
    const words = String(query)
      .split(/\s+OR\s+/i)
      .map((w) => w.replace(/"/g, '').trim())
      .filter(Boolean)
      .join(' ');
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    url =
      `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=${max}` +
      `&query=${encodeURIComponent(words)}&optionalWords=${encodeURIComponent(words)}` +
      `&numericFilters=${encodeURIComponent(`created_at_i>${since},points>20`)}`;
  }
  const { data } = await fetchData(url);
  return (data.hits || []).map((h) => ({
    id: `hn-${h.objectID}`,
    title: h.title || h.story_title || '(untitled)',
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: 'Hacker News',
    publishedAt: (h.created_at_i || 0) * 1000,
    summary: `${h.points ?? 0} points · ${h.num_comments ?? 0} comments`,
    severity: 0,
    engagement: (h.points || 0) + 2 * (h.num_comments || 0),
    tags: ['social'],
  }));
}

// --- Reddit public JSON ---
async function reddit({ subreddit, filter, max = 30 }) {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${max}&raw_json=1`;
  const { data } = await fetchData(url);
  let posts = (data?.data?.children || []).map((c) => c.data).filter((p) => !p.stickied);
  if (filter) posts = posts.filter((p) => filter.test(p.title));
  return posts.map((p) => ({
    id: `rd-${p.id}`,
    title: p.title,
    url: p.url_overridden_by_dest && /^https?:/.test(p.url_overridden_by_dest) ? p.url_overridden_by_dest : `https://www.reddit.com${p.permalink}`,
    discussionUrl: `https://www.reddit.com${p.permalink}`,
    source: `r/${p.subreddit}`,
    publishedAt: (p.created_utc || 0) * 1000,
    summary: clip(stripHtml(p.selftext)) || `${p.score} upvotes · ${p.num_comments} comments`,
    severity: 0,
    engagement: (p.score || 0) + 2 * (p.num_comments || 0),
    tags: ['social'],
  }));
}

// --- Mastodon public hashtag timeline ---
async function mastodon({ tag, instance = 'mastodon.social', max = 30 }) {
  const url = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${max}`;
  const { data } = await fetchData(url);
  return (Array.isArray(data) ? data : []).map((s) => {
    const text = stripHtml(s.content);
    return {
      id: `md-${s.id}`,
      title: clip(text, 160) || '(media post)',
      url: s.url || s.uri,
      source: `@${s.account?.acct || 'unknown'} · #${tag}`,
      publishedAt: Date.parse(s.created_at) || Date.now(),
      summary: clip(text, 400),
      severity: 0,
      engagement: (s.reblogs_count || 0) * 2 + (s.favourites_count || 0),
      tags: ['social'],
    };
  });
}

// --- USGS earthquakes (M4.5+, past day) ---
async function usgs({ feed = '4.5_day' } = {}) {
  const { data } = await fetchData(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`);
  const alertSeverity = { green: 0.3, yellow: 0.6, orange: 0.8, red: 1 };
  return (data.features || []).map((f) => {
    const p = f.properties;
    const magSeverity = Math.max(0, Math.min(1, (p.mag - 4.5) / 3)); // M4.5 -> 0, M7.5 -> 1
    return {
      id: `eq-${f.id}`,
      title: p.title || `M${p.mag} earthquake — ${p.place}`,
      url: p.url,
      source: 'USGS',
      publishedAt: p.time,
      summary: `Magnitude ${p.mag}${p.tsunami ? ' · tsunami flag issued' : ''}${p.alert ? ` · PAGER alert: ${p.alert}` : ''}`,
      severity: Math.max(magSeverity, alertSeverity[p.alert] || 0, p.tsunami ? 0.7 : 0),
      tags: ['earthquake'],
    };
  });
}

// --- US National Weather Service active alerts (Severe + Extreme) ---
async function nws() {
  const { data } = await fetchData('https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe', {
    headers: { Accept: 'application/geo+json' },
  });
  return (data.features || []).slice(0, 60).map((f) => {
    const p = f.properties;
    return {
      id: `nws-${p.id}`,
      title: `${p.event} — ${clip(p.areaDesc, 90)}`,
      url: `https://alerts.weather.gov/search?id=${encodeURIComponent(p.id)}`,
      source: 'NWS (US)',
      publishedAt: Date.parse(p.sent) || Date.now(),
      summary: clip(p.headline || p.description, 320),
      severity: p.severity === 'Extreme' ? 0.9 : 0.6,
      tags: ['weather'],
    };
  });
}

// --- NASA EONET natural events (wildfires, storms, volcanoes, floods...) ---
async function eonet({ days = 7, max = 50 } = {}) {
  const { data } = await fetchData(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=${days}&limit=${max}`);
  const catSeverity = { 'Severe Storms': 0.6, Volcanoes: 0.6, Wildfires: 0.4, Floods: 0.6, Earthquakes: 0.5 };
  return (data.events || []).map((e) => {
    const cat = e.categories?.[0]?.title || 'Event';
    const last = e.geometry?.[e.geometry.length - 1];
    return {
      id: `eonet-${e.id}`,
      title: e.title,
      url: e.sources?.[0]?.url || e.link,
      source: `NASA EONET · ${cat}`,
      publishedAt: Date.parse(last?.date) || Date.now(),
      summary: `${cat}${last?.magnitudeValue ? ` · ${last.magnitudeValue} ${last.magnitudeUnit || ''}` : ''}`,
      severity: catSeverity[cat] ?? 0.3,
      tags: ['natural-event'],
    };
  });
}

// --- CISA Known Exploited Vulnerabilities catalog ---
async function cisa({ max = 25 } = {}) {
  const { data } = await fetchData('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', {
    timeoutMs: 30_000,
  });
  return (data.vulnerabilities || [])
    .slice()
    .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : -1))
    .slice(0, max)
    .map((v) => ({
      id: `kev-${v.cveID}`,
      title: `${v.cveID}: ${v.vulnerabilityName}`,
      url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      source: 'CISA KEV (actively exploited)',
      publishedAt: Date.parse(v.dateAdded) || Date.now(),
      summary: clip(`${v.vendorProject} ${v.product} — ${v.shortDescription}`, 360),
      severity: v.knownRansomwareCampaignUse === 'Known' ? 1 : 0.85,
      tags: ['cve', 'exploited'],
    }));
}

// --- NIST NVD: critical CVEs published in the last N days ---
async function nvd({ days = 7, max = 40 } = {}) {
  const fmt = (d) => d.toISOString().replace('Z', '');
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const url =
    `https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&resultsPerPage=${max}` +
    `&pubStartDate=${fmt(start)}&pubEndDate=${fmt(end)}`;
  const { data } = await fetchData(url, { timeoutMs: 30_000 });
  return (data.vulnerabilities || []).map(({ cve }) => {
    const desc = cve.descriptions?.find((d) => d.lang === 'en')?.value || '';
    const score = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ?? cve.metrics?.cvssMetricV30?.[0]?.cvssData?.baseScore;
    return {
      id: `nvd-${cve.id}`,
      title: `${cve.id}${score ? ` (CVSS ${score})` : ''}`,
      url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      source: 'NIST NVD · Critical',
      publishedAt: Date.parse(cve.published) || Date.now(),
      summary: clip(desc, 360),
      severity: score ? Math.min(1, score / 10) : 0.9,
      tags: ['cve'],
    };
  });
}

// --- Generic RSS / Atom feed (direct, or through the optional CORS proxy) ---
export function parseFeed(xmlText, name) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) throw new FetchError(`${name}: not a valid RSS/Atom feed`);
  const nodes = [...doc.querySelectorAll('item, entry')].slice(0, 40);
  return nodes.map((n) => {
    const text = (sel) => n.querySelector(sel)?.textContent?.trim() || '';
    const link = n.querySelector('link')?.getAttribute('href') || text('link');
    const date = text('pubDate') || text('updated') || text('published') || text('dc\\:date');
    return {
      id: link || text('guid') || text('title'),
      title: stripHtml(text('title')),
      url: link,
      source: name,
      publishedAt: Date.parse(date) || Date.now(),
      summary: clip(stripHtml(text('description') || text('summary') || text('content'))),
      severity: 0,
      tags: ['news'],
    };
  });
}

async function rss({ url, name }) {
  const label = name || new URL(url).host;
  const { corsProxy } = loadSettings();
  try {
    const { data } = await fetchData(url, { as: 'text', timeoutMs: 12_000 });
    return parseFeed(data, label);
  } catch (err) {
    if (!corsProxy) {
      throw new FetchError(`${label}: feed blocked by the browser (CORS). Add a CORS proxy in Settings to enable RSS feeds.`);
    }
    const proxied = corsProxy.includes('{url}') ? corsProxy.replace('{url}', encodeURIComponent(url)) : corsProxy + encodeURIComponent(url);
    const { data } = await fetchData(proxied, { as: 'text' });
    return parseFeed(data, label);
  }
}

export const ADAPTERS = { gdelt, hn, reddit, mastodon, usgs, nws, eonet, cisa, nvd, rss };

export function describeSource(src) {
  switch (src.type) {
    case 'gdelt':
      return 'GDELT global news';
    case 'hn':
      return 'Hacker News';
    case 'reddit':
      return `Reddit r/${src.subreddit}`;
    case 'mastodon':
      return `Mastodon #${src.tag}`;
    case 'usgs':
      return 'USGS earthquakes';
    case 'nws':
      return 'US National Weather Service';
    case 'eonet':
      return 'NASA EONET';
    case 'cisa':
      return 'CISA KEV catalog';
    case 'nvd':
      return 'NIST NVD';
    case 'rss':
      return src.name || 'RSS feed';
    default:
      return src.type;
  }
}
