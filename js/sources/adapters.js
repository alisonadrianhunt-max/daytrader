// Live (in-browser) adapters for user-created custom tabs. Built-in tabs use
// data collected server-side by the pipeline (pipeline/build.mjs) instead.
// Each adapter takes the source options and returns normalized items:
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

export const ADAPTERS = { gdelt, hn, rss };

export function describeSource(src) {
  switch (src.type) {
    case 'gdelt':
      return 'GDELT global news';
    case 'hn':
      return 'Hacker News';
    case 'rss':
      return src.name || 'RSS feed';
    default:
      return src.type;
  }
}
