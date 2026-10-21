// 08-0 §D: every t('key') used in src/ exists in en-IN.json, no unused keys, every {var} supplied where literal vars are passed,
// and no Article 2 banned word (the Article 2 list lives here, X-140; regex = 10-acceptance-2 ART-02a).
// Two kinds of keys have no literal t('key') call (CR-0008): the step phrase keys `cards.checklist.{key}.{form}` of 08-4 §26.1,
// looked up through `phraseCopyKey()` (src/shared/phrases.ts), which must match PHRASES exactly; and the keys a ticket landed
// before the ticket that renders them (scripts/copy-pending.json and scripts/copy-pending/<ticket>.json), which count as
// used until a t() call uses them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHRASES, type PhraseForm } from '../src/shared/phrases';

/** Every phrase copy key and its text, from the 08-4 §26.1 table. */
export function phraseKeys(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, p] of Object.entries(PHRASES))
    for (const form of ['next', 'running', 'done'] as PhraseForm[]) {
      const text = p[form] as string | null;
      if (text !== null) out[`cards.checklist.${key}.${form}`] = text.replace(/'/g, '’');
    }
  return out;
}

const PENDING_DIR = 'scripts/copy-pending';

/** Pending keys as [file, key]: the shared scripts/copy-pending.json plus one scripts/copy-pending/<ticket>.json per ticket,
 *  so parallel tickets never edit the same list (P1 + R1 retro). A ticket deletes its own file once it renders every key. */
export function pendingKeys(): [string, string][] {
  const files = [
    'scripts/copy-pending.json',
    ...(existsSync(PENDING_DIR)
      ? readdirSync(PENDING_DIR)
          .filter((n) => n.endsWith('.json'))
          .sort()
          .map((n) => `${PENDING_DIR}/${n}`)
      : []),
  ];
  return files.flatMap((f) =>
    Object.keys((JSON.parse(readFileSync(f, 'utf8')) as { keys: Record<string, string> }).keys).map((k): [string, string] => [f, k]),
  );
}

export const BANNED =
  /\b(api|tokens?|cli|oauth|servers?|cron|webhooks?|mcp|json|prompts?|models?|terminals?|commands?|error codes?|stack|time ?-?outs?|timed out|localhost|llms?|agent loops?)\b/gi;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?)$/.test(p) ? [p] : [];
  });
}

export function checkCopy(): string[] {
  const copy = JSON.parse(readFileSync('src/shared/copy/en-IN.json', 'utf8')) as Record<string, string>;
  const problems: string[] = [];
  const used = new Set<string>();
  for (const file of walk('src')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-z0-9_.]+)'/g)) {
      used.add(m[1]!);
      if (!(m[1]! in copy)) problems.push(`${file}: missing key ${m[1]}`);
    }
  }
  const phrases = phraseKeys();
  for (const [key, text] of Object.entries(phrases)) {
    if (!(key in copy)) problems.push(`missing phrase key ${key}`);
    else if (copy[key] !== text) problems.push(`${key}: must be the 08-4 §26.1 text "${text}"`);
    used.add(key);
  }
  for (const key of Object.keys(copy))
    if (/^cards\.checklist\.[a-z_]+\.(next|running|done)$/.test(key) && !(key in phrases)) problems.push(`${key}: not a 08-4 §26.1 phrase`);
  for (const [file, key] of pendingKeys()) {
    if (!(key in copy)) problems.push(`${file}: ${key} is not in en-IN.json`);
    else if (used.has(key)) problems.push(`${file}: ${key} is used now; remove it from the list`);
    used.add(key);
  }
  for (const [key, text] of Object.entries(copy)) {
    if (!used.has(key)) problems.push(`unused key ${key}`);
    if (!/^[a-z_]+(\.[a-z0-9_]+){2,}$/.test(key)) problems.push(`bad key shape ${key}`);
    for (const m of text.matchAll(BANNED)) problems.push(`${key}: banned word "${m[0]}"`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = checkCopy();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('copy ok');
}
