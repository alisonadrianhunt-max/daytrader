// Source catalogue for the data pipeline (runs on GitHub Actions, not in the browser).
//
// Every source is fetched server-side on each run, validated, and written to
// data/*.json for the dashboard. Sources that fail many runs in a row are
// automatically hidden (see pipeline/build.mjs → DISABLE_AFTER) and come back
// on their own once they recover.
//
// Fields: id (unique), name, region, tabs (tab ids it feeds), type, and
// type-specific options. Types: rss | gdelt | usgs | emsc | nws | eonet |
// cisa | nvd | hn | mastodon | lemmy.
// Regions: Global, Americas, Europe, Middle East, Africa, Asia-Pacific.

const rss = (id, name, region, tabs, url, extra = {}) => ({ id, name, region, tabs, type: 'rss', url, ...extra });

export const SOURCES = [
  // ── Mainstream headlines: major outlets from every continent ──────────────
  rss('bbc-world', 'BBC News', 'Europe', ['headlines'], 'https://feeds.bbci.co.uk/news/world/rss.xml'),
  rss('guardian-world', 'The Guardian', 'Europe', ['headlines'], 'https://www.theguardian.com/world/rss'),
  rss('dw', 'Deutsche Welle', 'Europe', ['headlines'], 'https://rss.dw.com/rdf/rss-en-all'),
  rss('france24', 'France 24', 'Europe', ['headlines'], 'https://www.france24.com/en/rss'),
  rss('euronews', 'Euronews', 'Europe', ['headlines'], 'https://www.euronews.com/rss?level=theme&name=news'),
  rss('sky-world', 'Sky News', 'Europe', ['headlines'], 'https://feeds.skynews.com/feeds/rss/world.xml'),
  rss('nyt-world', 'New York Times', 'Americas', ['headlines'], 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'),
  rss('npr-world', 'NPR', 'Americas', ['headlines'], 'https://feeds.npr.org/1004/rss.xml'),
  rss('cbc-world', 'CBC News', 'Americas', ['headlines'], 'https://www.cbc.ca/webfeed/rss/rss-world'),
  rss('abc-us', 'ABC News (US)', 'Americas', ['headlines'], 'https://abcnews.go.com/abcnews/internationalheadlines'),
  rss('mercopress', 'MercoPress', 'Americas', ['headlines', 'politics'], 'https://en.mercopress.com/rss/'),
  rss('aljazeera', 'Al Jazeera', 'Middle East', ['headlines'], 'https://www.aljazeera.com/xml/rss/all.xml'),
  rss('arabnews', 'Arab News', 'Middle East', ['headlines'], 'https://www.arabnews.com/rss.xml'),
  rss('africanews', 'Africanews', 'Africa', ['headlines'], 'https://www.africanews.com/feed/rss'),
  rss('allafrica', 'AllAfrica', 'Africa', ['headlines'], 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf'),
  rss('premiumtimes', 'Premium Times (Nigeria)', 'Africa', ['headlines', 'politics'], 'https://www.premiumtimesng.com/feed'),
  rss('dailymaverick', 'Daily Maverick (South Africa)', 'Africa', ['headlines'], 'https://www.dailymaverick.co.za/dmrss/'),
  rss('abc-au', 'ABC News (Australia)', 'Asia-Pacific', ['headlines'], 'https://www.abc.net.au/news/feed/51120/rss.xml'),
  rss('scmp', 'South China Morning Post', 'Asia-Pacific', ['headlines'], 'https://www.scmp.com/rss/91/feed'),
  rss('japantimes', 'The Japan Times', 'Asia-Pacific', ['headlines'], 'https://www.japantimes.co.jp/feed/'),
  rss('thehindu', 'The Hindu', 'Asia-Pacific', ['headlines'], 'https://www.thehindu.com/news/international/feeder/default.rss'),
  rss('toi', 'Times of India', 'Asia-Pacific', ['headlines'], 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms'),
  rss('straitstimes', 'The Straits Times', 'Asia-Pacific', ['headlines'], 'https://www.straitstimes.com/news/world/rss.xml'),
  rss('cna', 'CNA (Singapore)', 'Asia-Pacific', ['headlines'], 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311'),
  rss('un-news', 'UN News', 'Global', ['headlines', 'politics'], 'https://news.un.org/feed/subscribe/en/news/all/rss.xml'),

  // ── Military conflict & security ───────────────────────────────────────────
  rss('defensenews', 'Defense News', 'Americas', ['military'], 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml'),
  rss('breakingdefense', 'Breaking Defense', 'Americas', ['military'], 'https://breakingdefense.com/feed/'),
  rss('warontherocks', 'War on the Rocks', 'Americas', ['military'], 'https://warontherocks.com/feed/', { maxAgeDays: 10 }),
  rss('militarytimes', 'Military Times', 'Americas', ['military'], 'https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml'),
  rss('kyivindependent', 'Kyiv Independent', 'Europe', ['military', 'politics'], 'https://kyivindependent.com/news-archive/rss/'),
  rss('arabnews-conflict', 'Arab News', 'Middle East', ['military'], 'https://www.arabnews.com/rss.xml', { filter: 'conflict' }),
  rss('hindu-conflict', 'The Hindu', 'Asia-Pacific', ['military'], 'https://www.thehindu.com/news/international/feeder/default.rss', { filter: 'conflict' }),
  rss('mercopress-conflict', 'MercoPress', 'Americas', ['military'], 'https://en.mercopress.com/rss/', { filter: 'conflict' }),
  rss('un-peace', 'UN News — Peace & Security', 'Global', ['military'], 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml'),
  rss('crisisgroup', 'International Crisis Group', 'Global', ['military', 'politics'], 'https://www.crisisgroup.org/rss.xml', { maxAgeDays: 14 }),
  rss('aljazeera-conflict', 'Al Jazeera', 'Middle East', ['military'], 'https://www.aljazeera.com/xml/rss/all.xml', { filter: 'conflict' }),
  rss('bbc-world-mil', 'BBC News', 'Europe', ['military'], 'https://feeds.bbci.co.uk/news/world/rss.xml', { filter: 'conflict' }),
  rss('thediplomat-mil', 'The Diplomat', 'Asia-Pacific', ['military', 'politics'], 'https://thediplomat.com/feed/'),
  rss('scmp-mil', 'SCMP', 'Asia-Pacific', ['military'], 'https://www.scmp.com/rss/91/feed', { filter: 'conflict' }),
  rss('africanews-mil', 'Africanews', 'Africa', ['military'], 'https://www.africanews.com/feed/rss', { filter: 'conflict' }),

  // ── World financial system ─────────────────────────────────────────────────
  rss('fed', 'US Federal Reserve', 'Americas', ['finance'], 'https://www.federalreserve.gov/feeds/press_all.xml', { maxAgeDays: 30 }),
  rss('ecb', 'European Central Bank', 'Europe', ['finance'], 'https://www.ecb.europa.eu/rss/press.html', { maxAgeDays: 30 }),
  rss('boe', 'Bank of England', 'Europe', ['finance'], 'https://www.bankofengland.co.uk/rss/news', { maxAgeDays: 30 }),
  rss('bis', 'Bank for International Settlements', 'Global', ['finance'], 'https://www.bis.org/doclist/all_pressrels.rss', { maxAgeDays: 30 }),
  rss('rba', 'Reserve Bank of Australia', 'Asia-Pacific', ['finance'], 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml', { maxAgeDays: 30 }),
  rss('cnbc-economy', 'CNBC Economy', 'Americas', ['finance'], 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258'),
  rss('marketwatch', 'MarketWatch', 'Americas', ['finance', 'markets'], 'https://feeds.content.dowjones.io/public/rss/mw_topstories'),
  rss('guardian-business', 'The Guardian — Business', 'Europe', ['finance'], 'https://www.theguardian.com/business/economics/rss'),
  rss('bbc-business', 'BBC Business', 'Europe', ['finance', 'markets'], 'https://feeds.bbci.co.uk/news/business/rss.xml'),
  rss('ft', 'Financial Times', 'Europe', ['finance', 'markets'], 'https://www.ft.com/rss/home/international'),
  rss('et-economy', 'The Economic Times (India)', 'Asia-Pacific', ['finance'], 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms'),
  rss('scmp-business', 'SCMP Business', 'Asia-Pacific', ['finance'], 'https://www.scmp.com/rss/92/feed'),
  rss('businessday-ng', 'BusinessDay (Nigeria)', 'Africa', ['finance'], 'https://businessday.ng/feed/'),

  // ── Stock markets ──────────────────────────────────────────────────────────
  rss('investing-stocks', 'Investing.com', 'Global', ['markets'], 'https://www.investing.com/rss/news_25.rss'),
  rss('et-markets', 'Economic Times Markets (India)', 'Asia-Pacific', ['markets'], 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'),
  rss('scmp-markets', 'SCMP Business', 'Asia-Pacific', ['markets'], 'https://www.scmp.com/rss/92/feed', { filter: 'markets' }),
  rss('guardian-markets', 'The Guardian — Business', 'Europe', ['markets'], 'https://www.theguardian.com/business/economics/rss', { filter: 'markets' }),
  rss('businessday-markets', 'BusinessDay (Nigeria)', 'Africa', ['markets'], 'https://businessday.ng/feed/', { filter: 'markets' }),
  rss('arabnews-markets', 'Arab News', 'Middle East', ['markets'], 'https://www.arabnews.com/rss.xml', { filter: 'markets' }),

  // ── Commodities ────────────────────────────────────────────────────────────
  rss('oilprice', 'OilPrice.com', 'Global', ['commodities'], 'https://oilprice.com/rss/main'),
  rss('mining', 'MINING.COM', 'Global', ['commodities'], 'https://www.mining.com/feed/'),
  rss('scmp-commodities', 'SCMP Business', 'Asia-Pacific', ['commodities'], 'https://www.scmp.com/rss/92/feed', { filter: 'commodities' }),
  rss('et-commodities', 'The Economic Times (India)', 'Asia-Pacific', ['commodities'], 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms', { filter: 'commodities' }),
  rss('businessday-commodities', 'BusinessDay (Nigeria)', 'Africa', ['commodities'], 'https://businessday.ng/feed/', { filter: 'commodities' }),
  rss('bbc-business-commodities', 'BBC Business', 'Europe', ['commodities'], 'https://feeds.bbci.co.uk/news/business/rss.xml', { filter: 'commodities' }),
  rss('dailymaverick-commodities', 'Daily Maverick (South Africa)', 'Africa', ['commodities'], 'https://www.dailymaverick.co.za/dmrss/', { filter: 'commodities' }),
  rss('arabnews-commodities', 'Arab News', 'Middle East', ['commodities'], 'https://www.arabnews.com/rss.xml', { filter: 'commodities' }),
  rss('investing-commodities', 'Investing.com Commodities', 'Global', ['commodities'], 'https://www.investing.com/rss/news_11.rss'),
  rss('cnbc-energy', 'CNBC Energy', 'Americas', ['commodities'], 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19836768'),

  // ── Politics ───────────────────────────────────────────────────────────────
  rss('politico', 'Politico', 'Americas', ['politics'], 'https://rss.politico.com/politics-news.xml'),
  rss('politico-eu', 'Politico Europe', 'Europe', ['politics'], 'https://www.politico.eu/feed/'),
  rss('npr-politics', 'NPR Politics', 'Americas', ['politics'], 'https://feeds.npr.org/1014/rss.xml'),
  rss('guardian-politics', 'The Guardian — Politics', 'Europe', ['politics'], 'https://www.theguardian.com/politics/rss'),
  rss('bbc-politics', 'BBC Politics', 'Europe', ['politics'], 'https://feeds.bbci.co.uk/news/politics/rss.xml'),
  rss('foreignpolicy', 'Foreign Policy', 'Global', ['politics'], 'https://foreignpolicy.com/feed/'),
  rss('euractiv', 'Euractiv', 'Europe', ['politics'], 'https://www.euractiv.com/feed/'),
  rss('scmp-china', 'SCMP China', 'Asia-Pacific', ['politics'], 'https://www.scmp.com/rss/4/feed'),
  rss('hindu-national', 'The Hindu — National', 'Asia-Pacific', ['politics'], 'https://www.thehindu.com/news/national/feeder/default.rss'),
  rss('aljazeera-politics', 'Al Jazeera', 'Middle East', ['politics'], 'https://www.aljazeera.com/xml/rss/all.xml', { filter: 'politics' }),
  rss('africanews-politics', 'Africanews', 'Africa', ['politics'], 'https://www.africanews.com/feed/rss', { filter: 'politics' }),

  // ── Cybersecurity ──────────────────────────────────────────────────────────
  { id: 'cisa-kev', name: 'CISA Known Exploited Vulnerabilities', region: 'Americas', tabs: ['cyber'], type: 'cisa' },
  { id: 'nvd', name: 'NIST NVD — Critical CVEs', region: 'Global', tabs: ['cyber'], type: 'nvd' },
  rss('cisa-advisories', 'CISA Advisories', 'Americas', ['cyber'], 'https://www.cisa.gov/cybersecurity-advisories/all.xml', { maxAgeDays: 14 }),
  rss('ncsc-uk', 'UK NCSC', 'Europe', ['cyber'], 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml', { maxAgeDays: 30 }),
  rss('cert-eu', 'CERT-EU', 'Europe', ['cyber'], 'https://cert.europa.eu/publications/security-advisories-rss', { maxAgeDays: 30 }),
  rss('sans-isc', 'SANS Internet Storm Center', 'Global', ['cyber'], 'https://isc.sans.edu/rssfeed.xml'),
  rss('krebs', 'Krebs on Security', 'Americas', ['cyber'], 'https://krebsonsecurity.com/feed/', { maxAgeDays: 30 }),
  rss('bleeping', 'BleepingComputer', 'Global', ['cyber'], 'https://www.bleepingcomputer.com/feed/'),
  rss('thehackernews', 'The Hacker News', 'Asia-Pacific', ['cyber'], 'https://feeds.feedburner.com/TheHackersNews'),
  rss('therecord', 'The Record', 'Americas', ['cyber'], 'https://therecord.media/feed'),
  rss('securityweek', 'SecurityWeek', 'Americas', ['cyber'], 'https://www.securityweek.com/feed/'),
  rss('darkreading', 'Dark Reading', 'Americas', ['cyber'], 'https://www.darkreading.com/rss.xml'),
  rss('welivesecurity', 'ESET WeLiveSecurity', 'Europe', ['cyber'], 'https://www.welivesecurity.com/en/rss/feed/'),
  { id: 'hn-cyber', name: 'Hacker News', region: 'Global', tabs: ['cyber'], type: 'hn', query: 'vulnerability breach ransomware exploit', days: 3 },

  // ── Weather & natural hazards ──────────────────────────────────────────────
  { id: 'usgs', name: 'USGS Earthquakes (M4.5+)', region: 'Global', tabs: ['weather'], type: 'usgs' },
  { id: 'emsc', name: 'EMSC Earthquakes (M4.5+)', region: 'Europe', tabs: ['weather'], type: 'emsc' },
  { id: 'gdacs', name: 'GDACS (UN/EU disaster alerts)', region: 'Global', tabs: ['weather'], type: 'gdacs', maxAgeDays: 10 },
  { id: 'nws', name: 'US National Weather Service', region: 'Americas', tabs: ['weather'], type: 'nws' },
  { id: 'eonet', name: 'NASA EONET', region: 'Global', tabs: ['weather'], type: 'eonet', maxAgeDays: 30 },
  rss('nhc-atlantic', 'US National Hurricane Center (Atlantic)', 'Americas', ['weather'], 'https://www.nhc.noaa.gov/index-at.xml', { quietOk: true, maxAgeDays: 7 }),
  rss('nhc-pacific', 'US National Hurricane Center (E. Pacific)', 'Americas', ['weather'], 'https://www.nhc.noaa.gov/index-ep.xml', { quietOk: true, maxAgeDays: 7 }),
  rss('ptwc', 'Pacific Tsunami Warning Center', 'Asia-Pacific', ['weather'], 'https://www.tsunami.gov/events/xml/PHEBAtom.xml', { maxAgeDays: 7, quietOk: true }),
  rss('gvp', 'Smithsonian Global Volcanism Program', 'Global', ['weather'], 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml', { maxAgeDays: 14 }),
  rss('un-climate', 'UN News — Climate', 'Global', ['weather'], 'https://news.un.org/feed/subscribe/en/news/topic/climate-change/feed/rss.xml'),
  rss('bbc-weather', 'BBC News', 'Europe', ['weather'], 'https://feeds.bbci.co.uk/news/world/rss.xml', { filter: 'hazards' }),
  rss('scmp-weather', 'SCMP', 'Asia-Pacific', ['weather'], 'https://www.scmp.com/rss/91/feed', { filter: 'hazards' }),
  rss('africanews-weather', 'Africanews', 'Africa', ['weather'], 'https://www.africanews.com/feed/rss', { filter: 'hazards' }),
  rss('aljazeera-weather', 'Al Jazeera', 'Middle East', ['weather'], 'https://www.aljazeera.com/xml/rss/all.xml', { filter: 'hazards' }),

  // ── Social media commentary ────────────────────────────────────────────────
  { id: 'hn-front', name: 'Hacker News front page', region: 'Global', tabs: ['social'], type: 'hn', frontPage: true },
  { id: 'mastodon-news', name: 'Mastodon #news', region: 'Global', tabs: ['social'], type: 'mastodon', instance: 'mastodon.social', tag: 'news' },
  { id: 'mastodon-world', name: 'Mastodon #worldnews', region: 'Global', tabs: ['social'], type: 'mastodon', instance: 'mastodon.social', tag: 'worldnews' },
  { id: 'mastodon-breaking', name: 'Mastodon #breakingnews', region: 'Global', tabs: ['social'], type: 'mastodon', instance: 'mastodon.world', tag: 'breakingnews' },
  { id: 'lemmy-world', name: 'Lemmy c/world', region: 'Global', tabs: ['social'], type: 'lemmy', instance: 'lemmy.world', community: 'world' },
  { id: 'lemmy-news', name: 'Lemmy c/news', region: 'Global', tabs: ['social'], type: 'lemmy', instance: 'lemmy.world', community: 'news' },
  rss('reddit-worldnews', 'Reddit r/worldnews', 'Global', ['social'], 'https://www.reddit.com/r/worldnews/hot/.rss'),
  rss('bsky-reuters', 'Bluesky @reuters.com', 'Global', ['social'], 'https://bsky.app/profile/reuters.com/rss'),
  rss('bsky-ap', 'Bluesky @apnews.com', 'Americas', ['social'], 'https://bsky.app/profile/apnews.com/rss'),

  // ── AI news ────────────────────────────────────────────────────────────────
  rss('verge-ai', 'The Verge — AI', 'Americas', ['ai'], 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'),
  rss('techcrunch-ai', 'TechCrunch — AI', 'Americas', ['ai'], 'https://techcrunch.com/category/artificial-intelligence/feed/'),
  rss('mittr-ai', 'MIT Technology Review — AI', 'Americas', ['ai'], 'https://www.technologyreview.com/topic/artificial-intelligence/feed', { maxAgeDays: 7 }),
  rss('ars-ai', 'Ars Technica — AI', 'Americas', ['ai'], 'https://arstechnica.com/ai/feed/'),
  rss('guardian-ai', 'The Guardian — AI', 'Europe', ['ai'], 'https://www.theguardian.com/technology/artificialintelligenceai/rss'),
  rss('bbc-tech', 'BBC Technology', 'Europe', ['ai'], 'https://feeds.bbci.co.uk/news/technology/rss.xml', { filter: 'ai' }),
  rss('scmp-tech', 'SCMP Tech', 'Asia-Pacific', ['ai'], 'https://www.scmp.com/rss/36/feed', { filter: 'ai' }),
  rss('openai-news', 'OpenAI News', 'Americas', ['ai'], 'https://openai.com/news/rss.xml', { maxAgeDays: 30 }),
  rss('deepmind', 'Google DeepMind Blog', 'Europe', ['ai'], 'https://deepmind.google/blog/rss.xml', { maxAgeDays: 30 }),
  rss('huggingface', 'Hugging Face Blog', 'Global', ['ai'], 'https://huggingface.co/blog/feed.xml', { maxAgeDays: 30 }),
  rss('arxiv-ai', 'arXiv cs.AI (new research)', 'Global', ['ai'], 'https://rss.arxiv.org/rss/cs.AI', { maxItems: 15, quietOk: true }), // empty at weekends
  { id: 'hn-ai', name: 'Hacker News', region: 'Global', tabs: ['ai'], type: 'hn', query: 'AI LLM GPT Claude Gemini OpenAI Anthropic', days: 2 },
];

// Topic filters used by sources that share a general feed with a topic tab.
export const FILTERS = {
  conflict: /\b(war|wars|military|troops|missile|missiles|strike|strikes|airstrike|drone|drones|army|navy|attack|attacks|ceasefire|shelling|rebels?|insurgen\w*|militants?|killed|bomb\w*|invasion|offensive|clashes|defen[cs]e)\b/i,
  politics: /\b(election|elections|vote|voters|parliament|president|prime minister|minister|government|senate|congress|opposition|coup|sanctions|diplomat\w*|summit|referendum|party|policy|protest\w*)\b/i,
  commodities: /\b(gold|silver|copper|platinum|palladium|aluminium|aluminum|nickel|zinc|lithium|uranium|iron ore|steel|oil|crude|brent|opec|gas|lng|diesel|petrol|gasoline|coal|wheat|corn|maize|soy\w*|rice|grain|cocoa|coffee|sugar|cotton|cattle|fertili[sz]er|commodit\w*|mining|miners?)\b/i,
  markets: /\b(stocks?|shares|equit\w*|index|indices|nasdaq|dow|s&p|ftse|nikkei|sensex|nifty|hang seng|bourse|exchange|investors?|ipo|earnings|rally|sell-?off|bonds?|yields?)\b/i,
  hazards: /\b(earthquake|quake|tsunami|hurricane|typhoon|cyclone|storm|flood\w*|wildfire|bushfire|fire|tornado|heatwave|heat wave|drought|landslide|volcan\w*|eruption|blizzard|monsoon|disaster|evacuat\w*)\b/i,
  ai: /\b(AI|A\.I\.|artificial intelligence|machine learning|chatbot|LLM|OpenAI|ChatGPT|Anthropic|Claude|Gemini|DeepMind|Nvidia|neural|robot\w*)\b/,
};

// ── Prices: free, keyless providers tried in order until one passes checks ──
//   symbol   Yahoo Finance symbol (first choice)
//   stooq    Stooq symbol            fred   FRED series id (St. Louis Fed)
//   cboe     Cboe symbol (US tickers are tried on Cboe automatically)
//   coinbase Coinbase product id     proxy  US ETF that tracks the commodity (last resort, labelled)

export const PRICE_GROUPS = {
  commodities: [
    { id: 'precious', title: 'Precious metals', icon: '🥇', items: [
      { symbol: 'GC=F', name: 'Gold', unit: 'USD/oz', stooq: 'gc.f', proxy: 'GLD', proxyName: 'SPDR Gold Shares' },
      { symbol: 'SI=F', name: 'Silver', unit: 'USD/oz', stooq: 'si.f', proxy: 'SLV', proxyName: 'iShares Silver Trust' },
      { symbol: 'PL=F', name: 'Platinum', unit: 'USD/oz', stooq: 'pl.f', proxy: 'PPLT', proxyName: 'abrdn Platinum ETF' },
      { symbol: 'PA=F', name: 'Palladium', unit: 'USD/oz', stooq: 'pa.f', proxy: 'PALL', proxyName: 'abrdn Palladium ETF' },
    ] },
    { id: 'industrial', title: 'Industrial & battery metals', icon: '🔩', items: [
      { symbol: 'HG=F', name: 'Copper', unit: 'USD/lb', stooq: 'hg.f', proxy: 'CPER', proxyName: 'US Copper Index Fund' },
      { symbol: 'DBB', name: 'Base metals (aluminium, zinc, copper)' },
      { symbol: 'LIT', name: 'Lithium & battery metals' },
      { symbol: 'URA', name: 'Uranium' },
    ] },
    { id: 'energy', title: 'Energy', icon: '🛢️', items: [
      { symbol: 'CL=F', name: 'Crude oil (WTI)', unit: 'USD/bbl', stooq: 'cl.f', fred: 'DCOILWTICO', proxy: 'USO', proxyName: 'United States Oil Fund' },
      { symbol: 'BZ=F', name: 'Crude oil (Brent)', unit: 'USD/bbl', stooq: 'cb.f', fred: 'DCOILBRENTEU', proxy: 'BNO', proxyName: 'United States Brent Oil Fund' },
      { symbol: 'NG=F', name: 'Natural gas (Henry Hub)', unit: 'USD/MMBtu', stooq: 'ng.f', fred: 'DHHNGSP', proxy: 'UNG', proxyName: 'United States Natural Gas Fund' },
      { symbol: 'RB=F', name: 'Gasoline (RBOB)', unit: 'USD/gal', stooq: 'rb.f', fred: 'DGASNYH', proxy: 'UGA', proxyName: 'United States Gasoline Fund' },
    ] },
    { id: 'grains', title: 'Grains & oilseeds', icon: '🌾', items: [
      { symbol: 'ZC=F', name: 'Corn', unit: 'USc/bu', stooq: 'zc.f', proxy: 'CORN', proxyName: 'Teucrium Corn Fund' },
      { symbol: 'ZW=F', name: 'Wheat', unit: 'USc/bu', stooq: 'zw.f', proxy: 'WEAT', proxyName: 'Teucrium Wheat Fund' },
      { symbol: 'ZS=F', name: 'Soybeans', unit: 'USc/bu', stooq: 'zs.f', proxy: 'SOYB', proxyName: 'Teucrium Soybean Fund' },
    ] },
    { id: 'softs', title: 'Softs & broad agriculture', icon: '☕', items: [
      { symbol: 'SB=F', name: 'Sugar', unit: 'USc/lb', stooq: 'sb.f', proxy: 'CANE', proxyName: 'Teucrium Sugar Fund' },
      { symbol: 'DBA', name: 'Agriculture basket (coffee, cocoa, sugar, cattle, grains)' },
      { symbol: 'DBC', name: 'Broad commodities basket' },
    ] },
  ],
  markets: [
    { id: 'americas', title: 'Americas indices', icon: '🌎', items: [
      { symbol: '^GSPC', name: 'S&P 500 (US)', stooq: '^spx', fred: 'SP500', proxy: 'SPY', proxyName: 'tracks the S&P 500' },
      { symbol: '^IXIC', name: 'NASDAQ Composite (US)', stooq: '^ndq', fred: 'NASDAQCOM', proxy: 'ONEQ', proxyName: 'tracks the NASDAQ Composite' },
      { symbol: '^DJI', name: 'Dow Jones (US)', stooq: '^dji', fred: 'DJIA', proxy: 'DIA', proxyName: 'tracks the Dow Jones' },
      { symbol: '^RUT', name: 'Russell 2000 (US)', cboe: '_RUT' },
      { symbol: '^GSPTSE', name: 'Canada', proxy: 'EWC', proxyName: 'MSCI Canada' },
      { symbol: '^BVSP', name: 'Brazil', proxy: 'EWZ', proxyName: 'MSCI Brazil' },
      { symbol: '^MXX', name: 'Mexico', proxy: 'EWW', proxyName: 'MSCI Mexico' },
    ] },
    { id: 'emea', title: 'Europe, Middle East & Africa', icon: '🌍', items: [
      { symbol: '^FTSE', name: 'United Kingdom', stooq: '^ukx', proxy: 'EWU', proxyName: 'MSCI United Kingdom' },
      { symbol: '^GDAXI', name: 'Germany', stooq: '^dax', proxy: 'EWG', proxyName: 'MSCI Germany' },
      { symbol: '^FCHI', name: 'France', stooq: '^cac', proxy: 'EWQ', proxyName: 'MSCI France' },
      { symbol: '^STOXX50E', name: 'Euro Stoxx 50', proxy: 'FEZ', proxyName: 'tracks the Euro Stoxx 50' },
      { symbol: '^SSMI', name: 'Switzerland', proxy: 'EWL', proxyName: 'MSCI Switzerland' },
      { symbol: '^TA125.TA', name: 'Israel', proxy: 'EIS', proxyName: 'MSCI Israel' },
      { symbol: '^J203.JO', name: 'South Africa', proxy: 'EZA', proxyName: 'MSCI South Africa' },
    ] },
    { id: 'apac', title: 'Asia-Pacific', icon: '🌏', items: [
      { symbol: '^N225', name: 'Japan', stooq: '^nkx', fred: 'NIKKEI225', proxy: 'EWJ', proxyName: 'MSCI Japan' },
      { symbol: '^HSI', name: 'Hong Kong', stooq: '^hsi', proxy: 'EWH', proxyName: 'MSCI Hong Kong' },
      { symbol: '000001.SS', name: 'China', proxy: 'MCHI', proxyName: 'MSCI China' },
      { symbol: '^KS11', name: 'South Korea', proxy: 'EWY', proxyName: 'MSCI South Korea' },
      { symbol: '^TWII', name: 'Taiwan', proxy: 'EWT', proxyName: 'MSCI Taiwan' },
      { symbol: '^BSESN', name: 'India', proxy: 'INDA', proxyName: 'MSCI India' },
      { symbol: '^AXJO', name: 'Australia', proxy: 'EWA', proxyName: 'MSCI Australia' },
      { symbol: '^STI', name: 'Singapore', proxy: 'EWS', proxyName: 'MSCI Singapore' },
    ] },
    { id: 'stocks', title: 'Major stocks (NYSE & NASDAQ)', icon: '🏢', items: [
      'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'BRK-B', 'JPM', 'V', 'MA', 'LLY', 'UNH', 'XOM',
      'CVX', 'JNJ', 'WMT', 'COST', 'PG', 'HD', 'KO', 'PEP', 'NFLX', 'AMD', 'ORCL', 'CRM', 'ADBE', 'INTC', 'BAC',
      'TSM', 'ASML', 'NVO', 'SAP', 'TM', 'BABA', 'SONY', 'SHEL',
    ].map((s) => ({ symbol: s, name: s, stooq: `${s.toLowerCase().replace('-', '.')}.us` })) },
    { id: 'etfs', title: 'Market ETFs', icon: '📦', items: [
      { symbol: 'SPY', name: 'S&P 500 ETF' }, { symbol: 'QQQ', name: 'NASDAQ-100 ETF' }, { symbol: 'DIA', name: 'Dow ETF' },
      { symbol: 'IWM', name: 'Small caps ETF' }, { symbol: 'EFA', name: 'Developed markets ex-US ETF' },
      { symbol: 'EEM', name: 'Emerging markets ETF' }, { symbol: 'GLD', name: 'Gold ETF' }, { symbol: 'TLT', name: '20+yr Treasuries ETF' },
    ].map((x) => ({ ...x, stooq: `${x.symbol.toLowerCase()}.us` })) },
  ],
  finance: [
    { id: 'stress', title: 'Market stress & US rates', icon: '🌡️', items: [
      { symbol: '^VIX', name: 'VIX volatility index', stooq: '^vix', cboe: '_VIX', fred: 'VIXCLS', invert: true },
      { symbol: '^IRX', name: 'US 3-month Treasury yield (%)', treasury: '3 Mo' },
      { symbol: 'US2Y', name: 'US 2-year Treasury yield (%)', treasury: '2 Yr' },
      { symbol: '^TNX', name: 'US 10-year Treasury yield (%)', treasury: '10 Yr' },
      { symbol: '^TYX', name: 'US 30-year Treasury yield (%)', treasury: '30 Yr' },
      { symbol: 'DX-Y.NYB', name: 'US Dollar index (DXY)', dxy: true },
    ] },
    { id: 'fx', title: 'Currencies (ECB reference rates)', icon: '💱', items: [
      { symbol: 'EURUSD=X', name: 'EUR/USD', fx: 'EUR/USD' },
      { symbol: 'JPY=X', name: 'USD/JPY', fx: 'USD/JPY' },
      { symbol: 'GBPUSD=X', name: 'GBP/USD', fx: 'GBP/USD' },
      { symbol: 'CNY=X', name: 'USD/CNY', fx: 'USD/CNY' },
      { symbol: 'INR=X', name: 'USD/INR', fx: 'USD/INR' },
      { symbol: 'BRL=X', name: 'USD/BRL', fx: 'USD/BRL' },
      { symbol: 'ZAR=X', name: 'USD/ZAR', fx: 'USD/ZAR' },
      { symbol: 'TRY=X', name: 'USD/TRY', fx: 'USD/TRY' },
    ] },
    { id: 'crypto', title: 'Crypto', icon: '₿', items: [
      { symbol: 'BTC-USD', name: 'Bitcoin', coinbase: 'BTC-USD' },
      { symbol: 'ETH-USD', name: 'Ether', coinbase: 'ETH-USD' },
    ] },
  ],
};
