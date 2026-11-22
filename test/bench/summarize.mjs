// Heat arithmetic: per entry, each timed run net of the median of the null control's runs (0 when under it), then the
// trimmed mean (the 2 fastest and 2 slowest dropped, rounded half to even). Round 0 (warm-up) is ignored.
//   node summarize.mjs timings.csv
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const by = {};
for (const [r, e, us] of rows) if (Number(r) > 0) (by[e] ??= []).push(Number(us));
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const even = (x) => { const f = Math.floor(x), d = x - f; return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 ? f + 1 : f; };
const nullMed = med(by.null);
console.log(`null control median ${nullMed} us over ${by.null.length} runs`);
for (const [e, v] of Object.entries(by)) {
  if (e === 'null') continue;
  const net = v.map((x) => Math.max(0, x - nullMed)).sort((a, b) => a - b);
  const kept = net.slice(2, -2);
  const tm = even(kept.reduce((a, b) => a + b, 0) / kept.length);
  console.log(`${e.padEnd(10)} trimmed-mean ${tm} us (net runs: ${net.join(' ')})`);
}
