// Spec: 06-2 §6.11 `licences` ("Open-source parts": "{name} · {licence}" for each part foo ships), CR-0061 (X-218) pick:
// the production packages from `pnpm licenses list --prod`, plus the parts that are not npm packages (Electron's Chromium
// and Node.js, SQLite inside better-sqlite3, the Fluent 3D eyes). Run `pnpm licences:write` after a dependency change; the
// unit test `cr-0061-about` fails when a direct dependency is missing.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const EXTRA: { name: string; licence: string }[] = [
  { name: 'Electron', licence: 'MIT' },
  { name: 'Chromium', licence: 'BSD-3-Clause' },
  { name: 'Node.js', licence: 'MIT' },
  { name: 'SQLite', licence: 'Public domain' },
  { name: 'Fluent Emoji 3D', licence: 'MIT' },
];

const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const byLicence = JSON.parse(raw) as Record<string, { name: string }[]>;
const parts = new Map<string, string>();
for (const [licence, pkgs] of Object.entries(byLicence)) for (const p of pkgs) parts.set(p.name, licence);
for (const e of EXTRA) parts.set(e.name, e.licence);
const list = [...parts].map(([name, licence]) => ({ name, licence })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
writeFileSync(join(ROOT, 'resources', 'licences.json'), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
console.log(`licences.json: ${list.length} parts`);
