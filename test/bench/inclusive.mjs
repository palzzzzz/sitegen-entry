// Inclusive time per function from a .cpuprofile (a function's own samples plus its callees', recursion counted once).
//   node test/bench/inclusive.mjs <file> [n]
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
p.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*[\/]vendor[\/]/, 'vendor/').replace(/^file:\/\/\//, '')}:${n.callFrame.lineNumber + 1}`;
const incl = new Map();
const walk = (n, onStack) => {
  const k = key(n);
  let t = self.get(n.id) ?? 0;
  const fresh = !onStack.has(k);
  if (fresh) onStack.add(k);
  for (const c of n.children ?? []) t += walk(byId.get(c), onStack);
  if (fresh) { onStack.delete(k); incl.set(k, (incl.get(k) ?? 0) + t); }
  return t;
};
const total = walk(p.nodes[0], new Set());
console.log(`total ${(total / 1000).toFixed(0)} ms`);
[...incl].sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[3] ?? 25)).forEach(([k, us]) => console.log(`${(us / 1000).toFixed(0).padStart(6)} ms ${((100 * us) / total).toFixed(1).padStart(5)}%  ${k}`));
