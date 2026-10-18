// AT-281 (X-148; 03-shell-2 §3.7.3.1): the details panel's Doing now tabs In progress / Scheduled / Done read the live job
// rows (job:upsert) the runner writes; Done is the last 7 days, newest first; each empty tab shows its line.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { jobState, openPanelChat, startWorld } from './m4-start';

test('AT-281: Doing now tabs follow job:upsert live; Done keeps 7 days; empty lines', async () => {
  const { app, page, refs } = await startWorld();
  await openPanelChat(page, 'Trips');
  const doing = page.getByTestId(TID.appPanelDoing);
  const tabs = page.getByTestId(TID.appPanelJobsTab);
  const tab = (key: 'progress' | 'scheduled' | 'done') => tabs.getByRole('radio', { name: t(`app.panel.doing.tab.${key}`) });
  const rows = doing.getByTestId(TID.appPanelDoingRow);

  // In progress (selected): the working Flights job
  await expect(tabs).toHaveAttribute('data-state', 'progress');
  await expect(tab('progress')).toHaveAttribute('aria-checked', 'true');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-row-id', refs.tripsJob!);
  await expect(rows.first()).toHaveAttribute('data-state', 'working');
  await tab('scheduled').click();
  await expect(doing).toContainText(t('app.panel.doing.empty_scheduled'));
  await tab('done').click();
  await expect(rows).toHaveCount(1); // Window seats, done yesterday
  const seats = await rows.first().getAttribute('data-row-id');

  // the runner finishes the job: Done shows it on top, with no reload
  await jobState(page, refs.tripsJob!, 'done');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-row-id', refs.tripsJob!);
  await expect(rows.nth(1)).toHaveAttribute('data-row-id', seats!);
  await tab('progress').click();
  await expect(rows.first()).toHaveAttribute('data-state', 'done'); // finished today still shows (≤ 2 finished)
  await jobState(page, refs.tripsJob!, 'cancelled');
  await expect(doing).toContainText(t('app.panel.doing.empty'));

  // foo's chat: Scheduled lists its routine; Done is newest first and leaves out the job that ended 10 days ago
  await openPanelChat(page, 'foo');
  await tab('scheduled').click();
  await expect(doing).toContainText('Morning brief · next');
  await tab('done').click();
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-row-id')));
  expect(ids[0]).toBe(refs.tripsJob); // just ended
  expect(ids).not.toContain(null);
  await expect(doing).not.toContainText('Train to Pune');
  await app.close();
});
