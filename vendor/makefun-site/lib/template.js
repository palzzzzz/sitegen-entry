// makefun-site's template dialect (README.md, "Templates"): its own, not Liquid, Nunjucks, Mustache or EJS.
//
//   {{ path }}               the value at path, HTML-escaped
//   {{{ path }}}             the value at path, raw
//   {% for x in path %} ... {% endfor %}      each element of an array, x bound to it and loop to
//                                             { index (from 1), first, last, length }
//   {% if path %} ... {% else %} ... {% endif %}   and {% if not path %}; the else is optional
//   {% include "name" %}     the template `name` rendered in the same scope, at most INCLUDE_DEPTH deep
//
// A path is names joined by dots (a-z, A-Z, 0-9 and _, from a letter or _). A {% %} tag alone on its line (only spaces
// or tabs beside it) takes its whole line with it, its newline included. A template is parsed once into a tree of
// nodes, and rendering runs each tree, compiled on its first render to nested functions, in a chain of scopes.

/** The deepest an include nests: one past it renders nothing. */
export const INCLUDE_DEPTH = 8;

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

/** A template that does not parse: its name and why. */
export class TemplateError extends Error {}

/** The path `text` names, split at its dots, or a TemplateError. */
function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

/** `src`'s tokens: text, {{ }}, {{{ }}} and {% %}, a standalone tag's line taken with it. */
function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

/** `src` parsed into its tree of nodes (a TemplateError when it does not parse). */
export function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

/**
 * Scopes. A page scope is { vars, parent }; a for's loop scope is { name, x, k, len, parent }: it binds `loop` (checked
 * before the element, so a for named loop binds loop) and the element's `name`. `loop`'s own names are worked out from
 * k and len when a path reads them, so no loop object is built per iteration.
 */

/** The loop value a path reads in a loop scope `s`: `loop` itself, or one of its four names, else undefined. */
function loopValue(s, path) {
  if (path.length === 1) return { index: s.k + 1, first: s.k === 0, last: s.k === s.len - 1, length: s.len };
  if (path.length > 2) return undefined; // loop's names hold numbers and booleans, which have no own properties
  switch (path[1]) {
    case 'index':
      return s.k + 1;
    case 'first':
      return s.k === 0;
    case 'last':
      return s.k === s.len - 1;
    case 'length':
      return s.len;
    default:
      return undefined;
  }
}

/** The value at `path` (split at its dots) in the scope chain: its first name from the nearest scope holding it, then own properties. */
function lookup(scope, path) {
  const first = path[0];
  let s = scope;
  let v;
  for (;;) {
    if (s === null) return undefined;
    if (s.vars !== undefined) {
      if (Object.hasOwn(s.vars, first)) {
        v = s.vars[first];
        break;
      }
    } else if (first === 'loop') {
      if (path.length === 1 || path.length === 2) return loopValue(s, path);
      return undefined;
    } else if (first === s.name) {
      v = s.x;
      break;
    }
    s = s.parent;
  }
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

/** A value as text: a string itself, a number in JavaScript's digits, true or false, an array's items joined by ", ", else "". */
function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

/** Whether a value counts as true in an if: not undefined, null, false, "", 0 or an empty array. */
function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

/**
 * A list of nodes compiled to one function (scope, ctx, depth) -> text. Adjacent text is joined, and the list is run as
 * `pre[0] + part[0]() + pre[1] + part[1]() ... + tail`: texts and the parts that make text between them.
 */
function compileList(nodes) {
  const pre = [];
  const parts = [];
  let text = '';
  for (const n of nodes) {
    if (n.kind === 'text') {
      text += n.text;
      continue;
    }
    pre.push(text);
    text = '';
    parts.push(compileNode(n));
  }
  const tail = text;
  const k = parts.length;
  if (k === 0) return () => tail;
  if (k === 1) {
    const p0 = pre[0];
    const f0 = parts[0];
    return (scope, ctx, depth) => p0 + f0(scope, ctx, depth) + tail;
  }
  return (scope, ctx, depth) => {
    let out = '';
    for (let i = 0; i < k; i++) out += pre[i] + parts[i](scope, ctx, depth);
    return out + tail;
  };
}

/** One non-text node compiled to a function (scope, ctx, depth) -> text. */
function compileNode(n) {
  switch (n.kind) {
    case 'var': {
      const path = n.path;
      return (scope, ctx) => ctx.escape(textOf(lookup(scope, path)));
    }
    case 'raw': {
      const path = n.path;
      return (scope) => textOf(lookup(scope, path));
    }
    case 'if': {
      const path = n.path;
      const not = n.not;
      const then = compileList(n.then);
      const other = n.else === null ? null : compileList(n.else);
      return (scope, ctx, depth) => {
        const branch = truthy(lookup(scope, path)) !== not ? then : other;
        return branch === null ? '' : branch(scope, ctx, depth);
      };
    }
    case 'for': {
      const path = n.path;
      const name = n.name;
      const body = compileList(n.body);
      return (scope, ctx, depth) => {
        const xs = lookup(scope, path);
        if (!Array.isArray(xs)) return '';
        const len = xs.length;
        let out = '';
        for (let k = 0; k < len; k++) out += body({ name, x: xs[k], k, len, parent: scope }, ctx, depth);
        return out;
      };
    }
    case 'include': {
      const name = n.name;
      return (scope, ctx, depth) => {
        const t = ctx.templates.get(name);
        return t !== undefined && depth < INCLUDE_DEPTH ? renderNodes(t, scope, ctx, depth + 1) : '';
      };
    }
    default:
      return () => '';
  }
}

/** The compiled function of a parsed template, made on its first render and kept on the node list. */
const COMPILED = new WeakMap();

/**
 * `nodes` rendered in `scope` ({ vars, parent }). `ctx` holds the parsed templates (`templates`, a Map of name to
 * nodes, a template that did not parse absent), the HTML escape and the include depth.
 */
export function renderNodes(nodes, scope, ctx, depth) {
  let fn = COMPILED.get(nodes);
  if (fn === undefined) {
    fn = compileList(nodes);
    COMPILED.set(nodes, fn);
  }
  return fn(scope, ctx, depth);
}
