// Token Launch Radar dashboard: renders window.RADAR (written beside this
// page as ../data.js by main.ts). No network, no framework. Supports text
// search, category / chain / watchlist / growth filters, column sorting and
// a per-protocol detail view with its farm plan.
(function () {
  var data = window.RADAR || { rows: [], as_of: '', source: '', watchlist_size: 0, board_size: 0, floor_usd: 0 };
  var rows = data.rows.slice();
  var sortKey = 'rank';
  var sortDir = 1;
  var selected = null;

  // Shareable views: #q=...&cat=...&chain=...&watch=1&growth=1&slug=<protocol-slug>
  function hashParams() {
    var out = {};
    var h = (location.hash || '').replace(/^#/, '');
    h.split('&').forEach(function (part) {
      if (!part) return;
      var eq = part.indexOf('=');
      var k = eq >= 0 ? part.slice(0, eq) : part;
      var v = eq >= 0 ? part.slice(eq + 1) : '';
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    });
    return out;
  }
  var deepLink = hashParams();

  // Write the current view back to the URL hash so the link in the address
  // bar always shares exactly what is on screen. replaceState keeps this
  // out of the browser history (no entry per keystroke or click).
  function syncHash() {
    var parts = [];
    var q = document.getElementById('q').value.trim();
    if (q) parts.push('q=' + encodeURIComponent(q));
    if (catSel.value) parts.push('cat=' + encodeURIComponent(catSel.value));
    if (chainSel.value) parts.push('chain=' + encodeURIComponent(chainSel.value));
    if (document.getElementById('watch').checked) parts.push('watch=1');
    if (document.getElementById('growth').checked) parts.push('growth=1');
    if (selected) parts.push('slug=' + encodeURIComponent(selected));
    try {
      history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
    } catch (e) { /* file:// or restricted contexts: the view still renders */ }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) { return n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

  var meta = document.getElementById('meta');
  meta.textContent = 'Snapshot ' + data.as_of + ' · ' + data.board_size + ' pre-token protocols ranked · ' +
    data.watchlist_size + ' on the house watchlist (floor ' + usd(data.floor_usd) + ') · Source: ' + data.source;

  var catSel = document.getElementById('cat');
  var chainSel = document.getElementById('chain');
  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = true;
    (r.chains || []).forEach(function (c) { chains[c] = true; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  function visible() {
    var q = document.getElementById('q').value.trim().toLowerCase();
    var cat = catSel.value, chain = chainSel.value;
    var watchOnly = document.getElementById('watch').checked;
    var growthOnly = document.getElementById('growth').checked;
    var out = rows.filter(function (r) {
      if (watchOnly && !r.on_watchlist) return false;
      if (growthOnly && !(r.change_7d != null && r.change_7d >= 0)) return false;
      if (cat && r.category !== cat) return false;
      if (chain && (r.chains || []).indexOf(chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    out.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string') return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });
    return out;
  }

  function render() {
    var list = visible();
    document.getElementById('count').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' protocols';
    var html = list.map(function (r) {
      var cls = selected === r.slug ? ' class="selected"' : '';
      var chg = r.change_7d == null ? '' : (r.change_7d >= 0 ? ' class="num up"' : ' class="num down"');
      return '<tr data-slug="' + esc(r.slug) + '"' + cls + '>' +
        '<td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td><td class="num">' + usd(r.implied_value_usd) + '</td>' +
        '<td' + (chg || ' class="num"') + '>' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days == null ? '—' : r.age_days) + '</td>' +
        '<td>' + (r.on_watchlist ? '<span class="badge">watchlist</span>' : '—') + '</td>' +
        '<td>' + esc((r.chains || []).join(', ')) + '</td></tr>';
    }).join('');
    document.getElementById('rows').innerHTML = html || '<tr><td colspan="9">No protocol matches these filters.</td></tr>';
    syncHash();
  }

  function showDetail(r) {
    selected = r.slug;
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    document.getElementById('detail').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorised') +
      (r.on_watchlist ? ' · on the house watchlist' : ' · early find below the watchlist floor') + '</p>' +
      '<dl>' +
      '<dt>Implied value</dt><dd>' + usd(r.implied_value_usd) + '</dd>' +
      '<dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd>' +
      '<dt>7d TVL change</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Age</dt><dd>' + (r.age_days == null ? 'unknown' : r.age_days + ' days (listed ' + esc(r.listed_at || '—') + ')') + '</dd>' +
      '<dt>Multiple basis</dt><dd>' + esc(r.multiple_basis) + ' median of ' + r.multiple_peers + ' token-bearing peers</dd>' +
      '<dt>Chains</dt><dd>' + esc((r.chains || []).join(', ') || '—') + '</dd>' +
      '<dt>Token status</dt><dd>records no token in the snapshot</dd>' +
      '</dl>' +
      '<h3>Farm plan</h3><ol>' + steps + '</ol>';
    render();
  }

  document.getElementById('rows').addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { showDetail(rows[i]); break; }
  });
  document.querySelectorAll('th[data-key]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = key === 'name' || key === 'category' ? 1 : -1; if (key === 'rank') sortDir = 1; }
      render();
    });
  });
  ['q', 'cat', 'chain', 'watch', 'growth'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', render);
    document.getElementById(id).addEventListener('change', render);
  });

  if (deepLink.q) document.getElementById('q').value = deepLink.q;
  if (deepLink.cat) catSel.value = deepLink.cat;
  if (deepLink.chain) chainSel.value = deepLink.chain;
  if (deepLink.watch === '1') document.getElementById('watch').checked = true;
  if (deepLink.growth === '1') document.getElementById('growth').checked = true;
  render();
  if (deepLink.slug) {
    var found = false;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === deepLink.slug) { showDetail(rows[i]); found = true; break; }
    if (!found && rows.length > 0) showDetail(rows[0]);
  } else if (rows.length > 0) showDetail(rows[0]);
})();
