// Spec: 03-shell-1 §3.4.6 rule 3a (X-154 "Working on…" / "Waiting to start…"), 03-shell-2 §3.7.3.1 (X-148 Doing now tabs),
// 04-2 §23.2a (X-149 stacked error notices), 10-1 AT-281/282/287. foo-verify journey for M4 T6: job rows change state the
// way the runner's db.tx writes them (test:jobState stands in for the runner until T2 lands; it writes the row and emits
// job:upsert / chat:upsert), and the list row, the details panel and the composer follow, light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m4-t6-shell.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { JobState } from '../../src/shared/types';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  const refs = await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  const jobState = (id: string, s: JobState) => page.evaluate(([j, st]) => window.__fooTest!.jobState(j, st), [id, s] as const);
  const tripsPreview = page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText('Trips', { exact: true }) })
    .getByTestId(TID.chatlistRowPreview);
  const job = 'Flights for 12 Dec';

  await openChat(page, 'Trips');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  await v.shot('trips-working');

  // AT-287: QUEUED keeps the "working" pill but must change the preview (the chat row's rev has to move)
  await jobState(refs.tripsJob!, 'queued');
  const queued = t('chatlist.row.preview.queued', { job });
  try {
    await tripsPreview.getByText(queued, { exact: true }).waitFor({ timeout: 3_000 });
  } catch {
    throw new Error(`Trips preview should read "${queued}", reads "${await tripsPreview.textContent()}"`);
  }
  v.note(`job QUEUED → Trips row preview reads "${queued}"`);
  const line = await page.getByTestId(TID.appPanelDoingRow).first().getAttribute('data-state');
  if (line !== 'queued') throw new Error(`Doing now row state ${line}, expected queued`);
  v.note('Doing now row followed job:upsert to data-state="queued" without a reload');
  await settle(page);
  await v.shot('trips-queued');

  // AT-282: two failures in foo's chat stack above the composer, newest on top
  await openChat(page, 'foo');
  await jobState(refs.cakeJob!, 'failed');
  await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
  await jobState(refs.goaJob!, 'failed');
  const notices = page.getByTestId(TID.composerError);
  await notices.nth(1).waitFor({ timeout: 3_000 });
  const ids = await notices.evaluateAll((els) => els.map((e) => e.getAttribute('data-row-id')));
  if (ids.join() !== [refs.goaJob, refs.cakeJob].join()) throw new Error(`notice order ${ids.join()}`);
  v.note('two job failures → two composer-error notices, the newest (Goa stay) on top, "Clear all" on the top one');
  await rest(page);
  await settle(page);
  await v.shot('foo-two-notices', byTid(TID.composer));
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('foo-two-notices', byTid(TID.composer));
  await v.shot('foo-two-notices-window');

  await notices.nth(0).getByTestId(TID.composerErrorsClear).click();
  await notices.first().waitFor({ state: 'detached' });
  v.note('Clear all removed both notices');
}
