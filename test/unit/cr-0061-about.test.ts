// Spec: CR-0061 (X-218): 06-3 §18.2 Send a report (the preview is exactly what is saved; a .zip of the redacted log, the
// note redacted, nothing uploaded; R9 refuses a save with a secret in it, `EXPORT_SECRET_FOUND`), 06-2 §6.11 `licences`
// (every production dependency is listed), 06-3 §16 What's new (notes ship inside the app).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { REPORT_DAYS, reportPreview, reportSave, reportText } from '../../src/main/about/report';
import licences from '../../resources/licences.json';
import whatsNew from '../../resources/whats-new.json';
import pkg from '../../package.json';

// 05:00 UTC is 10:30 in India: the header and the zip name follow `locale.timeZone` (the log files are named by UTC day).
const NOW = Date.UTC(2026, 9, 26, 5, 0);
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;

function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'foo-report-'));
  mkdirSync(join(dir, 'logs'));
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  writeFileSync(join(dir, 'logs', `app-${day(NOW)}.log`), '{"evt":"today"}\n');
  writeFileSync(join(dir, 'logs', `app-${day(NOW - (REPORT_DAYS - 1) * DAY)}.log`), '{"evt":"week-start"}\n');
  writeFileSync(join(dir, 'logs', `app-${day(NOW - REPORT_DAYS * DAY)}.log`), '{"evt":"too-old"}\n');
  return dir;
}

/** The files of a zip written by memory/export's `zip` (deflate; local headers one after the other). */
function zipFiles(zipPath: string): { name: string; text: string }[] {
  const b = readFileSync(zipPath);
  const out: { name: string; text: string }[] = [];
  for (let at = 0; b.readUInt32LE(at) === 0x04034b50;) {
    const size = b.readUInt32LE(at + 18);
    const nameLen = b.readUInt16LE(at + 26);
    const extra = b.readUInt16LE(at + 28);
    const start = at + 30 + nameLen + extra;
    out.push({
      name: b.subarray(at + 30, at + 30 + nameLen).toString('utf8'),
      text: inflateRawSync(b.subarray(start, start + size)).toString('utf8'),
    });
    at = start + size;
  }
  return out;
}

describe('CR-0061 Send a report', () => {
  it('the preview is the last 7 days of the log under one header line, and Save writes exactly that', () => {
    const dir = dataDir();
    const text = reportText({ dataDir: dir, version: '0.0.1', now: NOW, timeZone: TZ });
    expect(text.split('\n')[0]).toMatch(/^foo 0\.0\.1 · Windows .+ · 2026-10-26 10:30$/);
    expect(text).toContain('week-start');
    expect(text).toContain('today');
    expect(text).not.toContain('too-old');
    const p = reportPreview({ dataDir: dir, version: '0.0.1', now: NOW, timeZone: TZ });
    const key = 'sk-ant-api03-' + 'c'.repeat(80);
    const r = reportSave(p.previewId, `it froze after I pasted ${key}`, join(dir, 'reports'), NOW, TZ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.zipPath).toMatch(/foo-report-2026-10-26-1030\.zip$/);
    const [report, note] = zipFiles(r.zipPath);
    expect(report).toEqual({ name: 'report.txt', text: p.text });
    expect(note?.name).toBe('note.txt');
    expect(note?.text).toContain('it froze after I pasted');
    expect(note?.text).not.toContain(key);
    expect(reportSave(p.previewId, undefined, join(dir, 'reports'), NOW, TZ)).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('a secret anywhere stops the save before anything is written (R9)', () => {
    const dir = dataDir();
    writeFileSync(join(dir, 'logs', `app-${new Date(NOW).toISOString().slice(0, 10)}.log`), `{"evt":"sk-ant-api03-${'b'.repeat(80)}"}\n`);
    const p = reportPreview({ dataDir: dir, version: '0.0.1', now: NOW, timeZone: TZ });
    expect(reportSave(p.previewId, undefined, join(dir, 'reports'), NOW, TZ)).toEqual({ ok: false, error: 'EXPORT_SECRET_FOUND' });
  });
});

describe('CR-0061 Open-source parts and What’s new', () => {
  it('lists every production dependency and the parts that are not npm packages', () => {
    const names = new Set((licences as { name: string }[]).map((l) => l.name));
    for (const dep of Object.keys(pkg.dependencies))
      expect(names, `${dep} in resources/licences.json (pnpm licences:write)`).toContain(dep);
    for (const extra of ['Electron', 'Chromium', 'Node.js', 'SQLite', 'Fluent Emoji 3D']) expect(names).toContain(extra);
  });

  it('this version has 3–6 notes', () => {
    const n = (whatsNew as { version: string; notes: string[] }[]).find((w) => w.version === pkg.version);
    expect(n?.notes.length).toBeGreaterThanOrEqual(3);
    expect(n?.notes.length).toBeLessThanOrEqual(6);
  });
});
