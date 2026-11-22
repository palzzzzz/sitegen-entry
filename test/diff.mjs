// Differential tester: for many seeds, draws a case set with the kit's own generator (program/generator/draw.ts), runs
// this repo's main.ts on the drawn cases and compares its answers.json with the reference's (the generator's
// expected.json, the oracle's answers) byte for byte.
//
//   node test/diff.mjs --kit <kit dir> [--seeds 50] [--start 0] [--keep]
//
// Seed i is sha256("diff-seed:" + i) in hex. Exits 1 on the first mismatch of any seed (after reporting every seed's).

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? dflt : args[i + 1];
};
const kit = opt('kit', process.env.MAKEFUN_KIT);
if (!kit) {
  console.error('usage: node test/diff.mjs --kit <kit dir> [--seeds N] [--start K] [--keep]');
  process.exit(2);
}
const seeds = Number(opt('seeds', '50'));
const start = Number(opt('start', '0'));
const keep = args.includes('--keep');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const drawTs = join(resolve(kit), 'program', 'generator', 'draw.ts');
const mainTs = join(root, 'main.ts');
const work = mkdtempSync(join(tmpdir(), 'makefun-diff-'));

const run = (script, inDir, outDir) => {
  mkdirSync(outDir, { recursive: true });
  const r = spawnSync(process.execPath, [script], {
    env: { ...process.env, MAKEFUN_INPUT_DIR: inDir, MAKEFUN_OUTPUT_DIR: outDir },
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) throw new Error(`${script} exited ${r.status}\n${r.stderr}`);
};

/** The first path at which two answers differ, for the report. */
const firstDiff = (want, got) => {
  if (typeof want !== 'object' || want === null || typeof got !== 'object' || got === null) return 'not both objects';
  for (const k of Object.keys(want)) {
    if (!(k in got)) return `missing ${k}`;
    if (want[k] !== got[k]) return `differs ${k}`;
  }
  for (const k of Object.keys(got)) if (!(k in want)) return `extra ${k}`;
  return 'key order only';
};

let bad = 0;
let files = 0;
for (let i = start; i < start + seeds; i++) {
  const seed = createHash('sha256').update('diff-seed:' + i).digest('hex');
  const dir = join(work, String(i));
  const seedDir = join(dir, 'seed');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, 'seed.json'), JSON.stringify({ schema: 'agent-fun/instance-seed/v1', seed }));
  run(drawTs, seedDir, join(dir, 'gen'));
  run(mainTs, join(dir, 'gen', 'input'), join(dir, 'out'));

  const expected = JSON.parse(readFileSync(join(dir, 'gen', 'reference', 'expected.json'), 'utf8'));
  const wantText = JSON.stringify(expected.cases.map((c) => c.output));
  const gotText = readFileSync(join(dir, 'out', 'answers.json'), 'utf8');
  const ok = wantText === gotText;
  if (!ok) {
    bad++;
    const want = JSON.parse(wantText);
    const got = JSON.parse(gotText);
    const where = want.map((w, c) => `${expected.cases[c].id}: ${firstDiff(w, got[c])}`).join('; ');
    console.log(`seed ${i} ${seed.slice(0, 12)} MISMATCH (${where})`);
  } else {
    files += expected.cases.reduce((n, c) => n + Object.keys(c.output).length, 0);
    console.log(`seed ${i} ${seed.slice(0, 12)} ok (${wantText.length} bytes)`);
  }
}
if (keep) console.log('kept', work);
else rmSync(work, { recursive: true, force: true });
console.log(bad ? `FAIL: ${bad} of ${seeds} seeds differ` : `PASS: ${seeds} seeds, ${files} output files, all byte-identical`);
process.exit(bad ? 1 : 0);
