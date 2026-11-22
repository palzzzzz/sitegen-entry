// Differential tester: for many seeds, takes a case set drawn by the kit's own generator (program/generator/draw.ts),
// runs this repo's main.ts on it and compares its answers.json with the reference's (the generator's expected.json,
// the oracle's answers) byte for byte.
//
//   node test/diff.mjs --kit <kit dir> [--seeds 50] [--start 0] [--fresh] [--keep] [--jobs N]
//
// Cached mode (default): seed i's drawn set is kept in test/.cache/<seed>/ (gitignored) and reused by every later run,
// so only the first run of a seed pays for the generator and its oracle. A cached set is keyed by the seed and by a
// digest of the generator directory, so a different kit never reuses it. Misses are drawn --jobs at a time.
// --fresh: draw every seed again in a temp directory, as the generator does it now (for final checks); nothing cached
// is read or written.
//
// Seed i is sha256("diff-seed:" + i) in hex. Exits 1 if any seed differs (after reporting every seed).

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? dflt : args[i + 1];
};
const kit = opt('kit', process.env.MAKEFUN_KIT);
if (!kit) {
  console.error('usage: node test/diff.mjs --kit <kit dir> [--seeds N] [--start K] [--fresh] [--keep] [--jobs N]');
  process.exit(2);
}
const seeds = Number(opt('seeds', '50'));
const start = Number(opt('start', '0'));
const jobs = Number(opt('jobs', Math.max(1, cpus().length - 1)));
const fresh = args.includes('--fresh');
const keep = args.includes('--keep');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const genDir = join(resolve(kit), 'program', 'generator');
const drawTs = join(genDir, 'draw.ts');
const mainTs = join(root, 'main.ts');

/** sha256 over every file of the generator directory (path and bytes, in path order). */
const genDigest = () => {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(p.slice(genDir.length) + '\0').update(readFileSync(p));
    }
  };
  walk(genDir);
  return h.digest('hex').slice(0, 16);
};
const digest = genDigest();
const cacheRoot = join(root, 'test', '.cache', digest);
const work = mkdtempSync(join(tmpdir(), 'makefun-diff-'));

const seedOf = (i) => createHash('sha256').update('diff-seed:' + i).digest('hex');

/** Draws seed's set into outDir (outDir/input/cases.json, outDir/reference/expected.json); async so misses overlap. */
const draw = (seed, outDir) =>
  new Promise((ok, fail) => {
    const seedDir = outDir + '.seed';
    mkdirSync(seedDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(seedDir, 'seed.json'), JSON.stringify({ schema: 'agent-fun/instance-seed/v1', seed }));
    const p = spawn(process.execPath, [drawTs], {
      env: { ...process.env, MAKEFUN_INPUT_DIR: seedDir, MAKEFUN_OUTPUT_DIR: outDir },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      rmSync(seedDir, { recursive: true, force: true });
      code === 0 ? ok() : fail(new Error(`draw.ts exited ${code}\n${err}`));
    });
  });

/** Where seed i's drawn set lives: the cache (drawn there on a miss, atomically) or a fresh temp directory. */
const setFor = async (i) => {
  const seed = seedOf(i);
  if (fresh) {
    const d = join(work, 'draw-' + i);
    await draw(seed, d);
    return { dir: d, cached: false };
  }
  const d = join(cacheRoot, seed);
  if (existsSync(join(d, 'reference', 'expected.json'))) return { dir: d, cached: true };
  const tmp = d + '.tmp-' + process.pid;
  rmSync(tmp, { recursive: true, force: true });
  await draw(seed, tmp);
  mkdirSync(cacheRoot, { recursive: true });
  renameSync(tmp, d);
  return { dir: d, cached: false };
};

/** Runs main.ts on a set's cases (async, so seeds overlap) and returns the answers.json text. */
const runMain = (i, dir) =>
  new Promise((ok, fail) => {
    const outDir = join(work, 'out-' + i);
    mkdirSync(outDir, { recursive: true });
    const p = spawn(process.execPath, [mainTs], {
      env: { ...process.env, MAKEFUN_INPUT_DIR: join(dir, 'input'), MAKEFUN_OUTPUT_DIR: outDir },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      if (code !== 0) return fail(new Error(`main.ts exited ${code} on seed ${i}
${err}`));
      const text = readFileSync(join(outDir, 'answers.json'), 'utf8');
      rmSync(outDir, { recursive: true, force: true });
      ok(text);
    });
  });

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

/** One seed end to end: its set, our answers, the comparison. Returns the report line and its counts. */
const check = async (i) => {
  const seed = seedOf(i);
  const { dir, cached } = await setFor(i);
  const gotText = await runMain(i, dir);
  const expected = JSON.parse(readFileSync(join(dir, 'reference', 'expected.json'), 'utf8'));
  const wantText = JSON.stringify(expected.cases.map((c) => c.output));
  const tag = cached ? 'cached' : 'drawn';
  if (wantText === gotText) {
    const n = expected.cases.reduce((m, c) => m + Object.keys(c.output).length, 0);
    return { ok: true, cached, files: n, line: `seed ${i} ${seed.slice(0, 12)} ok (${wantText.length} bytes, ${tag})` };
  }
  const want = JSON.parse(wantText);
  const got = JSON.parse(gotText);
  const where = want.map((w, c) => `${expected.cases[c].id}: ${firstDiff(w, got[c])}`).join('; ');
  return { ok: false, cached, files: 0, line: `seed ${i} ${seed.slice(0, 12)} MISMATCH (${where})` };
};

// Seeds run `jobs` at a time (draw, solve, compare each); reports print in seed order.
const ids = Array.from({ length: seeds }, (_, k) => start + k);
const results = new Map();
let next = 0;
let printed = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, ids.length) }, async () => {
    while (next < ids.length) {
      const i = ids[next++];
      results.set(i, await check(i));
      while (printed < ids.length && results.has(ids[printed])) console.log(results.get(ids[printed++]).line);
    }
  }),
);

const all = [...results.values()];
const bad = all.filter((r) => !r.ok).length;
const files = all.reduce((n, r) => n + r.files, 0);
const drawn = all.filter((r) => !r.cached).length;
if (keep) console.log('kept', work);
else rmSync(work, { recursive: true, force: true });
console.log(
  `${bad ? 'FAIL' : 'PASS'}: ${seeds} seeds (${fresh ? 'fresh draw' : `${drawn} drawn, ${seeds - drawn} from cache`}), ` +
    (bad ? `${bad} differ` : `${files} output files, all byte-identical`),
);
process.exit(bad ? 1 : 0);
