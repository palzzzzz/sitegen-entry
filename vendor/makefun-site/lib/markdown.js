// makefun-site's Markdown (README.md, "Markdown"): its own subset, lexed into block tokens and then rendered, in the
// shape of marked's lexer and parser. Blocks: ATX headings (each with an id), fenced code, thematic breaks,
// blockquotes, flat lists and paragraphs. Inline: code spans, strong, emphasis, links and backslash escapes. No raw
// HTML (every < is escaped), no setext headings, no indented code, no tables, no reference links, no underscore
// emphasis.

import { escapeHtml, slugify, uniqueSlug } from './text.js';

const BLANK = /^[ \t]*$/;
const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const QUOTE = /^>/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;

/** A heading line's level and text, or null (a heading's text is never empty). */
function headingOf(line) {
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : { depth: m[1].length, text: m[2] };
}

/** Whether `line` ends a paragraph: a blank line, a fence, a heading or a thematic break. */
function endsParagraph(line) {
  return BLANK.test(line) || FENCE_OPEN.test(line) || headingOf(line) !== null || HR.test(line);
}

/** A paragraph line as it is rendered: spaces and tabs at either end dropped. */
const trimLine = (line) => line.replace(/^[ \t]+|[ \t]+$/g, '');

/** `src`'s block tokens, in order. */
export function lex(src) {
  const lines = src.split('\n');
  const tokens = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK.test(line)) {
      i++;
      continue;
    }
    const fence = FENCE_OPEN.exec(line);
    if (fence !== null) {
      const body = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) body.push(lines[i++]);
      i++;
      tokens.push({ type: 'code', lang: fence[1], lines: body });
      continue;
    }
    const heading = headingOf(line);
    if (heading !== null) {
      tokens.push({ type: 'heading', depth: heading.depth, text: heading.text });
      i++;
      continue;
    }
    if (HR.test(line)) {
      tokens.push({ type: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(/^> ?/, ''));
      tokens.push({ type: 'blockquote', lines: body.map(trimLine).filter((l) => l !== '') });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet === null ? ORDERED.exec(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < lines.length) {
        const m = marker.exec(lines[i]);
        if (m !== null) {
          items.push([trimLine(isOrdered ? m[2] : m[1])]);
          i++;
        } else if (CONTINUED.test(lines[i])) {
          items[items.length - 1].push(trimLine(lines[i]));
          i++;
        } else break;
      }
      tokens.push({ type: 'list', ordered: isOrdered, start: isOrdered ? Number(ordered[1]) : 1, items: items.map((parts) => parts.join('\n')) });
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < lines.length && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    tokens.push({ type: 'paragraph', text: body.join('\n') });
  }
  return tokens;
}

/** The characters a backslash escapes, by code (one byte each: all are ASCII). */
const ESCAPABLE = new Uint8Array(128);
for (const c of '\\`*_[]()#+-.!>') ESCAPABLE[c.charCodeAt(0)] = 1;

/** Whether the character at `j` of `s` is one a backslash escapes. */
function escapableAt(s, j) {
  const d = s.charCodeAt(j);
  return d < 128 && ESCAPABLE[d] === 1;
}

/** The entity of each character HTML escaping replaces, by code. */
const ENTITY = { 38: '&amp;', 60: '&lt;', 62: '&gt;', 34: '&quot;', 39: '&#39;' };

// Scanning is done by the regex engine (test with lastIndex: no match object), not by a per-character loop: a run is
// short and a loop runs in the slow tiers for most of it.
/** The next character `inline` has to act on: one HTML escapes, or a backslash, backtick, * or [. */
const SPECIAL = /[&<>"'\\`*[]/g;
const BACKSLASH_OR_BOLD = /\\|\*\*/g;
const BACKSLASH_OR_STAR = /\\|\*/g;
const BACKSLASH_OR_BRACKET = /\\|\]/g;

/** The first index from `from` where `re` (a backslash, or what is looked for) matches outside a backslash escape, or -1. */
function findUnescaped(re, s, from) {
  let i = from;
  for (;;) {
    re.lastIndex = i;
    if (!re.test(s)) return -1;
    const end = re.lastIndex;
    const p = re === BACKSLASH_OR_BOLD && s.charCodeAt(end - 1) === 42 && s.charCodeAt(end - 2) === 42 ? end - 2 : end - 1;
    if (s.charCodeAt(p) === 92) {
      i = p + 1 < s.length && escapableAt(s, p + 1) ? p + 2 : p + 1;
      continue;
    }
    return p;
  }
}

/** The first single * from `from` (one whose run is not **), outside an escape, or -1. */
function findSingleStar(s, from) {
  let i = from;
  for (;;) {
    BACKSLASH_OR_STAR.lastIndex = i;
    if (!BACKSLASH_OR_STAR.test(s)) return -1;
    const p = BACKSLASH_OR_STAR.lastIndex - 1;
    if (s.charCodeAt(p) === 92) {
      i = p + 1 < s.length && escapableAt(s, p + 1) ? p + 2 : p + 1;
      continue;
    }
    if (s.charCodeAt(p + 1) === 42) {
      i = p + 2;
      continue;
    }
    return p;
  }
}

/** `s` rendered inline; `env.link(target)` is a link's href. */
export function inline(s, env) {
  const n = s.length;
  let out = '';
  let last = 0; // the start of the plain text not yet written
  let i = 0;
  for (;;) {
    SPECIAL.lastIndex = i;
    if (!SPECIAL.test(s)) break;
    const p = SPECIAL.lastIndex - 1;
    const c = s.charCodeAt(p);
    switch (c) {
      case 38: // & < > " ': the entity
      case 60:
      case 62:
      case 34:
      case 39:
        out += (last < p ? s.slice(last, p) : '') + ENTITY[c];
        i = last = p + 1;
        break;
      case 92: // a backslash before an escapable character writes that character
        if (p + 1 < n && escapableAt(s, p + 1)) {
          out += (last < p ? s.slice(last, p) : '') + (s.charCodeAt(p + 1) === 62 ? '&gt;' : s[p + 1]);
          i = last = p + 2;
        } else i = p + 1;
        break;
      case 96: {
        const j = s.indexOf('`', p + 1);
        if (j > p + 1) {
          out += (last < p ? s.slice(last, p) : '') + '<code>' + escapeHtml(s.slice(p + 1, j)) + '</code>';
          i = last = j + 1;
        } else i = p + 1;
        break;
      }
      case 42:
        if (s.charCodeAt(p + 1) === 42) {
          const j = findUnescaped(BACKSLASH_OR_BOLD, s, p + 2);
          if (j > p + 2) {
            out += (last < p ? s.slice(last, p) : '') + '<strong>' + inline(s.slice(p + 2, j), env) + '</strong>';
            i = last = j + 2;
          } else i = p + 2;
        } else {
          const j = findSingleStar(s, p + 1);
          if (j > p + 1) {
            out += (last < p ? s.slice(last, p) : '') + '<em>' + inline(s.slice(p + 1, j), env) + '</em>';
            i = last = j + 1;
          } else i = p + 1;
        }
        break;
      default: {
        // [
        const k = findUnescaped(BACKSLASH_OR_BRACKET, s, p + 1);
        const m = k !== -1 && s.charCodeAt(k + 1) === 40 ? s.indexOf(')', k + 2) : -1;
        const target = m === -1 ? '' : s.slice(k + 2, m);
        if (target !== '' && !/\s/.test(target)) {
          out += (last < p ? s.slice(last, p) : '') + '<a href="' + escapeHtml(env.link(target)) + '">' + inline(s.slice(p + 1, k), env) + '</a>';
          i = last = m + 1;
        } else i = p + 1;
      }
    }
  }
  return last === 0 ? out + s : last < n ? out + s.slice(last) : out;
}

/**
 * `src` rendered: its HTML (each block on its own lines, a "\n" after the last), its table of contents (every level 2
 * and 3 heading: level, id and its inline HTML) and its excerpt (the first paragraph's inline HTML, or "").
 */
export function renderMarkdown(src, env) {
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  for (const t of lex(src)) {
    switch (t.type) {
      case 'heading': {
        const id = uniqueSlug(slugify(t.text), ids);
        const html = inline(t.text, env);
        blocks.push(`<h${t.depth} id="${id}">${html}</h${t.depth}>`);
        if (t.depth === 2 || t.depth === 3) toc.push({ level: t.depth, id, html });
        break;
      }
      case 'code': {
        const cls = t.lang === '' ? '' : ` class="language-${escapeHtml(t.lang)}"`;
        blocks.push(`<pre><code${cls}>${t.lines.map((l) => `${escapeHtml(l)}\n`).join('')}</code></pre>`);
        break;
      }
      case 'hr':
        blocks.push('<hr>');
        break;
      case 'blockquote':
        blocks.push(t.lines.length === 0 ? '<blockquote>\n</blockquote>' : `<blockquote>\n<p>${inline(t.lines.join('\n'), env)}</p>\n</blockquote>`);
        break;
      case 'list': {
        const tag = t.ordered ? 'ol' : 'ul';
        const open = t.ordered && t.start !== 1 ? `<ol start="${t.start}">` : `<${tag}>`;
        blocks.push(`${open}\n${t.items.map((item) => `<li>${inline(item, env)}</li>\n`).join('')}</${tag}>`);
        break;
      }
      case 'paragraph': {
        const html = inline(t.text, env);
        if (excerpt === null) excerpt = html;
        blocks.push(`<p>${html}</p>`);
        break;
      }
    }
  }
  return { html: blocks.map((b) => `${b}\n`).join(''), toc, excerpt: excerpt ?? '' };
}
