// Top functions by self time from a .cpuprofile (node --cpu-prof): node test/bench/hotspots.mjs <file> [n]
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const top = Number(process.argv[3] ?? 10);
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
p.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const agg = new Map();
let total = 0;
for (const [id, us] of self) {
  const f = byId.get(id).callFrame;
  const key = `${f.functionName || '(anonymous)'} ${f.url.replace(/^.*[\/]vendor[\/]/, 'vendor/').replace(/^file:\/\/\//, '')}:${f.lineNumber + 1}`;
  agg.set(key, (agg.get(key) ?? 0) + us);
  total += us;
}
console.log(`total sampled ${(total / 1000).toFixed(0)} ms`);
[...agg].sort((a, b) => b[1] - a[1]).slice(0, top).forEach(([k, us], i) => console.log(`${String(i + 1).padStart(2)}. ${(us / 1000).toFixed(0).padStart(6)} ms ${((100 * us) / total).toFixed(1).padStart(5)}%  ${k}`));
