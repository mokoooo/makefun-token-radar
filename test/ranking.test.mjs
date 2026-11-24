import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCandidate, rankCandidates } from '../src/ranking.mjs';

const P = (over) => ({ slug: 'x', name: 'X', category: 'Lending', chains: ['Ethereum'], tvl_usd: 100_000_000, change_7d: 1.5, mcap_usd: null, listed_at: '2025-01-01', gecko_id: null, symbol: null, ...over });

test('token-bearing protocol is not a candidate', () => {
  assert.equal(isCandidate(P({ gecko_id: 'x', symbol: 'X' })), false);
  assert.equal(isCandidate(P({ symbol: 'X' })), false);
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
test('ranking uses category median multiple and sorts by implied value desc', () => {
  const peers = [0.5, 1.0, 1.5].map((r, i) => P({ slug: `peer${i}`, name: `Peer${i}`, gecko_id: `g${i}`, symbol: `P${i}`, mcap_usd: 100_000_000 * r }));
  const small = P({ slug: 'small', name: 'Small', tvl_usd: 60_000_000 });
  const big = P({ slug: 'big', name: 'Big', tvl_usd: 120_000_000 });
  const snap = { as_of: '2026-01-01', source: 'fixture', floor_usd: 50_000_000, protocols: [...peers, small, big], watchlist: ['big'] };
  const rows = rankCandidates(snap);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].slug, 'big');
  assert.equal(rows[0].implied_value_usd, 120_000_000); // median multiple = 1.0
  assert.equal(rows[0].multiple_basis, 'category');
  assert.equal(rows[0].on_watchlist, true);
  assert.equal(rows[1].implied_value_usd, 60_000_000);
});
test('dashboard renders rows without external references', async () => {
  const { renderDashboard } = await import('../src/dashboard.mjs');
  const html = renderDashboard({ as_of: '2026-01-01', source: 'fixture' }, [{ rank: 1, name: 'Big', category: 'Lending', tvl_usd: 5, implied_value_usd: 5, multiple_basis: 'global', multiple_peers: 3, change_7d: null, on_watchlist: false, chains: ['Ethereum'] }]);
  assert.match(html, /Token Launch Radar/);
  assert.doesNotMatch(html, /https?:\/\//);
});
