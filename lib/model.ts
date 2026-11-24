// Token Launch Radar — model (authored for this entry).
//
// Selection follows the snapshot's own watchlist rule: a protocol is a
// candidate when it records no token (gecko_id and symbol both null), is not
// a wrapped / staked / bridged product of something that already trades, and
// is not a versioned sibling of another protocol.
//
// Implied value combines three signals, all from the snapshot itself:
//   multiple  = median mcap/TVL of token-bearing peers in the same category
//               (global median when the category has fewer than 3 peers)
//   growth    = 1 + clamp(change_7d, -60, 120)/100 * 0.5
//   maturity  = 0.6 + min(age_days, 1095)/1095 * 0.4  (unknown age: 365 days)
//   implied   = round(TVL * multiple * growth * maturity), at least 1
// No protocol name is ever special-cased.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  multiple_basis: string;
  multiple_peers: number;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  multiple_basis: string;
  multiple_peers: number;
  farm_steps: string[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  board_size: number;
  rows: RadarRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const DAY_MS = 86_400_000;

export function hasNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id == null && p.symbol == null;
}

export function isWrappedOrStakedProduct(p: SnapshotProtocol): boolean {
  if (p.category != null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIX.test(p.name)) return true;
  return false;
}

export function isVersionedName(p: SnapshotProtocol): boolean {
  return VERSION_SUFFIX.test(p.name);
}

export function isCandidate(p: SnapshotProtocol): boolean {
  return hasNoToken(p) && !isWrappedOrStakedProduct(p) && !isVersionedName(p);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function categoryMultiples(protocols: SnapshotProtocol[]): {
  catMed: Map<string, { multiple: number | null; peers: number }>;
  globalMed: number | null;
  globalPeers: number;
} {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd != null && p.tvl_usd > 0) {
      const r = p.mcap_usd / p.tvl_usd;
      all.push(r);
      const key = p.category ?? '(none)';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(r);
    }
  }
  const catMed = new Map<string, { multiple: number | null; peers: number }>();
  for (const [k, v] of byCat) catMed.set(k, { multiple: median(v), peers: v.length });
  return { catMed, globalMed: median(all), globalPeers: all.length };
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function growthMultiplier(change7d: number | null): number {
  const raw = typeof change7d === 'number' && Number.isFinite(change7d) ? change7d : 0;
  const clamped = Math.min(120, Math.max(-60, raw));
  return 1 + (clamped / 100) * 0.5;
}

export function maturityMultiplier(age: number | null): number {
  const days = age ?? 365;
  return 0.6 + (Math.min(Math.max(days, 0), 1095) / 1095) * 0.4;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain} and keep the supplied position open and healthy.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged')) return `Provide $${capital} of liquidity to the main pool of ${n} on ${chain} and keep the LP position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n} and then use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} worth of the chain staking asset through ${n} and keep the staking receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${n} and open one small hedged trade to generate volume.`;
  if (c.includes('prediction')) return `Fund the wallet with $${capital} and place one small market position on ${n} each week.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a curated vault of ${n} on ${chain} and keep the vault shares untouched.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold the balance.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield asset of ${n} on ${chain} and hold it in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy active for the season.`;
  if (c.includes('nft')) return `Buy one floor listing on ${n} and complete one small trade so the wallet shows real usage.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open in the farming wallet.`;
}

/** Six concrete farm steps per protocol, each a single string of 20..600 chars with cost and time. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const steps = [
    `Create a fresh wallet for ${p.name} only, fund it on ${chain}, and store the seed phrase offline. Cost: under $3 of gas. Time: 5 minutes.`,
    `${actionFor(p, capital, chain)} Cost: $${capital} of capital plus about $${gas} of gas. Time: 15 minutes to set up.`,
    `Repeat one qualifying action every week, such as a deposit, a borrow, a swap, a stake or a governance vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so the activity spans more than one weekly snapshot of the protocol. Cost: the $${capital} stays locked in the position. Time: ${hold} days.`,
    `Check the protocol's own points, rewards or governance page weekly and claim only through links that page itself publishes. Cost: nothing to check, never pay a fee to claim. Time: 10 minutes a week.`,
    `Keep a farm log with the wallet address, every date, amount and transaction hash, so the position can be repeated or unwound safely. Cost: nothing. Time: 5 minutes per entry.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { catMed, globalMed, globalPeers } = categoryMultiples(snapshot.protocols);
  const scored: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isCandidate(p)) continue;
    const cat = catMed.get(p.category ?? '(none)');
    let multiple: number | null = null;
    let basis = 'none';
    let peers = 0;
    if (cat && cat.peers >= 3 && cat.multiple != null) {
      multiple = cat.multiple; basis = 'category'; peers = cat.peers;
    } else if (globalMed != null) {
      multiple = globalMed; basis = 'global'; peers = globalPeers;
    }
    if (multiple == null) continue;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const implied = Math.min(
      100_000_000_000_000,
      Math.max(1, Math.round(p.tvl_usd * multiple * growthMultiplier(p.change_7d) * maturityMultiplier(age))),
    );
    scored.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      on_watchlist: snapshot.watchlist.includes(p.slug),
      age_days: age,
      implied_value_usd: implied,
      multiple_basis: basis,
      multiple_peers: peers,
      farm_steps: farmSteps(p, age),
    });
  }
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  return scored.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    rows: board.map((r) => ({ ...r })),
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string') throw new SnapshotError('snapshot.json has no as_of');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !(o.floor_usd > 0)) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new SnapshotError(`protocol ${i} lacks slug, name or tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'board has a duplicate slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (r.rank !== i + 1) return `row ${i} has rank ${r.rank}`;
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${r.slug} outranks the row above it`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has a bad implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: not a ranking';
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
