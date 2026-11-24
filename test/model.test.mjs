// Tests for the shipped model (lib/model.ts) and the shipped dashboard files.
// Node 22.18+ strips types on .ts import, so the same code main.ts runs is
// what these tests exercise. The earlier src/ prototype is not imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCandidate, buildBoard, buildRadar, farmSteps, boardIssue,
  parseSnapshot, dataScript,
} from '../lib/model.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const P = (over) => ({ slug: 'x', name: 'X', category: 'Lending', chains: ['Ethereum'], tvl_usd: 100_000_000, change_7d: 1.5, mcap_usd: null, listed_at: '2025-01-01', gecko_id: null, symbol: null, ...over });

test('token-bearing protocol is not a candidate', () => {
  assert.equal(isCandidate(P({ gecko_id: 'x', symbol: 'X' })), false);
  assert.equal(isCandidate(P({ symbol: 'X' })), false);
  assert.equal(isCandidate(P({})), true);
});
test('wrapped/staked/bridge products are excluded', () => {
  assert.equal(isCandidate(P({ name: 'Wrapped Ether' })), false);
  assert.equal(isCandidate(P({ name: 'Foo Staked ETH' })), false);
  assert.equal(isCandidate(P({ category: 'Liquid Staking' })), false);
  assert.equal(isCandidate(P({ category: 'Bridge' })), false);
  assert.equal(isCandidate(P({ name: 'Binance Staked SOL' })), false);
});
test('versioned sibling names are excluded', () => {
  assert.equal(isCandidate(P({ name: 'Aave V3' })), false);
  assert.equal(isCandidate(P({ name: 'Uni 2.0' })), false);
  assert.equal(isCandidate(P({ name: 'Aave' })), true);
});
test('ranking uses category median multiple with growth and maturity adjustments', () => {
  const peers = [0.5, 1.0, 1.5].map((r, i) => P({ slug: `peer${i}`, name: `Peer${i}`, gecko_id: `g${i}`, symbol: `P${i}`, mcap_usd: 100_000_000 * r }));
  const small = P({ slug: 'small', name: 'Small', tvl_usd: 60_000_000 });
  const big = P({ slug: 'big', name: 'Big', tvl_usd: 120_000_000 });
  const snap = { as_of: '2026-01-01', source: 'fixture', floor_usd: 50_000_000, protocols: [...peers, small, big], watchlist: ['big'] };
  const rows = buildBoard(snap);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].slug, 'big');
  // median multiple 1.0; growth 1 + (1.5/100)*0.5 = 1.0075; maturity 0.6 + (365/1095)*0.4 = 11/15
  assert.equal(rows[0].implied_value_usd, 88_660_000); // 120M * 1.0075 * 11/15
  assert.equal(rows[0].multiple_basis, 'category');
  assert.equal(rows[0].multiple_peers, 3);
  assert.equal(rows[0].on_watchlist, true);
  assert.equal(rows[1].implied_value_usd, 44_330_000); // 60M * 1.0075 * 11/15
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[1].rank, 2);
});
test('global median is used when a category has fewer than 3 peers', () => {
  const lendingPeers = [0.5, 1.0, 1.5].map((r, i) => P({ slug: `lp${i}`, name: `LP${i}`, gecko_id: `g${i}`, symbol: `L${i}`, mcap_usd: 100_000_000 * r }));
  const rwaPeer = P({ slug: 'rwa-peer', name: 'RWA Peer', category: 'RWA', gecko_id: 'rw', symbol: 'RW', mcap_usd: 200_000_000 });
  const cand = P({ slug: 'cand', name: 'Cand', category: 'RWA', tvl_usd: 80_000_000, change_7d: null, listed_at: null });
  const snap = { as_of: '2026-01-01', source: 'fixture', floor_usd: 50_000_000, protocols: [...lendingPeers, rwaPeer, cand], watchlist: [] };
  const rows = buildBoard(snap);
  assert.equal(rows.length, 1);
  // global multiples [0.5, 1.0, 1.5, 2.0] -> median 1.25; growth 1.0; maturity 11/15 (unknown age = 365d)
  assert.equal(rows[0].multiple_basis, 'global');
  assert.equal(rows[0].multiple_peers, 4);
  assert.equal(rows[0].implied_value_usd, 73_333_333); // 80M * 1.25 * 11/15, rounded
});
test('board at scale: ranks, farm steps and boardIssue on a synthetic snapshot', () => {
  const peers = [1.0, 1.0, 1.0].map((r, i) => P({ slug: `peer${i}`, name: `Peer${i}`, gecko_id: `g${i}`, symbol: `P${i}`, mcap_usd: 100_000_000 * r }));
  const chains = ['Ethereum', 'Base', 'Solana'];
  const changes = [-10, 10];
  const listed = ['2025-01-01', '2025-06-01', '2025-12-01'];
  // Strides are independent (chain i%3, change i%2, listed floor(i/3)%3) so the
  // farm-step variation is genuinely exercised rather than correlated.
  const cands = Array.from({ length: 105 }, (_, i) => P({
    slug: `cand-${i}`, name: `Cand ${i}`, chains: [chains[i % 3]], tvl_usd: (i + 1) * 1_000_000,
    change_7d: changes[i % 2], listed_at: listed[Math.floor(i / 3) % 3],
  }));
  const snap = { as_of: '2026-01-01', source: 'fixture', floor_usd: 50_000_000, protocols: [...peers, ...cands], watchlist: ['cand-0', 'cand-50', 'cand-104'] };
  const rows = buildBoard(snap);
  assert.equal(rows.length, 105);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[104].rank, 105);
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].rank, i + 1);
    if (i > 0) assert.ok(rows[i].implied_value_usd <= rows[i - 1].implied_value_usd, 'implied value must not rise with rank');
    assert.equal(rows[i].farm_steps.length, 6);
    for (const s of rows[i].farm_steps) assert.ok(s.length >= 20 && s.length <= 600, `farm step length ${s.length}`);
  }
  assert.equal(boardIssue(rows, snap), null);
  assert.ok(snap.watchlist.every((s) => rows.some((r) => r.slug === s)), 'all watchlist slugs on the board');
  // Farm plans must differ per protocol (regression: steps 3/5/6 were once byte-identical across all rows).
  // Bounds are what the fixture construction guarantees structurally:
  // step 3: 3 chains x 2 growth notes; step 4: 3 hold/age combos; step 5: per-name;
  // step 6: 2 capital tiers x 3 chains.
  const distinct = (idx) => new Set(rows.map((r) => r.farm_steps[idx])).size;
  assert.ok(distinct(2) >= 6, `step 3 distinctness ${distinct(2)}`);
  assert.ok(distinct(3) >= 3, `step 4 distinctness ${distinct(3)}`);
  assert.ok(distinct(4) >= 100, `step 5 distinctness ${distinct(4)}`);
  assert.ok(distinct(5) >= 6, `step 6 distinctness ${distinct(5)}`);
  // farmSteps itself: every step carries a cost and a time.
  for (const r of rows) for (const s of r.farm_steps) { assert.match(s, /Cost:/); assert.match(s, /Time:/); }
});
test('parseSnapshot rejects non-JSON and missing fields', () => {
  assert.throws(() => parseSnapshot('not json'), /not JSON/);
  assert.throws(() => parseSnapshot('{}'), /as_of/);
  assert.throws(() => parseSnapshot('[]'), /not a JSON object/);
  const ok = parseSnapshot(JSON.stringify({ as_of: '2026-01-01', source: 'fixture', floor_usd: 1, protocols: [], watchlist: [] }));
  assert.equal(ok.as_of, '2026-01-01');
});
test('dashboard static files carry no external references', () => {
  for (const f of ['index.html', 'app.js', 'app.css']) {
    const text = readFileSync(join(HERE, '..', 'dashboard', f), 'utf8');
    assert.doesNotMatch(text, /https?:\/\//, `${f} must not reference external URLs`);
  }
  const app = readFileSync(join(HERE, '..', 'dashboard', 'app.js'), 'utf8');
  assert.match(app, /replaceState/, 'app.js writes the view back to the URL hash');
});
test('dataScript wraps the radar payload as window.RADAR', () => {
  const peers = [1.0, 1.0, 1.0].map((r, i) => P({ slug: `peer${i}`, name: `Peer${i}`, gecko_id: `g${i}`, symbol: `P${i}`, mcap_usd: 100_000_000 * r }));
  const snap = { as_of: '2026-01-01', source: 'fixture', floor_usd: 50_000_000, protocols: [...peers, P({ slug: 'a', name: 'A' }), P({ slug: 'b', name: 'B', tvl_usd: 200_000_000 })], watchlist: [] };
  const { radar } = buildRadar(snap);
  const script = dataScript(radar);
  assert.ok(script.startsWith('window.RADAR='));
  const parsed = JSON.parse(script.slice('window.RADAR='.length).replace(/;\n$/, ''));
  assert.equal(parsed.rows.length, 2);
});
