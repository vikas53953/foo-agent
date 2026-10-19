// Spec: 10-acceptance-2 §D ART-08a (search every file under the app's data folders, logs, captured AI request bodies,
// toasts, crash reports, screenshots, the export zip: "0 canary hits outside Credential Manager"), §G.8 (scan reports: JSON +
// summary). Files are searched as bytes, in UTF-8 and UTF-16LE (how Windows writes wide strings), so a SQLite page, a
// write-ahead log or a crash dump is searched whole. Texts (DOM snapshots, process output) are searched as strings.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { forms, type Canary } from './canaries';

export interface CanaryHit {
  kind: Canary['kind'];
  form: string;
  /** Where it was found: a file path relative to its scanned root, or a text source's label. */
  where: string;
  encoding: 'utf8' | 'utf16le' | 'text';
}

export interface TextSource {
  /** e.g. `dom`, `stdout`, `ai-request`. */
  source: string;
  label: string;
  text: string;
}

/** Whole-token match for short digit canaries: no letter, digit, `-` or `_` on either side. */
const tokenRe = (form: string) => new RegExp(`(?<![0-9A-Za-z_-])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9A-Za-z_-])`);

function findIn(text: string, c: Canary, form: string): boolean {
  return c.token ? tokenRe(form).test(text) : text.includes(form);
}

/** Every canary form in one buffer, read as UTF-8 and as UTF-16LE. */
export function scanBuffer(buf: Buffer, where: string, canaries: readonly Canary[]): CanaryHit[] {
  const asUtf8 = buf.toString('latin1');
  const asWide = [buf.toString('utf16le'), buf.subarray(1).toString('utf16le')];
  const hits: CanaryHit[] = [];
  for (const c of canaries)
    for (const form of forms(c)) {
      if (findIn(asUtf8, c, form)) hits.push({ kind: c.kind, form, where, encoding: 'utf8' });
      else if (asWide.some((w) => findIn(w, c, form))) hits.push({ kind: c.kind, form, where, encoding: 'utf16le' });
    }
  return hits;
}

export function scanText(s: TextSource, canaries: readonly Canary[]): CanaryHit[] {
  return canaries.flatMap((c) =>
    forms(c)
      .filter((form) => findIn(s.text, c, form))
      .map((form) => ({ kind: c.kind, form, where: `${s.source}:${s.label}`, encoding: 'text' as const })),
  );
}

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

export interface ScanInput {
  /** Folders to search whole, by name (`DATA`, `LOCAL`, `OUT`). */
  roots: Record<string, string>;
  texts: TextSource[];
  canaries: readonly Canary[];
}

export interface ScanReport {
  article: 'ART-08a';
  canaries: { kind: Canary['kind']; forms: number }[];
  scanned: { files: number; bytes: number; byRoot: Record<string, number>; texts: Record<string, number> };
  /** Every file searched, as `ROOT/relative/path`, so a run can prove the database and the logs were in it. */
  files: string[];
  /** Spec sources this run could not search yet, with the milestone that adds them. */
  notCovered: { what: string; why: string }[];
  /** Where the canaries are allowed to be: the vault (an in-memory Credential Manager in FOO_TEST, 08-3 §22.2). */
  allowed: string;
  hits: CanaryHit[];
}

export function scan(input: ScanInput, notCovered: ScanReport['notCovered'] = []): ScanReport {
  const hits: CanaryHit[] = [];
  const byRoot: Record<string, number> = {};
  const searched: string[] = [];
  let files = 0;
  let bytes = 0;
  for (const [name, root] of Object.entries(input.roots)) {
    const list = listFiles(root);
    byRoot[name] = list.length;
    for (const f of list) {
      const buf = readFileSync(f);
      const where = `${name}/${relative(root, f).split('\\').join('/')}`;
      files++;
      bytes += buf.length;
      searched.push(where);
      hits.push(...scanBuffer(buf, where, input.canaries));
    }
  }
  const texts: Record<string, number> = {};
  for (const s of input.texts) {
    texts[s.source] = (texts[s.source] ?? 0) + 1;
    hits.push(...scanText(s, input.canaries));
  }
  return {
    article: 'ART-08a',
    canaries: input.canaries.map((c) => ({ kind: c.kind, forms: forms(c).length })),
    scanned: { files, bytes, byRoot, texts },
    files: searched,
    notCovered,
    allowed: 'the vault only (FOO_TEST: in-memory Credential Manager stand-in, 08-3 §22.2)',
    hits,
  };
}

/** One-paragraph summary for the PR and the close-out (§G.8). */
export function summary(r: ScanReport): string {
  const texts = Object.entries(r.scanned.texts)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  const head = `ART-08a canary scan: ${r.hits.length} hit(s) for ${r.canaries.length} canaries in ${r.scanned.files} files (${r.scanned.bytes} bytes) and ${texts || 'no'} text captures.`;
  const hits = r.hits.map((h) => `  HIT ${h.kind} "${h.form}" in ${h.where} (${h.encoding})`);
  const gaps = r.notCovered.map((g) => `  not covered: ${g.what} (${g.why})`);
  return [head, ...hits, ...gaps].join('\n');
}

/** Writes `<dir>/ART-08a.json` and `<dir>/ART-08a.txt`; returns the JSON path. */
export function writeReport(r: ScanReport, dir = join('test-results', 'canary')): string {
  const file = join(dir, 'ART-08a.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(r, null, 2) + '\n');
  writeFileSync(join(dir, 'ART-08a.txt'), summary(r) + '\n');
  return file;
}
