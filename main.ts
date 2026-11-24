// Token Launch Radar — entry point (Node 22, standard library only).
//
// Reads the sealed snapshot (--input <file|dir>, default /input/snapshot.json),
// builds the ranked board with lib/model.ts, and writes into the output dir
// (MAKEFUN_OUTPUT_DIR locally, /output in the grader):
//   board.json    the ranked rows the gate checks
//   data.js       the dashboard's dataset (window.RADAR)
//   dashboard/    a copy of this repository's dashboard/
//   screenshots/  a copy of this repository's screenshots/
//   dossier.json  buildDossier(...) from vendor/makefun-board.ts, written last
//                 whenever screenshots are present; without screenshots the
//                 dossier library refuses by design, so the run warns and
//                 leaves the gap visible instead of fabricating images.
//
// Local run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ as_of: snapshot.as_of, source: snapshot.source, rows: board }, null, 2)}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    const st = statSync(src);
    if (st.isDirectory()) {
      copied.push(...copyTree(src, join(to, name)).map((n) => `${name}/${n}`));
    } else if (st.isFile()) {
      copyFileSync(src, join(to, name));
      copied.push(name);
    }
  }
  return copied;
}

const dashFiles = copyTree(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

let dossierNote = 'dossier.json not written: no screenshots yet (buildDossier refuses an empty screenshots/)';
if (shots.length > 0) {
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: 65_536,
      screenshots: { max: 4, max_bytes: 524_288 },
      dashboard: { max_files: 400, max_bytes: 4_194_304 },
    }),
  );
  dossierNote = `dossier.json written from ${shots.length} screenshot(s)`;
}

const covered = board.filter((r) => r.on_watchlist).length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${board.length} rows ranked, watchlist coverage ${covered}/${snapshot.watchlist.length}\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} files); ${dossierNote}\n`,
);
