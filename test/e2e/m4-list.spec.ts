// AT-287 (X-154; 03-shell-1 §3.4.6 rule 3a): the row preview reads "Working on {job}…" while the job is WORKING and
// "Waiting to start {job}…" while QUEUED, and returns to the normal preview when the job ends. AT-286 (X-153; §3.4.7) on
// the same runner-written row: folded 24 h after its last job ended DONE (25 h folded, 23 h not); a new job unfolds it.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat } from '../fidelity/capture';
import { advance, jobState, listRow, reloadAt, startWorld } from './m4-start';

const H = 3_600_000;

test('AT-287: Working on / Waiting to start previews follow the job row', async () => {
  const { app, page, refs } = await startWorld();
  const preview = listRow(page, 'Trips').getByTestId(TID.chatlistRowPreview);
  const job = 'Flights for 12 Dec';
  await expect(preview).toHaveText(t('chatlist.row.preview.working', { job }));
  await jobState(page, refs.tripsJob!, 'queued');
  await expect(preview).toHaveText(t('chatlist.row.preview.queued', { job }));
  await jobState(page, refs.tripsJob!, 'working');
  await expect(preview).toHaveText(t('chatlist.row.preview.working', { job }));
  await jobState(page, refs.tripsJob!, 'done');
  await expect(preview).not.toHaveText(/Working on|Waiting to start/);
  await app.close();
});

test('AT-286: the row folds 24 h after its last job ended DONE, not at 23 h; a new job state unfolds it', async () => {
  const { app, page, refs } = await startWorld();
  await openChat(page, 'Trips'); // read: an unread count keeps a row unfolded
  await openChat(page, 'foo');
  await jobState(page, refs.tripsJob!, 'done');
  const trips = () => listRow(page, 'Trips');
  await expect(trips()).not.toHaveAttribute('data-folded', 'true');

  await advance(page, 23 * H);
  await reloadAt(page);
  await expect(trips()).not.toHaveAttribute('data-folded', 'true');

  await advance(page, 2 * H);
  await reloadAt(page);
  await expect(trips()).toHaveAttribute('data-folded', 'true');
  await expect(trips().getByTestId(TID.chatlistRowPreview)).toHaveAttribute('data-state', 'folded');

  await jobState(page, refs.tripsJob!, 'working');
  await expect(trips()).not.toHaveAttribute('data-folded', 'true');
  await app.close();
});
