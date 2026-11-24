// Static single-file dashboard: renders the ranked board as an HTML table.
// No network, no framework; data is embedded at build time.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');

export function renderDashboard(snapshot, rows) {
  const trs = rows.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${esc(r.category ?? '—')}</td>` +
    `<td>${usd(r.tvl_usd)}</td><td>${usd(r.implied_value_usd)}</td><td>${esc(r.multiple_basis)} (${r.multiple_peers})</td>` +
    `<td>${r.change_7d == null ? '—' : r.change_7d.toFixed(2) + '%'}</td><td>${r.on_watchlist ? 'yes' : 'no'}</td>` +
    `<td>${esc((r.chains || []).join(', '))}</td></tr>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Token Launch Radar — ${esc(snapshot.as_of)}</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#0b0e14;color:#e6e6e6}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:.4rem .6rem;text-align:left}th{background:#161b26}h1{font-size:1.4rem}.note{color:#9aa4b2;max-width:60rem}</style></head>
<body><h1>Token Launch Radar</h1>
<p class="note">Snapshot: ${esc(snapshot.source)} (as of ${esc(snapshot.as_of)}). Candidates are protocols that record no token
(gecko_id and symbol both null), excluding wrapped/staked/bridged products and versioned siblings.
Implied value = TVL &times; median market-cap/TVL multiple of token-bearing peers in the same category
(global median when a category has fewer than 3 peers). This is a heuristic estimate derived only from
the sealed snapshot, not a price prediction.</p>
<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Implied value</th><th>Multiple basis (peers)</th><th>7d change</th><th>On house watchlist</th><th>Chains</th></tr></thead>
<tbody>
${trs}
</tbody></table></body></html>
`;
}
