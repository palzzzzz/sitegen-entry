// Equivalence fuzz for lib/frontmatter.js: parseFrontMatter on random sources must give exactly the same result as the
// previous tree's (errors included, with their line numbers).
// usage: node test/fuzz-frontmatter.mjs <old tree root> [count]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const rel = 'vendor/makefun-site/lib/frontmatter.js';
const old = await import(pathToFileURL(resolve(process.argv[2], rel)).href);
const cur = await import(pathToFileURL(resolve(rel)).href);
const count = Number(process.argv[3] ?? 200000);
let seed = 12345;
const rnd = (n) => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0), (seed >>> 8) % n);
const pick = (a) => a[rnd(a.length)];
const LINES = [
  'title: Hello', 'title: "Quoted"', 'title: "bad', 'title: "a\\"b"', 'title: "a\\n"', 'title:', 'title: ', 'title:  x  ', 'date: 2024-02-29', 'date: 2023-02-29',
  'date: 1969-01-01', 'date: 2024-13-01', 'tags: [a, b]', 'tags: []', 'tags: [ ]', 'tags: [a,,b]', 'tags: [a"b]', 'tags: a', 'draft: true', 'draft: false',
  'draft: yes', 'layout: post', 'layout: Bad', 'slug: my-slug', 'slug: bad_slug', 'summary: s', 'summary: [x', 'other: 1', 'Title: x', '# comment', '',
  '   ', '\t', '---', '--- ', ' ---', '----', 'title: a\r', 'tags: [a]\t', 'key', ':', 'title: é', '---x', 'draft: true ', 'a b: c',
];
const BODY = ['', 'text', '# H\n\ntext', '---', '\n---\n', 'a\n---\nb', '\n\n', 'x\r\ny'];
let bad = 0;
let ok = 0;
for (let k = 0; k < count; k++) {
  const lines = [];
  const n = rnd(9);
  const head = rnd(12) === 0 ? pick(['', 'x', '--', '---x', ' ---', '----']) : '---';
  lines.push(head);
  for (let i = 0; i < n; i++) lines.push(rnd(5) === 0 ? pick(LINES) : pick(LINES.slice(0, 29)));
  const closing = rnd(10) === 0 ? null : pick(['---', '---', '---', '--- ', '---\r']);
  if (closing !== null) lines.push(closing);
  let text = lines.join('\n');
  if (rnd(3) > 0) text += (rnd(2) ? '\n' : '') + pick(BODY);
  if (rnd(6) === 0) text += pick(['\n---', '\n---\n', '\n---\n---']);
  const a = JSON.stringify(old.parseFrontMatter(text));
  const b = JSON.stringify(cur.parseFrontMatter(text));
  if (!a.includes('error')) ok++;
  if (a !== b && bad++ < 3) console.log('DIFF', JSON.stringify(text), '\n old', a, '\n new', b);
}
console.log(bad ? `FAIL: ${bad} differ` : `PASS: ${count} random sources (${ok} parse), identical`);
process.exit(bad ? 1 : 0);
