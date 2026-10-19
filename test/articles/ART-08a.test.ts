// Spec: 10-acceptance-2 §D ART-08a (Article 8: canaries seeded as AI key, site password, card number, CVV and OTP; every file
// the app writes, its logs, AI request bodies, toasts, crash reports and screenshots are searched; 0 hits outside Credential
// Manager), §G.8 (scan report: JSON + summary), 08-3 §19.1 (the tech log holds no secret values; R7). This file proves the
// scanner itself (a canary planted in a log line fails the scan) and the tech-log choke point in-process; the app run that
// seeds the canaries through the real Secret box and vault is test/e2e/m5-canary.spec.ts (test/canary/drive.ts).
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TechLog } from '../../src/main/log/techLog';
import { mainRegistry, registerSecretValue } from '../../src/main/secrets/registerValue';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { ALL_CANARIES, CANARIES, groupedCard } from '../canary/canaries';
import { scan, scanBuffer, scanText, summary } from '../canary/scan';

const tempData = () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'foo-art08a-')), 'data');
  mkdirSync(join(dir, 'logs'), { recursive: true });
  return dir;
};

afterEach(() => mainRegistry().clear());

describe('ART-08a · the canary scanner', () => {
  it('ART-08a: a canary planted in a tech log line is a hit; the same folder without it is clean', () => {
    const data = tempData();
    const log = new TechLog({ dir: join(data, 'logs'), clock: new FakeClock(TEST_EPOCH_MS) });
    log.write({ lvl: 'info', mod: 'vault', evt: 'SECRET_SAVED', ids: { chatId: 'c_1' } });
    const clean = scan({ roots: { DATA: data }, texts: [], canaries: ALL_CANARIES });
    expect(clean.scanned.files).toBe(1);
    expect(clean.hits).toEqual([]);

    const [file] = readdirSync(join(data, 'logs'));
    appendFileSync(join(data, 'logs', file!), `{"t":0,"lvl":"info","mod":"vault","evt":"saved ${CANARIES.aiKey.value}"}\n`);
    const planted = scan({ roots: { DATA: data }, texts: [], canaries: ALL_CANARIES });
    expect(planted.hits).toEqual([{ kind: 'ai_key', form: CANARIES.aiKey.value, where: `DATA/logs/${file}`, encoding: 'utf8' }]);
    expect(summary(planted)).toContain(`HIT ai_key "${CANARIES.aiKey.value}" in DATA/logs/${file}`);
  });

  it('ART-08a: a card number is found grouped by spaces or dashes, and any canary in UTF-16 (Windows wide strings)', () => {
    const card = CANARIES.cardNumber;
    expect(scanBuffer(Buffer.from(`n=${groupedCard(card.value)}`), 'a', [card]).map((h) => h.form)).toEqual(['4929 3817 0652 4182']);
    expect(scanBuffer(Buffer.from(`n=${groupedCard(card.value, '-')}`), 'a', [card]).map((h) => h.form)).toEqual(['4929-3817-0652-4182']);
    const wide = scanBuffer(Buffer.from(`pw ${CANARIES.sitePassword.value}`, 'utf16le'), 'dump', ALL_CANARIES);
    expect(wide).toEqual([{ kind: 'site_password', form: CANARIES.sitePassword.value, where: 'dump', encoding: 'utf16le' }]);
    // Odd byte offset: a wide string that starts one byte into the buffer.
    const odd = Buffer.concat([Buffer.from([0]), Buffer.from(CANARIES.otp.value, 'utf16le')]);
    expect(scanBuffer(odd, 'dump', [CANARIES.otp]).map((h) => h.encoding)).toEqual(['utf16le']);
  });

  it('ART-08a: a SQLite-style page holding a value between binary bytes is a hit', () => {
    const data = tempData();
    const page = Buffer.concat([Buffer.from([0x0d, 0x00, 0x00, 0x01, 0x0f]), Buffer.from(CANARIES.cardNumber.value), Buffer.alloc(16)]);
    writeFileSync(join(data, 'foo.db-wal'), page);
    expect(scan({ roots: { DATA: data }, texts: [], canaries: ALL_CANARIES }).hits.map((h) => h.where)).toEqual(['DATA/foo.db-wal']);
  });

  it('ART-08a: CVV and OTP match as whole tokens only, never inside a longer number, an id or a date', () => {
    const { cvv, otp } = CANARIES;
    for (const text of [`id k_1${cvv.value}x`, `at 179${cvv.value}000`, `uuid 1f2e-${cvv.value}-aa`, `${otp.value}9`, `n${otp.value}`])
      expect(scanText({ source: 'dom', label: 't', text }, [cvv, otp])).toEqual([]);
    for (const text of [`CVV ${cvv.value}`, `{"cvv":"${cvv.value}"}`, `code: ${otp.value}.`])
      expect(scanText({ source: 'dom', label: 't', text }, [cvv, otp])).toHaveLength(1);
  });
});

describe('ART-08a · the tech log choke point (08-3 §19.1, R7)', () => {
  it('ART-08a: canary values a caller hands the tech log never reach the file', () => {
    const data = tempData();
    // §11.3: a value is registered before first use (the vault, code:submit and the paste catcher do this in the app).
    registerSecretValue(CANARIES.aiKey.value, { kind: 'ai_key' });
    registerSecretValue(CANARIES.sitePassword.value, { kind: 'login' });
    registerSecretValue(CANARIES.cardNumber.value, { kind: 'card' });
    registerSecretValue(CANARIES.cvv.value, { kind: 'cvv' });
    registerSecretValue(CANARIES.otp.value, { kind: 'otp' });
    const log = new TechLog({ dir: join(data, 'logs'), clock: new FakeClock(TEST_EPOCH_MS), debug: true });
    for (const c of ALL_CANARIES) {
      log.write({ lvl: 'error', mod: 'vault', evt: `SAVE_FAILED ${c.value}`, kind: `value=${c.value}` });
      log.write({ lvl: 'debug', mod: `m ${groupedCard(c.value)}`, evt: 'X', kind: `CVV is ${c.value}` });
    }
    const report = scan({ roots: { DATA: data }, texts: [], canaries: ALL_CANARIES });
    expect(report.scanned.files).toBe(1);
    expect(report.hits).toEqual([]);
  });
});
