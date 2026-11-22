// Unit fuzz: inline() of this tree against another tree's (the previous commit), on random strings built from the
// characters that matter (emphasis, links, code spans, escapes, non-BMP, whitespace), and the empty string.
//   node test/fuzz-inline.mjs <old tree root> [count]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const old = await import(pathToFileURL(resolve(process.argv[2], 'vendor/makefun-site/lib/markdown.js')).href);
const cur = await import(new URL('../vendor/makefun-site/lib/markdown.js', import.meta.url).href);
const count = Number(process.argv[3] ?? 300000);
const env = { link: (t) => (t.startsWith('x') ? t + '&"' : '/p/' + t + "'") };
const atoms = ["*","**","`","``","\\","\\*","\\[","\\]","\\`","\\\\","\\a","[","]","(",")","[a](b)","[a](b c)","[](x)","[x](x)","](","&","<",">","\"","'"," ","\t","\n","a","b","Z","_","#","+","-",".","!","é","́","😀","\ud83d","\ude00"," ","0"];
let seed = 12345;
const rnd = (n) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), seed % n);
let bad = 0;
const test = (s) => {
  let a, b;
  try { a = old.inline(s, env); } catch (e) { a = 'THROW ' + e.message; }
  try { b = cur.inline(s, env); } catch (e) { b = 'THROW ' + e.message; }
  if (a !== b) { if (bad++ < 5) console.log('DIFF', JSON.stringify(s), '\n  old', JSON.stringify(a), '\n  new', JSON.stringify(b)); }
};
test('');
for (const a of atoms) { test(a); for (const b of atoms) test(a + b); }
for (let k = 0; k < count; k++) {
  let s = '';
  for (let L = rnd(14); L--; ) s += atoms[rnd(atoms.length)];
  test(s);
}
console.log(bad ? `FAIL: ${bad} differ` : `PASS: ${count} random + ${atoms.length ** 2 + atoms.length + 1} exhaustive pairs, identical`);
process.exit(bad ? 1 : 0);
