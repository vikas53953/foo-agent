// AT-282 (X-149; 04-2 §23.2a; CR-0008 G-M4-12): chat-specific failures stack above the composer, newest on top, each with
// ErrorCircle, the in-chat sentence, "Copy code" ({ErrorKind}-{6-char id}, "Copied" for 2 s) and Dismiss; "Clear all" on
// the top notice; 3 shown then "+{n} more"; Dismiss and Clear all change nothing but the notices; gone after 24 h away.
// Seed: foo's chat has 4 jobs (Mom's cake, Goa stay, Groceries, Train to Pune), so "+{n} more" is seen with 4 notices.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { advance, jobState, openPanelChat, reloadAt, startWorld } from './m4-start';

const H = 3_600_000;
const chatOpen = (page: Page, chatId: string) =>
  page
    .evaluate((id) => window.foo.invoke('chat:open', { chatId: id }), chatId)
    .then((r) => {
      if (!r.ok) throw new Error(r.error.kind);
      return r.value;
    });
const code = (rowId: string) =>
  `UNKNOWN-${rowId
    .replace(/[^a-z0-9]/gi, '')
    .slice(-6)
    .toUpperCase()}`;

test('AT-282: failures stack newest first; Copy code; +{n} more; Dismiss / Clear all touch nothing else; gone after 24 h', async () => {
  const { app, page, refs } = await startWorld();
  await openPanelChat(page, 'foo');
  const notices = page.getByTestId(TID.composerError);

  await jobState(page, refs.cakeJob!, 'failed');
  await advance(page, 1_000);
  await jobState(page, refs.goaJob!, 'failed');
  await expect(notices).toHaveCount(2);
  await expect(notices.nth(0)).toHaveAttribute('data-row-id', refs.goaJob!); // newest on top
  await expect(notices.nth(1)).toHaveAttribute('data-row-id', refs.cakeJob!);
  for (const n of [notices.nth(0), notices.nth(1)]) {
    await expect(n).toContainText(t('errors.unknown.what_happened')); // no error card yet: the generic sentence
    await expect(n.getByTestId(TID.composerErrorCopy)).toHaveText(t('composer.error.copy'));
    await expect(n.getByTestId(TID.composerErrorDismiss)).toHaveAttribute('aria-label', t('composer.error.dismiss'));
  }
  await expect(notices.nth(0).getByTestId(TID.composerErrorsClear)).toHaveText(t('composer.errors.clear'));
  await expect(notices.nth(1).getByTestId(TID.composerErrorsClear)).toHaveCount(0);

  // Copy code → clipboard {ErrorKind}-{6-char id}; the link reads "Copied" for 2 s
  const copy = notices.nth(0).getByTestId(TID.composerErrorCopy);
  await copy.click();
  await expect(copy).toHaveText(t('composer.error.copied'));
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(code(refs.goaJob!));
  await expect(copy).toHaveText(t('composer.error.copy'), { timeout: 3_000 });

  // 4 failures: 3 shown + "+1 more", which expands in place
  const others = (await chatOpen(page, refs.foo!)).jobs.map((j) => j.id).filter((id) => id !== refs.cakeJob && id !== refs.goaJob);
  expect(others).toHaveLength(2);
  for (const id of others) {
    await advance(page, 1_000);
    await jobState(page, id, 'failed');
  }
  await expect(notices).toHaveCount(3);
  await page.getByRole('button', { name: t('composer.errors.more', { n: 1 }) }).click();
  await expect(notices).toHaveCount(4);

  // Dismiss: only that notice goes; messages, cards and jobs are byte-identical
  const before = JSON.stringify(await chatOpen(page, refs.foo!));
  await notices.nth(3).getByTestId(TID.composerErrorDismiss).click();
  await expect(notices).toHaveCount(3);
  expect(JSON.stringify(await chatOpen(page, refs.foo!))).toBe(before);

  // Clear all: every notice goes, rows unchanged
  await notices.nth(0).getByTestId(TID.composerErrorsClear).click();
  await expect(notices).toHaveCount(0);
  expect(JSON.stringify(await chatOpen(page, refs.foo!))).toBe(before);

  // another chat's failure shows there; after 24 h (a fresh window) it is gone
  await openPanelChat(page, 'Trips');
  await page.getByTestId(TID.composer).waitFor();
  const already = await notices.count(); // failures the seed already holds from the last 24 h
  await advance(page, 1_000);
  await jobState(page, refs.tripsJob!, 'failed');
  await expect(notices).toHaveCount(already + 1);
  await expect(notices.first()).toHaveAttribute('data-row-id', refs.tripsJob!);
  await advance(page, 24 * H + 1_000);
  await reloadAt(page);
  await openPanelChat(page, 'Trips');
  await expect(page.getByTestId(TID.composer)).toBeVisible();
  await expect(notices).toHaveCount(0);
  await app.close();
});
