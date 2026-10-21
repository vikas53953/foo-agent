// FID-01 (11-fidelity): the vendored spec in spec/ is read-only. SPEC-MANIFEST.json pins a sha256 per file;
// any added, removed or changed file fails. `--write` regenerates the manifest (only with an approved CR).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC = 'spec';
const MANIFEST = join(SPEC, 'SPEC-MANIFEST.json');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function hashSpec(): Record<string, string> {
  const files = walk(SPEC)
    .filter((p) => p !== MANIFEST)
    .map((p) => relative(SPEC, p).split(sep).join('/'))
    .sort();
  return Object.fromEntries(
    files.map((f) => [
      f,
      createHash('sha256')
        .update(readFileSync(join(SPEC, f)))
        .digest('hex'),
    ]),
  );
}

/** 11 §11.1.2: SHA-256 of the sorted `path:sha256` lines of the manifest (printed in every fidelity report). */
export function setSha256(): string {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { files: Record<string, string> };
  const lines = Object.entries(manifest.files)
    .map(([f, h]) => `${f}:${h}`)
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export function verify(): string[] {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { version: string; files: Record<string, string> };
  const now = hashSpec();
  const problems: string[] = [];
  for (const [f, h] of Object.entries(manifest.files)) {
    if (!(f in now)) problems.push(`missing: ${f}`);
    else if (now[f] !== h) problems.push(`changed: ${f}`);
  }
  for (const f of Object.keys(now)) if (!(f in manifest.files)) problems.push(`added: ${f}`);
  return problems;
}

/** Regenerates SPEC-MANIFEST.json from spec/ (only with an approved CR, or after merging a reviewed ticket that carries one). */
export function writeManifest(): void {
  writeFileSync(MANIFEST, JSON.stringify({ version: 'spec-v1.0', frozenAt: '2026-10-17', files: hashSpec() }, null, 2) + '\n');
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli && process.argv.includes('--write')) {
  writeManifest();
  console.log('manifest written');
} else if (isCli) {
  const problems = verify();
  if (problems.length > 0) {
    console.error(`spec/ differs from SPEC-MANIFEST.json:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('spec verified');
}
