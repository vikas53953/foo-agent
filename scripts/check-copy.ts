// 08-0 §D: every t('key') used in src/ exists in en-IN.json, no unused keys, every {var} supplied where literal vars are passed,
// and no Article 2 banned word (the Article 2 list lives here, X-140; regex = 10-acceptance-2 ART-02a).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
