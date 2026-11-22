// Sharper A/B than cpu.ps1: each round runs every entry once in a random order as a fresh `node wrap.mjs <main.ts>`,
// which reports the import's wall time (hrtime, microsecond resolution) and the CPU time of the process. Reports
// medians and the paired differences of each entry against the first (the reference): median, trimmed mean, sign count.
//   node wall.mjs <input dir> <rounds> name=path/main.ts name2=path2/main.ts ...
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const [inputDir, roundsArg, ...entries] = process.argv.slice(2);
const rounds = Number(roundsArg);
const E = entries.map((e) => { const i = e.indexOf('='); return { name: e.slice(0, i), file: e.slice(i + 1) }; });
const wrap = join(dirname(fileURLToPath(import.meta.url)), 'wrap.mjs');
const out = mkdtempSync(join(tmpdir(), 'wall-'));
let seed = 12345; const rnd = (n) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), (seed >>> 8) % n);
const R = { wall: {}, cpu: {} };
for (let r = 0; r <= rounds; r++) {
  const order = E.map((e) => [rnd(1e6), e]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const e of order) {
    const p = spawnSync(process.execPath, [wrap, e.file], { env: { ...process.env, MAKEFUN_INPUT_DIR: inputDir, MAKEFUN_OUTPUT_DIR: out }, encoding: 'utf8' });
    if (p.status !== 0) throw new Error(e.name + ': ' + p.stderr);
    if (r === 0) continue; // warm-up round
    const j = JSON.parse(p.stdout.trim().split('\n').pop());
    for (const m of ['wall', 'cpu']) (R[m][e.name] ??= []).push(j[m]);
  }
}
rmSync(out, { recursive: true, force: true });
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const tmean = (a) => { const s = [...a].sort((x, y) => x - y); const k = Math.floor(s.length / 5); const m = s.slice(k, s.length - k); return m.reduce((x, y) => x + y, 0) / m.length; };
for (const m of ['wall', 'cpu']) {
  console.log(`-- ${m} (us): median / trimmed mean`);
  const ref = R[m][E[0].name];
  for (const e of E) {
    const v = R[m][e.name];
    let line = `${e.name.padEnd(8)} ${med(v).toFixed(0).padStart(9)} / ${tmean(v).toFixed(0).padStart(9)}`;
    if (e !== E[0]) {
      const d = v.map((x, i) => x - ref[i]);
      const ds = [...d].sort((a, b) => a - b);
      line += `   paired vs ${E[0].name}: median ${med(d).toFixed(0)} (${((100 * med(d)) / med(ref)).toFixed(1)}%), trimmed ${tmean(d).toFixed(0)}, faster in ${d.filter((x) => x < 0).length}/${d.length}, IQR ${ds[Math.floor(d.length / 4)].toFixed(0)}..${ds[Math.floor((3 * d.length) / 4)].toFixed(0)}`;
    }
    console.log(line);
  }
}
