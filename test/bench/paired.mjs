// Paired comparison of two entries from a cpu.ps1 CSV: per round, b - a (both net of nothing: the difference cancels the
// control). node paired.mjs timings.csv a b
import { readFileSync } from 'node:fs';
const [csv, A, B] = process.argv.slice(2);
const r = {};
for (const l of readFileSync(csv, 'utf8').trim().split('\n').slice(1)) { const [k, e, u] = l.split(','); if (+k > 0) (r[k] ??= {})[e] = +u; }
const d = Object.values(r).map((x) => x[B] - x[A]);
const n = d.length, m = d.reduce((a, b) => a + b, 0) / n;
const se = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) / Math.sqrt(n);
const mean = (e) => Object.values(r).reduce((a, x) => a + x[e], 0) / n;
console.log(`paired ${B} - ${A}: mean ${m.toFixed(0)} us (${((100 * m) / mean(A)).toFixed(1)}%)  se ${se.toFixed(0)}  t ${(m / se).toFixed(2)}  ${B} faster in ${d.filter((x) => x < 0).length}/${n} rounds`);
