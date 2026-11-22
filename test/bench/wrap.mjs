// Child of wall.mjs: imports an entry's main.ts and reports the wall time of the import (the whole program) and the
// process's CPU time (user+system, all threads) before and after it, as one JSON line.
import { pathToFileURL } from 'node:url';
const c0 = process.cpuUsage();
const t0 = process.hrtime.bigint();
await import(pathToFileURL(process.argv[2]).href);
const t1 = process.hrtime.bigint();
const c1 = process.cpuUsage(c0);
console.log(JSON.stringify({ wall: Number(t1 - t0) / 1000, cpu: c1.user + c1.system }));
