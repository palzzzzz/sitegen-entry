// Build-level fuzz: real cached cases (test/.cache/*/*/input/cases.json) mutated at random (templates dropped, template
// and source text edited, front-matter lines cut or duplicated, files dropped or duplicated, CRLF, odd characters),
// built by this tree and by another tree (the previous commit): the two output trees must be identical, key for key.
//   node test/fuzz-build.mjs <old tree root> [mutants=60] [seed=1]
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const oldB = (await import(pathToFileURL(resolve(process.argv[2], 'vendor/makefun-site/index.js')).href)).build;
const newB = (await import(pathToFileURL(resolve(here, '../vendor/makefun-site/index.js')).href)).build;
const count = Number(process.argv[3] ?? 60);
let seed = Number(process.argv[4] ?? 1) * 2654435761 >>> 0;
const rnd = (n) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), (seed >>> 8) % n);
const pick = (a) => a[rnd(a.length)];
const cache = join(here, '.cache');
const cases = [];
for (const dg of readdirSync(cache)) for (const sd of readdirSync(join(cache, dg))) {
  if (sd.includes('.tmp')) continue;
  for (const c of JSON.parse(readFileSync(join(cache, dg, sd, 'input', 'cases.json'), 'utf8'))) cases.push(c.input);
  if (cases.length >= 12) break;
}
if (cases.length === 0) throw new Error('no cached cases: run test/diff.mjs first');
const CH = (...c) => String.fromCharCode(...c);
const ODD = ['*', '`', '[', ']', '(', ')', CH(92), CH(92, 42), '&', '<', '"', "'", '#', '- ', '1. ', '> ', '```', '---', CH(13, 10), CH(13), CH(233), CH(769), CH(0xd83d, 0xde00), '{{ page.title }}', '{% include "x" %}', '{% for x in tags %}', '{% endfor %}'];
const mutate = (input) => {
  const x = structuredClone(input);
  for (let k = 1 + rnd(4); k--; ) {
    const r = rnd(9);
    const f = x.files[rnd(x.files.length)];
    if (r === 0) { const n = pick(Object.keys(x.templates)); delete x.templates[n]; }
    else if (r === 1) { const n = pick(Object.keys(x.templates)); const t = x.templates[n]; const i = rnd(t.length); x.templates[n] = t.slice(0, i) + pick(ODD) + t.slice(i); }
    else if (r <= 4) { const i = rnd(f.content.length + 1); f.content = f.content.slice(0, i) + pick(ODD) + f.content.slice(i); }
    else if (r === 5) { const ls = f.content.split('\n'); ls.splice(1 + rnd(4), rnd(2)); f.content = ls.join('\n'); }
    else if (r === 6) { const ls = f.content.split('\n'); const i = 1 + rnd(3); ls.splice(i, 0, ls[i] ?? 'x: y'); f.content = ls.join('\n'); }
    else if (r === 7) x.files.splice(rnd(x.files.length), 1);
    else x.files.push({ path: pick(['posts/dup.md', 'docs/a/x.md', 'tags/z.md', 'page/q.md', 'static/s.txt', f.path]), content: f.content });
  }
  return x;
};
let bad = 0;
for (let k = 0; k < count; k++) {
  const input = k < cases.length ? cases[k] : mutate(pick(cases));
  const a = oldB(structuredClone(input));
  const b = newB(structuredClone(input));
  const ka = Object.keys(a), kb = Object.keys(b);
  const same = ka.length === kb.length && ka.every((p) => Object.hasOwn(b, p) && a[p] === b[p]);
  if (!same && bad++ < 3) console.log('DIFF mutant', k, ka.length, kb.length, ka.find((p) => a[p] !== b[p]));
}
console.log(bad ? `FAIL: ${bad} of ${count} differ` : `PASS: ${count} builds (${Math.min(count, cases.length)} unmutated cases + mutants), identical`);
process.exit(bad ? 1 : 0);
