// Spec: 10-acceptance-2 §D ART-08a (Article 8): the five canaries go in through the real Secret box, code box and paste
// catcher (test/canary/drive.ts), the app is closed, then every file under {DATA}, {LOCAL} and {OUT} (SQLite and its WAL, the
// tech log, activity.jsonl, the fake AI's captured request bodies), the DOM at each capture and the app's stdout/stderr are
// searched: 0 hits outside the vault. The report (§G.8, JSON + summary) is written to test-results/canary/. The article id is
// on test/articles/ART-08a.test.ts (its trace row); this file is the app half.
import { expect, test } from '@playwright/test';
import { fakeTurns, launchWithFakeAi } from './fakeAi';
import { aiRequestTexts, CANARY_AI, captureTexts, driveCanaries, openCanaryWorld, scanRun, untilAiTurns } from '../canary/drive';
import { summary, writeReport, type TextSource } from '../canary/scan';

test('Article 8 canary scan: 0 canary hits after the M5 secret journeys (10-2 §D)', async () => {
  test.setTimeout(120_000);
  const { app, dirs } = await launchWithFakeAi(CANARY_AI);
  const output: string[] = [];
  app.process().stdout?.on('data', (b: Buffer) => output.push(b.toString('utf8')));
  app.process().stderr?.on('data', (b: Buffer) => output.push(b.toString('utf8')));
  const page = await app.firstWindow();
  await openCanaryWorld(app, page);

  const texts: TextSource[] = [];
  await driveCanaries(page, async (name) => {
    texts.push(...(await captureTexts(page, name)));
  });
  // The three "Send anyway" messages each start an AI turn; their request bodies are part of the scan.
  await untilAiTurns(page, () => fakeTurns(dirs).filter((t) => t.purpose === 'intake').length, 3);
  await app.close();

  texts.push(...aiRequestTexts(fakeTurns(dirs)));
  texts.push({ source: 'process-output', label: 'stdout+stderr', text: output.join('') });
  const report = scanRun(dirs, texts);
  writeReport(report);
  console.log(summary(report));
  // The search reached the database and the tech log, not just some file.
  expect(report.files.some((f) => /^DATA\/(.+\/)?foo\.db$/.test(f))).toBe(true);
  expect(report.files.some((f) => /^DATA\/logs\/app-[\d-]+\.log$/.test(f))).toBe(true);
  expect(report.scanned.texts['field-values']).toBeGreaterThan(0);
  expect(report.scanned.texts['ai-request']).toBeGreaterThanOrEqual(3);
  expect(report.hits).toEqual([]);
});
