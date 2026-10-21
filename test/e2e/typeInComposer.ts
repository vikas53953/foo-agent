// Spec: 04 §10 (the composer) and 08-3 §22.3 (E2E runs). Types into foo's composer the way a person does: a key typed while
// the field re-renders could be lost on a slow Windows runner ("dentit" on PR #85, UX-12-01's ask never showing), so every
// E2E types at a human pace here and retypes once from empty if the field still differs. CR-0024 close-out (foo-correct).
import { expect, type Page } from '@playwright/test';
import { TID } from '../../src/shared/testids';

/** Focuses the composer and types `text` into it; the field holds exactly that text when this returns. Does not send. */
export async function typeInComposer(page: Page, text: string): Promise<void> {
  const field = page.getByTestId(TID.composerField);
  await field.focus();
  await page.keyboard.type(text, { delay: 15 });
  if (!((await field.textContent()) ?? '').includes(text)) {
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(text, { delay: 30 });
  }
  await expect(field).toContainText(text);
}
