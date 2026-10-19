// Spec: 10-acceptance-2 §D ART-08a (Article 8), §G.8. M5 T11 proof: the five canaries (AI key, site password, card number,
// CVV, OTP) go in through the paste catcher, the Secret box, the card form, a login box and the code box, three more are sent
// with "Send anyway"; then every file the run wrote, the DOM at each picture, the AI request bodies and the process output
// are searched. Expected: 0 hits, the report in test-results/canary/.
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t11-canary.journey.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { fakeTurns } from '../e2e/fakeAi';
import { rest, setTheme, settle } from '../fidelity/capture';
import { aiRequestTexts, CANARY_AI, captureTexts, driveCanaries, openCanaryWorld, scanRun, untilAiTurns } from '../canary/drive';
import { summary, writeReport, type TextSource } from '../canary/scan';

export default async function journey(v: Verify): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-t11-proof-'));
  const dirs = { FOO_DATA_DIR: join(base, 'data'), FOO_LOCAL_DIR: join(base, 'local'), FOO_OUT_DIR: join(base, 'out') };
  const { app, page } = await v.launch({ fakeAi: CANARY_AI, env: dirs });
  const output: string[] = [];
  app.process().stdout?.on('data', (b: Buffer) => output.push(b.toString('utf8')));
  app.process().stderr?.on('data', (b: Buffer) => output.push(b.toString('utf8')));
  await openCanaryWorld(app, page);
  await setTheme(page, 'light');

  const texts: TextSource[] = [];
  await driveCanaries(page, async (name) => {
    await rest(page);
    await settle(page);
    await v.shot(name);
    // The DOM the picture was taken from (G-M5-35: M5 searches it instead of OCR).
    texts.push(...(await captureTexts(page, name)));
  });
  v.note('AI key moved and saved, card saved (CVV typed, never saved), login saved, code used, three "Send anyway" messages');
  // Read from this run's own data folder (the env above), where the fake AI records each request.
  const turns = () => fakeTurns(dirs).filter((t) => t.purpose === 'intake');
  await untilAiTurns(page, () => turns().length, 3);
  await app.close();

  texts.push(...aiRequestTexts(fakeTurns(dirs)));
  texts.push({ source: 'process-output', label: 'stdout+stderr', text: output.join('') });
  const report = scanRun(dirs, texts);
  const file = writeReport(report);
  v.note(summary(report).split('\n')[0]!);
  v.note(`searched: ${JSON.stringify(report.scanned.byRoot)} files, texts ${JSON.stringify(report.scanned.texts)}; report ${file}`);
  if (!report.files.some((f) => /^DATA\/(.+\/)?foo\.db$/.test(f)) || !report.files.some((f) => /^DATA\/logs\/app-[\d-]+\.log$/.test(f)))
    throw new Error(`the search missed foo.db or the tech log: ${report.files.join(', ')}`);
  if (report.hits.length) throw new Error(summary(report));
}
