// CLI: node analyze.mjs --input <snapshot.json> --out <dir>
// Writes <dir>/board.json (ranked rows) and <dir>/dashboard.html (static, no network).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { rankCandidates } from './src/ranking.mjs';
import { renderDashboard } from './src/dashboard.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const input = opt('input', 'token-radar-01-kit/input/snapshot.json');
const outDir = opt('out', 'out');
const snapshot = JSON.parse(readFileSync(input, 'utf8'));
const rows = rankCandidates(snapshot, { limit: 200 });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), JSON.stringify({ as_of: snapshot.as_of, source: snapshot.source, rows }, null, 2) + '\n');
writeFileSync(join(outDir, 'dashboard.html'), renderDashboard(snapshot, rows));
console.log(`token-radar: ${snapshot.protocols.length} protocols, ${rows.length} pre-token candidates ranked -> ${outDir}/board.json, ${outDir}/dashboard.html`);
