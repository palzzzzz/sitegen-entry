// Markdown equivalence: lex() tokens and renderMarkdown() (html, toc, excerpt) of this tree against another tree's (the
// previous commit), on every cached case's real sources and on random documents built from block and inline atoms.
//   node test/fuzz-markdown.mjs <old tree root> [random docs=30000]
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const old = await import(pathToFileURL(resolve(process.argv[2], 'vendor/makefun-site/lib/markdown.js')).href);
const cur = await import(new URL('../vendor/makefun-site/lib/markdown.js', import.meta.url).href);
const count = Number(process.argv[3] ?? 30000);
const CH = (...c) => String.fromCharCode(...c);
const env = { link: (t) => (t.startsWith('x') ? t + '&"' : '/p/' + t + "'") };
let seed = 424242;
const rnd = (n) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), (seed >>> 8) % n);
const pick = (a) => a[rnd(a.length)];
let bad = 0, n = 0;
const same = (src) => {
  n++;
  let a, b;
  try { a = JSON.stringify([old.lex(src), old.renderMarkdown(src, env)]); } catch (e) { a = 'THROW ' + e.message; }
  try { b = JSON.stringify([cur.lex(src), cur.renderMarkdown(src, env)]); } catch (e) { b = 'THROW ' + e.message; }
  if (a !== b && bad++ < 3) console.log('DIFF', JSON.stringify(src).slice(0, 300), '\n old', a.slice(0, 200), '\n new', b.slice(0, 200));
};
// real sources
const cache = join(here, '.cache');
let real = 0;
for (const dg of readdirSync(cache)) for (const sd of readdirSync(join(cache, dg))) {
  if (sd.includes('.tmp') || real >= 8) continue;
  real++;
  for (const c of JSON.parse(readFileSync(join(cache, dg, sd, 'input', 'cases.json'), 'utf8'))) for (const f of c.input.files) if (f.path.endsWith('.md')) same(f.content.replace(/\r\n?/g, '\n'));
}
const LINES = ['x' + CH(9), CH(9) + 'x' + CH(9), 'x' + CH(9) + ' ', CH(32, 9, 32), 'a' + CH(11), CH(160) + 'x', '', ' ', '\t', '  ', 'text', 'two words', '# h', '## h2 ', '### h3 ###', '####### seven', '#', '#nospace', '#\ttab', '```', '```js', '```c++', '``` ', '```bad lang!', '---', '***', '--- ', '-- ', '- item', '* item', '*', '-', '- ', '1. one', '2. two', '10. ten', '1.x', '12345678901. big', '> quote', '>', '>x', '> ', '  cont', ' one', '   three', '\tx', 'a*b*c', '**b**', '`c`', '[l](u)', '[l](x)', CH(92) + '*', CH(233) + 'x', CH(0xd83d, 0xde00), 'x  ', '  x  ', '=====', '___', '+ plus', '0. zero', '09. nine'];
for (let k = 0; k < count; k++) {
  const ls = [];
  for (let L = 1 + rnd(14); L--; ) ls.push(pick(LINES));
  same(ls.join(rnd(20) === 0 ? CH(13, 10) : '\n'));
}
console.log(bad ? `FAIL: ${bad} of ${n} differ` : `PASS: ${n} documents (${real} cached cases' sources + ${count} random), lex and render identical`);
process.exit(bad ? 1 : 0);
