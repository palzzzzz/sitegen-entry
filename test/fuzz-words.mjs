// wordsOf equivalence: every UTF-16 code unit against /\s/, then random strings against the regex count.
//   node test/fuzz-words.mjs
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../vendor/makefun-site/index.js', import.meta.url), 'utf8');
const body = /function wordsOf\(text\) \{[\s\S]*?\n\}\n/.exec(src)[0];
const wordsOf = new Function(body + '; return wordsOf;')();
const ref = (t) => { const m = t.match(/\S+/g); return m === null ? 0 : m.length; };
let bad = 0;
for (let c = 0; c < 65536; c++) { const ch = String.fromCharCode(c); for (const t of [ch, 'a' + ch + 'b', ch + ch, ch + 'x']) if (wordsOf(t) !== ref(t)) { bad++; console.log('code unit', c.toString(16)); } }
let seed = 7; const rnd = (n) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), (seed >>> 8) % n);
const A = [' ', '\t', '\n', 'a', 'bb', 'word', String.fromCharCode(0xa0), String.fromCharCode(0x2003), String.fromCharCode(0xfeff), String.fromCharCode(0xd83d, 0xde00), '*', ''];
for (let k = 0; k < 200000; k++) { let t = ''; for (let L = rnd(12); L--; ) t += A[rnd(A.length)]; if (wordsOf(t) !== ref(t)) bad++; }
if (wordsOf('') !== 0) bad++;
console.log(bad ? `FAIL ${bad}` : 'PASS: all 65536 code units and 200000 random strings agree');
process.exit(bad ? 1 : 0);
