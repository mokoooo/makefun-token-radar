// Token Launch Radar — candidate selection and implied-value ranking.
// Pure functions over the sealed DefiLlama snapshot schema (see snapshot.json):
// { slug, name, category, chains, tvl_usd, change_7d, mcap_usd, listed_at, gecko_id, symbol }

const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A protocol still records no token when both token identifiers are null. */
export function hasNoToken(p) {
  return p.gecko_id == null && p.symbol == null;
}

/** Wrapped/staked/bridged products of something that already trades are not launches. */
export function isWrappedOrStakedProduct(p) {
  if (p.category != null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

export function isVersionedName(p) {
  return VERSION_SUFFIX.test(p.name);
}

/** Candidate = pre-token, not a wrapped/staked product, not a versioned sibling. */
export function isCandidate(p) {
  return hasNoToken(p) && !isWrappedOrStakedProduct(p) && !isVersionedName(p);
}

function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Implied launch value: TVL x the median mcap/TVL multiple of token-bearing
 * peers in the same category (fallback: global median multiple).
 * Returns { multiple, basis: 'category'|'global'|'none', peers }.
 */
export function categoryMultiples(protocols) {
  const byCat = new Map();
  const all = [];
  for (const p of protocols) {
    if (p.mcap_usd != null && p.tvl_usd > 0) {
      const r = p.mcap_usd / p.tvl_usd;
      all.push(r);
      const key = p.category ?? '(none)';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(r);
    }
  }
  const globalMed = median(all);
  const catMed = new Map();
  for (const [k, v] of byCat) catMed.set(k, { multiple: median(v), peers: v.length });
  return { catMed, globalMed, globalPeers: all.length };
}

export function rankCandidates(snapshot, { limit = 100 } = {}) {
  const { catMed, globalMed, globalPeers } = categoryMultiples(snapshot.protocols);
  const rows = [];
  for (const p of snapshot.protocols) {
    if (!isCandidate(p)) continue;
    const cat = catMed.get(p.category ?? '(none)');
    let multiple = null, basis = 'none', peers = 0;
    if (cat && cat.peers >= 3) { multiple = cat.multiple; basis = 'category'; peers = cat.peers; }
    else if (globalMed != null) { multiple = globalMed; basis = 'global'; peers = globalPeers; }
    const implied = multiple == null ? null : Math.round(p.tvl_usd * multiple);
    rows.push({
      slug: p.slug, name: p.name, category: p.category, chains: p.chains,
      tvl_usd: p.tvl_usd, change_7d: p.change_7d, listed_at: p.listed_at,
      on_watchlist: snapshot.watchlist.includes(p.slug),
      implied_value_usd: implied,
      multiple_basis: basis, multiple_peers: peers,
    });
  }
  rows.sort((a, b) => (b.implied_value_usd ?? -1) - (a.implied_value_usd ?? -1) || b.tvl_usd - a.tvl_usd);
  return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}
