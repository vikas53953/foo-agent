// Spec: 04 §13 (the markdown subset foo renders: paragraphs, bold, italic, strike, links, bullet and numbered lists two
// levels deep, H1–H6, quotes, horizontal rules, inline code, code blocks, tables, images, citation pills; anything else —
// raw HTML, footnotes, math, task-list boxes, deeper lists — is plain text with its markers removed), §12.1 (rich
// triggers: a heading, a table, a code block, an image, a list with > 7 items or > 900 characters), §13.4 (citations),
// §14.4 (streaming: an unclosed `**`, `` ` `` or table row is held back until it closes or the line ends), §16.1–§16.2
// (auto-links and money in foo's text; none inside code or links), §10.10 (the user's WhatsApp set: *bold* _italic_
// ~strike~ `inline` ```block```), §1.9 (copy is plain text: markers removed, links as "text (url)", tables tab-separated).
// Pure: a small parser into a tree that React renders (no HTML strings, so nothing needs sanitising).
import { findAutoLinks, findMoney, hrefOf, type AutoKind } from './textRules';

export interface Source {
  name: string;
  url: string;
  domain: string;
}

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong' | 'em' | 'del'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'pre'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'auto'; kind: AutoKind; v: string; href: string }
  | { t: 'money'; v: string }
  | { t: 'cite'; sources: Source[] }
  | { t: 'br' };

export interface ListItem {
  c: Inline[];
  sub?: Extract<Block, { t: 'list' }>;
}

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }
  | { t: 'code'; lang: string; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][]; numeric: boolean[]; plain: string[][] }
  | { t: 'img'; alt: string; src: string };

export interface ParseOptions {
  /** foo's text: auto-links of every kind and money formatting (§16). The user's text links URLs, emails and phones (§10.7). */
  side: 'foo' | 'me';
}

/** 04 §13.4 (gap): a source is a markdown link whose address starts `cite+`, e.g. `[MakeMyTrip](cite+https://…)`. */
export const CITE_PREFIX = 'cite+';

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- inline

function findClose(s: string, from: number, delim: string): number {
  let i = s.indexOf(delim, from);
  while (i >= 0 && (s[i - 1] === ' ' || i === from)) i = s.indexOf(delim, i + 1);
  return i;
}

function parseInlineRaw(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    const two = s.slice(i, i + 2);
    if (c === '\\' && i + 1 < s.length && /[\\`*_~[\]()#>|!-]/.test(s[i + 1]!)) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (two === '**' || two === '__' || two === '~~') {
      const end = findClose(s, i + 2, two);
      if (end > i + 2 && s[i + 2] !== ' ') {
        flush();
        out.push({ t: two === '~~' ? 'del' : 'strong', c: parseInlineRaw(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((c === '*' || c === '_') && s[i + 1] !== ' ' && s[i + 1] !== c && (c === '*' || i === 0 || /[\s(]/.test(s[i - 1]!))) {
      const end = findClose(s, i + 1, c);
      if (end > i + 1 && (c === '*' || end + 1 >= s.length || /[\s.,;:!?)]/.test(s[end + 1]!))) {
        flush();
        out.push({ t: 'em', c: parseInlineRaw(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (c === '[' && s[i + 1] === '^') {
      // Footnote marker: removed (§13 "shown as plain text with its markers removed").
      const end = s.indexOf(']', i);
      if (end > i) {
        i = end + 1;
        continue;
      }
    }
    if (c === '!' && s[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m) {
        buf += m[1];
        i += m[0].length;
        continue;
      }
    }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m) {
        flush();
        const href = m[2]!;
        if (href.startsWith(CITE_PREFIX)) {
          const url = href.slice(CITE_PREFIX.length);
          const src: Source = { name: m[1]!, url, domain: domainOf(url) };
          const last = out[out.length - 1];
          if (last?.t === 'cite') last.sources.push(src);
          else out.push({ t: 'cite', sources: [src] });
        } else out.push({ t: 'link', href, c: parseInlineRaw(m[1]!) });
        i += m[0].length;
        // Spaces between two citations keep them in one pill.
        const ws = /^\s*(?=\[[^\]]+\]\(cite\+)/.exec(s.slice(i));
        if (ws && out[out.length - 1]?.t === 'cite') i += ws[0].length;
        continue;
      }
    }
    if (c === '\n') {
      flush();
      out.push({ t: 'br' });
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Auto-links (and, on foo's side, money) inside text nodes; never inside code, links or citations (§16.1). */
function decorate(nodes: Inline[], o: ParseOptions): Inline[] {
  const kinds: AutoKind[] = o.side === 'foo' ? ['url', 'email', 'phone', 'date'] : ['url', 'email', 'phone'];
  const out: Inline[] = [];
  for (const n of nodes) {
    if (n.t === 'strong' || n.t === 'em' || n.t === 'del') {
      out.push({ ...n, c: decorate(n.c, o) });
      continue;
    }
    if (n.t !== 'text') {
      out.push(n);
      continue;
    }
    const spans: { start: number; end: number; node: Inline }[] = [];
    for (const m of findAutoLinks(n.v, kinds))
      spans.push({ start: m.start, end: m.end, node: { t: 'auto', kind: m.kind, v: m.text, href: hrefOf(m) } });
    if (o.side === 'foo')
      for (const m of findMoney(n.v))
        if (!spans.some((s) => m.start < s.end && m.end > s.start))
          spans.push({ start: m.start, end: m.end, node: { t: 'money', v: m.text } });
    spans.sort((a, b) => a.start - b.start);
    let at = 0;
    for (const s of spans) {
      if (s.start > at) out.push({ t: 'text', v: n.v.slice(at, s.start) });
      out.push(s.node);
      at = s.end;
    }
    if (at < n.v.length) out.push({ t: 'text', v: n.v.slice(at) });
  }
  return out;
}

export function parseInline(s: string, o: ParseOptions = { side: 'foo' }): Inline[] {
  return decorate(parseInlineRaw(s), o);
}

// ---------------------------------------------------------------- blocks

const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** 04 §13.2: a column is numeric when ≥ 80 % of its cells parse as numbers (money included). */
export function isNumeric(cell: string): boolean {
  return /^[-+]?(₹|Rs\.?\s?|\$|€)?\s?\d[\d,]*(\.\d+)?\s?%?$/.test(cell.trim());
}

const stripTask = (s: string) => s.replace(/^\[[ xX]\]\s+/, '');

export function parseBlocks(text: string, o: ParseOptions = { side: 'foo' }): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join('\n'), o) });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push({ t: 'code', lang: fence[1] ?? '', v: body.join('\n') });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      blocks.push({ t: 'h', level: h[1]!.length, c: parseInline(h[2]!, o) });
      i++;
      continue;
    }
    if (HR.test(line)) {
      flushPara();
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      flushPara();
      const headRaw = cells(line);
      const rowsRaw: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rowsRaw.push(cells(lines[i++]!));
      const width = headRaw.length;
      const norm = rowsRaw.map((r) => Array.from({ length: width }, (_, k) => r[k] ?? ''));
      const numeric = headRaw.map((_, k) => {
        const col = norm.map((r) => r[k]!).filter((c) => c !== '');
        return col.length > 0 && col.filter(isNumeric).length / col.length >= 0.8;
      });
      blocks.push({
        t: 'table',
        head: headRaw.map((c) => parseInline(c, o)),
        rows: norm.map((r) => r.map((c) => parseInline(c, o))),
        numeric,
        plain: [headRaw, ...norm],
      });
      continue;
    }
    const img = IMAGE.exec(line);
    if (img) {
      flushPara();
      blocks.push({ t: 'img', alt: img[1] ?? '', src: img[2]! });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushPara();
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) inner.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push({ t: 'quote', c: parseBlocks(inner.join('\n'), o) });
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      flushPara();
      const ordered = /\d/.test(li[2]!);
      const list: Extract<Block, { t: 'list' }> = { t: 'list', ordered, start: ordered ? parseInt(li[2]!, 10) : 1, items: [] };
      const baseIndent = li[1]!.length;
      while (i < lines.length) {
        const m = LIST.exec(lines[i]!);
        if (!m) {
          // A continuation line belongs to the last item.
          if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && list.items.length) {
            const last = list.items[list.items.length - 1]!;
            last.c.push({ t: 'br' }, ...parseInline(lines[i]!.trim(), o));
            i++;
            continue;
          }
          break;
        }
        const indent = m[1]!.length;
        const content = stripTask(m[3]!);
        if (indent < baseIndent + 2) {
          if (/\d/.test(m[2]!) !== ordered && list.items.length) break;
          list.items.push({ c: parseInline(content, o) });
        } else {
          const parent = list.items[list.items.length - 1];
          if (!parent) list.items.push({ c: parseInline(content, o) });
          else if (indent < baseIndent + 4 || !parent.sub) {
            const subOrdered = /\d/.test(m[2]!);
            parent.sub ??= { t: 'list', ordered: subOrdered, start: subOrdered ? parseInt(m[2]!, 10) : 1, items: [] };
            parent.sub.items.push({ c: parseInline(content, o) });
          } else {
            // Deeper than two levels: plain text on the level-2 item (§13).
            const deepest = parent.sub.items[parent.sub.items.length - 1]!;
            deepest.c.push({ t: 'text', v: ` ${content}` });
          }
        }
        i++;
      }
      blocks.push(list);
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

// ---------------------------------------------------------------- facts

function countListItems(b: Block): number {
  if (b.t !== 'list') return 0;
  return b.items.reduce((n, it) => n + 1 + (it.sub ? countListItems(it.sub) : 0), 0);
}

/** 04 §12.1: the message needs the rich (wide) bubble. */
export function isRich(text: string, blocks: Block[] = parseBlocks(text)): boolean {
  if (text.length > 900) return true;
  const walk = (bs: Block[]): boolean =>
    bs.some(
      (b) => b.t === 'h' || b.t === 'table' || b.t === 'code' || b.t === 'img' || countListItems(b) > 7 || (b.t === 'quote' && walk(b.c)),
    );
  return walk(blocks);
}

/** Every citation in order of appearance (for "Sources ({n}) ›"), de-duplicated by URL. */
export function allSources(blocks: Block[]): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  const inl = (ns: Inline[]) =>
    ns.forEach((n) => {
      if (n.t === 'cite') n.sources.forEach((s) => !seen.has(s.url) && (seen.add(s.url), out.push(s)));
      else if (n.t === 'strong' || n.t === 'em' || n.t === 'del' || n.t === 'link') inl(n.c);
    });
  const blk = (bs: Block[]) =>
    bs.forEach((b) => {
      if (b.t === 'p' || b.t === 'h') inl(b.c);
      else if (b.t === 'quote') blk(b.c);
      else if (b.t === 'list') b.items.forEach((it) => (inl(it.c), it.sub && blk([it.sub])));
      else if (b.t === 'table') [...b.head, ...b.rows.flat()].forEach(inl);
    });
  blk(blocks);
  return out;
}

// ---------------------------------------------------------------- plain text (§1.9 copy rule)

export function inlineText(ns: Inline[], withUrls = true): string {
  return ns
    .map((n) => {
      switch (n.t) {
        case 'text':
        case 'code':
        case 'pre':
        case 'money':
          return n.v;
        case 'auto':
          return n.v;
        case 'br':
          return '\n';
        case 'cite':
          return '';
        case 'link': {
          const label = inlineText(n.c, withUrls);
          return withUrls && label !== n.href ? `${label} (${n.href})` : label;
        }
        default:
          return inlineText(n.c, withUrls);
      }
    })
    .join('');
}

export function plainText(blocks: Block[]): string {
  const list = (b: Extract<Block, { t: 'list' }>, depth: number): string =>
    b.items
      .map((it, k) => {
        const mark = b.ordered ? `${b.start + k}.` : '•';
        const line = `${'  '.repeat(depth)}${mark} ${inlineText(it.c)}`;
        return it.sub ? `${line}\n${list(it.sub, depth + 1)}` : line;
      })
      .join('\n');
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'p':
        case 'h':
          return inlineText(b.c).replace(/[ \t]+$/gm, '');
        case 'list':
          return list(b, 0);
        case 'quote':
          return plainText(b.c);
        case 'hr':
          return '';
        case 'code':
          return b.v;
        case 'table':
          return b.plain.map((r) => r.join('\t')).join('\n');
        case 'img':
          return b.alt;
      }
    })
    .filter((s) => s !== '')
    .join('\n');
}

// ---------------------------------------------------------------- streaming (§14.4)

/** The part of a streaming text that may be shown: an unclosed `**`, `` ` `` or table row on the last line is held back. */
export function streamSafe(text: string): string {
  const cut = text.lastIndexOf('\n') + 1;
  let last = text.slice(cut);
  const head = text.slice(0, cut);
  if (/^\s*\|/.test(last)) return head;
  const inFence = (head.match(/^\s*```/gm)?.length ?? 0) % 2 === 1;
  if (inFence) return text;
  const bold = last.split('**').length - 1;
  if (bold % 2 === 1) last = last.slice(0, last.lastIndexOf('**'));
  const ticks = last.replace(/```/g, '').split('`').length - 1;
  if (ticks % 2 === 1) last = last.slice(0, last.lastIndexOf('`'));
  return head + last;
}

// ---------------------------------------------------------------- the user's WhatsApp set (§10.10)

const WA: Record<string, 'strong' | 'em' | 'del' | 'code'> = { '*': 'strong', _: 'em', '~': 'del', '`': 'code' };

/** 04 §10.10: only *bold*, _italic_, ~strike~, `inline` and ```block```; then URLs, emails and phones (§10.7). */
/**
 * DOM heading rank for each markdown heading in one message (04 §13 styles by markdown level; the DOM rank is separate).
 * The chat header is the page's `<h1>` and the virtualised list mounts any window of rows, so a message heading may follow
 * the `<h1>` or another message's heading. Ranks therefore only ever step down by one: the message's first heading, and
 * every H1/H2, is `<h2>`; an H3–H6 is `<h3>` only after an H1/H2 in the same message (axe heading-order, ART-26a).
 */
export function headingRanks(blocks: Block[]): Map<Block, 2 | 3> {
  const out = new Map<Block, 2 | 3>();
  let top = false;
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.t === 'h') {
        if (b.level <= 2) top = true;
        out.set(b, b.level <= 2 || !top ? 2 : 3);
      } else if (b.t === 'quote') walk(b.c);
    }
  };
  walk(blocks);
  return out;
}

export function parseWhatsApp(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('```', i)) {
      const end = text.indexOf('```', i + 3);
      if (end > i + 3) {
        flush();
        out.push({ t: 'pre', v: text.slice(i + 3, end).replace(/^\n|\n$/g, '') });
        i = end + 3;
        continue;
      }
    }
    const c = text[i]!;
    const kind = WA[c];
    const before = i === 0 ? ' ' : text[i - 1]!;
    if (kind && /[\s([{"'“‘]/.test(before) && text[i + 1] && !/\s/.test(text[i + 1]!)) {
      let end = text.indexOf(c, i + 1);
      while (end > 0 && /\s/.test(text[end - 1]!)) end = text.indexOf(c, end + 1);
      const after = end > 0 ? (text[end + 1] ?? ' ') : '';
      if (end > i + 1 && /[\s.,;:!?)\]}"'”’]/.test(after) && !text.slice(i + 1, end).includes('\n')) {
        flush();
        const inner = text.slice(i + 1, end);
        out.push(kind === 'code' ? { t: 'code', v: inner } : { t: kind, c: parseWhatsApp(inner) });
        i = end + 1;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return decorate(out, { side: 'me' });
}
