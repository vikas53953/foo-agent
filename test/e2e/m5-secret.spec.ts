// M5 T2 · the Secret box (05-2 §5.8) reached the way a user gets there: a key typed in the composer, the paste catcher
// (04-2 §22.4), "Move to secret box". AT-009 (G-M5-10: M5 proves the Secret box half; the Settings row half is M12): after a
// save, Replace gives an empty field and the old value is never shown. The eye (§5.8.1, §5.8.6: Alt+F8, Narrator length).
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openChat } from '../fidelity/capture';
import { settleSeededJobs, startWorld } from './m4-start';

const KEY = 'sk-proj-FAKE0t2e2e0replace00000000000000';
const NEXT = 'sk-proj-FAKE0t2e2e0second000000000000000';

async function moveKey(page: Page, key: string) {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(key);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.composerPasteMove).click();
  const card = page.locator(byTid(TID.cardSecret)).last();
  await expect(card.getByTestId(TID.cardSecretField)).toHaveValue(key);
  return card;
}

test('AT-009 (Secret box half): Replace returns an empty field; the old key is never shown', async () => {
  const { app, page, refs } = await startWorld();
  await settleSeededJobs(page, refs);
  await openChat(page, 'foo');
  const card = await moveKey(page, KEY);
  await expect(card).toHaveAttribute('data-card-state', 'asking');
  await card.getByTestId(TID.cardSecretSave).click();
  await expect(card).toHaveAttribute('data-card-state', 'saved');
  await expect(card.getByTestId(TID.cardSecretSaved)).toContainText('OpenAI key · saved Fri 16 Oct');
  expect(await page.content()).not.toContain(KEY);

  await card.getByTestId(TID.cardSecretReplace).click();
  const field = card.getByTestId(TID.cardSecretField);
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(card.getByTestId(TID.cardSecretSave)).toBeDisabled();
  expect(await page.content()).not.toContain(KEY);
  await field.fill(NEXT);
  await card.getByTestId(TID.cardSecretSave).click();
  await expect(card.getByTestId(TID.cardSecretSaved)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(KEY);
  expect(html).not.toContain(NEXT);
  await app.close();
});

test('Secret box eye: shows on click and Alt+F8, Narrator reads the length while hidden', async () => {
  const { app, page, refs } = await startWorld();
  await settleSeededJobs(page, refs);
  await openChat(page, 'foo');
  const card = await moveKey(page, KEY);
  const field = card.getByTestId(TID.cardSecretField);
  const eye = card.getByTestId(TID.cardSecretEye);
  await expect(field).toHaveAttribute('aria-label', t('cards.secret.field_label.hidden', { title: 'OpenAI key' }));
  const described = await field.getAttribute('aria-describedby');
  await expect(page.locator(`[id="${described}"]`)).toHaveText(t('cards.secret.field_label.length', { n: KEY.length }));
  await eye.click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(eye).toHaveAccessibleName(t('cards.secret.eye.hide'));
  await field.focus();
  await page.keyboard.press('Alt+F8');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(eye).toHaveAccessibleName(t('cards.secret.eye.show'));
  await card.getByTestId(TID.cardSecretCancel).click();
  await expect(card).toContainText(t('cards.secret.summary.cancelled'));
  await app.close();
});

test('Move to secret box: a password gets its own box, and Save refuses it plainly while it has no vault name (G-M5-21)', async () => {
  const { app, page, refs } = await startWorld();
  await settleSeededJobs(page, refs);
  await openChat(page, 'foo');
  const typed = 'password: FAKEt2pass99';
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(typed);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.composerPasteMove).click();
  const card = page.locator(byTid(TID.cardSecret)).last();
  await expect(card).toContainText(t('composer.paste.name.password'));
  const field = card.getByTestId(TID.cardSecretField);
  await expect(field).toHaveValue('FAKEt2pass99');
  // The value is never in the page's markup (a property, not a `value` attribute).
  expect(await page.content()).not.toContain('FAKEt2pass99');
  await card.getByTestId(TID.cardSecretSave).click();
  await expect(card).toContainText(t('cards.secret.line.no_kind'));
  await expect(card.getByTestId(TID.cardSecretSave)).toBeDisabled();
  await expect(card).toHaveAttribute('data-card-state', 'asking');
  expect(await page.content()).not.toContain('FAKEt2pass99');
  await app.close();
});

test('05-2 §5.8.6 Groups: never; the paste catcher in a group has no Move to secret box', async () => {
  const { app, page, refs } = await startWorld();
  await settleSeededJobs(page, refs);
  await openChat(page, 'Family group');
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(KEY);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await expect(page.getByTestId(TID.composerPasteMove)).toHaveCount(0);
  await expect(page.getByTestId(TID.composerPasteSend)).toBeVisible();
  await app.close();
});
