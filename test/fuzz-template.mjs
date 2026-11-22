// Unit fuzz: parse + render of random templates against random data, this tree's lib/template.js against another
// tree's (the previous commit): loops (nested, named like data keys, named loop), if/else/not, includes (missing,
// self-recursive, deeper than 8), escaping, standalone tags, unparsable templates (same error text), odd keys
// (toString, __proto__, constructor), strings with & < > " '.
//   node test/fuzz-template.mjs <old tree root> [count]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const old = await import(pathToFileURL(resolve(process.argv[2], 'vendor/makefun-site/lib/template.js')).href);
const cur = await import(new URL('../vendor/makefun-site/lib/template.js', import.meta.url).href);
const count = Number(process.argv[3] ?? 100000);
let seed = 987654321;
const rnd = (n) => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0), (seed >>> 8) % n);
const pick = (a) => a[rnd(a.length)];
const KEYS = ['a', 'b', 'x', 'y', 'loop', 'items', 'name', 'index', 'first', 'last', 'length', 'toString', 'constructor', '__proto__', 'site', 'n'];
const STR = ['', 'plain', 'a & b', '<b>"q"</b>', "it's", '0', 'é😀', ' '];
const value = (d) => {
  const r = rnd(d > 2 ? 6 : 10);
  if (r === 0) return pick(STR);
  if (r === 1) return rnd(5) - 1;
  if (r === 2) return rnd(2) === 0;
  if (r === 3) return null;
  if (r === 4) return pick([0, 1.5, -0, 1e21]);
  if (r === 5) return pick(STR);
  if (r <= 7) return Array.from({ length: rnd(5) }, () => value(d + 1));
  const o = {};
  for (let k = rnd(5); k--; ) Object.defineProperty(o, pick(KEYS), { value: value(d + 1), enumerable: true, writable: true, configurable: true });
  return o;
};
const path = () => Array.from({ length: 1 + rnd(3) }, () => pick(KEYS)).join('.');
const NAMES = ['x', 'y', 'loop', 'a', 'item', 'toString', '__proto__', 'n'];
const tpl = (d) => {
  let s = '';
  for (let k = rnd(7); k--; ) {
    const r = rnd(d > 3 ? 6 : 12);
    if (r === 0) s += pick(STR);
    else if (r === 1) s += `{{ ${path()} }}`;
    else if (r === 2) s += `{{{ ${path()} }}}`;
    else if (r === 3) s += pick(['\n', ' ', '  \t', '{', '}', '{ ', '% ']);
    else if (r === 4) s += `{% include "${pick(['t1', 't2', 't3', 'gone', 'self'])}" %}`;
    else if (r === 5) s += `{{${pick(['', '{'])}${path()}${pick(['}}', '}}}'])}`;
    else if (r <= 8) s += `${pick(['', '  ', '\n', ' x '])}{% for ${pick(NAMES)} in ${path()} %}${pick(['', '\n'])}${tpl(d + 1)}{% endfor %}${pick(['', '\n', ' '])}`;
    else s += `${pick(['', '  ', '\n'])}{% if ${pick(['', 'not '])}${path()} %}${tpl(d + 1)}${rnd(2) ? `{% else %}${tpl(d + 1)}` : ''}{% endif %}${pick(['', '\n'])}`;
  }
  if (rnd(60) === 0) s += pick(['{% endfor %}', '{% if a %}', '{% else %}', '{{ a', '{% bogus %}', '{{ 1a }}']);
  return s;
};
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const attempt = (lib, srcs, vars) => {
  const templates = new Map();
  const errs = [];
  for (const [name, src] of Object.entries(srcs)) {
    try { templates.set(name, lib.parseTemplate(name, src)); } catch (e) { errs.push(e.message); }
  }
  const ctx = { templates, escape };
  const outs = [];
  for (const name of templates.keys()) {
    try { outs.push(lib.renderNodes(templates.get(name), { vars, parent: null }, ctx, 0)); } catch (e) { outs.push('THROW ' + e.message); }
  }
  return JSON.stringify([errs, outs]);
};
let bad = 0;
let nonTrivial = 0;
for (let k = 0; k < count; k++) {
  const srcs = { t1: tpl(0), t2: tpl(0), t3: tpl(0), self: tpl(0) + '{% include "self" %}' };
  const vars = {};
  for (let j = rnd(8); j--; ) Object.defineProperty(vars, pick(KEYS), { value: value(0), enumerable: true, writable: true, configurable: true });
  const a = attempt(old, srcs, vars);
  const b = attempt(cur, srcs, vars);
  if (a.length > 40) nonTrivial++;
  if (a !== b && bad++ < 3) console.log('DIFF', JSON.stringify(srcs), '\n vars', JSON.stringify(vars), '\n old', a.slice(0, 300), '\n new', b.slice(0, 300));
}
console.log(bad ? `FAIL: ${bad} differ` : `PASS: ${count} random template sets (${nonTrivial} with output), identical`);
process.exit(bad ? 1 : 0);
