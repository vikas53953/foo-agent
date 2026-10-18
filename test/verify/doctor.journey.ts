// Spec: 08-3 §22.7 (renderer test hooks in FOO_TEST runs), 11-fidelity §11.2.3. foo-verify's doctor: one cheap launch that
// answers "is this build worth driving?" (window up, test hooks present, seed loads, both themes paint).
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/doctor.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { openWorld, setTheme, settle } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const version = await app.evaluate(({ app: a }) => `${a.getName()} ${a.getVersion()} · Electron ${process.versions.electron}`);
  v.note(`window up: ${version}`);
  if (!(await page.evaluate(() => typeof window.__fooTest?.seed === 'function')))
    throw new Error('window.__fooTest is missing: not a FOO_TEST build');
  v.note('test hooks present (window.__fooTest)');
  const refs = await openWorld(app, page);
  const rows = await page.getByTestId(TID.chatlistRow).count();
  if (rows === 0) throw new Error('ux-world seed loaded no chat rows');
  v.note(`ux-world seed loaded: ${rows} chat rows, ${Object.keys(refs).length} refs`);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await settle(page);
    await v.shot('doctor');
  }
  v.note('light and dark both paint');
}
