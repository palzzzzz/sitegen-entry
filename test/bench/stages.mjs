// Inclusive time per build stage on the practice (or any) input: copies HEAD to a scratch directory, wraps each plugin of the
// pipeline and the template renders in timers, runs main.ts there and prints the split (3 cases, one process, as graded).
//   node test/bench/stages.mjs <input dir> [scratch dir]
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const input = resolve(process.argv[2]);
const dir = process.argv[3] ? resolve(process.argv[3]) : mkdtempSync(join(tmpdir(), 'stages-'));
mkdirSync(dir, { recursive: true });
for (const f of ['main.ts', 'solve.js', 'package.json']) cpSync(join(root, f), join(dir, f));
cpSync(join(root, 'vendor'), join(dir, 'vendor'), { recursive: true });

const idx = join(dir, 'vendor/makefun-site/index.js');
let s = readFileSync(idx, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 60));
  s = s.replace(a, b);
};
rep('export const REPORT_FILE', "export const T = {};\nconst tm = (k, fn) => { const t = performance.now(); const r = fn(); T[k] = (T[k] ?? 0) + performance.now() - t; return r; };\nexport const REPORT_FILE");
rep('for (const plugin of PIPELINE) plugin(b);', 'for (const plugin of PIPELINE) tm(plugin.name, () => plugin(b));');
rep('  const templates = new Map();\n  const report = [];\n  for (const name of', '  const templates = new Map();\n  const report = [];\n  const t0 = performance.now();\n  for (const name of');
rep('  const b = {\n    input,', "  T.parseTemplates = (T.parseTemplates ?? 0) + performance.now() - t0;\n  const b = {\n    input,");
rep("return nodes === undefined ? null : renderNodes(", "return nodes === undefined ? null : tm('render:' + (name === 'index' || name === 'tag' || name === 'tags' ? name : 'pages'), () => renderNodes(");
rep('ctx, 0);\n  };', 'ctx, 0));\n  };');
rep('render(s.layout, { page: pageOf(s) })', "render(s.layout, tm('pageOf', () => pageOf(s)))");
writeFileSync(idx, s);

const m = join(dir, 'main.ts');
let t = readFileSync(m, 'utf8');
if (!t.includes('const fd =')) throw new Error('main.ts shape changed');
t = t.replace('const fd =', 'const W0 = performance.now();\nconst fd =').replace(
  'closeSync(fd);',
  `closeSync(fd);
const lib = await import('./vendor/makefun-site/index.js');
const tot = performance.now() - W0;
const T = lib.T;
console.error('stage totals over all cases (build + answer serialization = ' + tot.toFixed(0) + ' ms)');
for (const k of ['parseTemplates', 'readSources', 'frontMatter', 'permalinks', 'markdown', 'collections', 'tags', 'layouts', 'report', '  pageOf (in layouts)', '  render:pages (in layouts)', '  render:index (in layouts)', '  render:tag (in layouts)', '  render:tags (in layouts)']) {
  const key = k.trim().split(' ')[0];
  console.error(k.padEnd(30), (T[key] ?? 0).toFixed(1).padStart(8), 'ms');
}`,
);
writeFileSync(m, t);
const out = mkdtempSync(join(tmpdir(), 'stages-out-'));
for (let i = 0; i < 3; i++) {
  console.log(`-- run ${i + 1}`);
  const r = spawnSync(process.execPath, [m], { env: { ...process.env, MAKEFUN_INPUT_DIR: input, MAKEFUN_OUTPUT_DIR: out }, encoding: 'utf8' });
  console.log(r.stderr.trim());
}
