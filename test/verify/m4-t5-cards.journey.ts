// Spec: 05-1 §5.2 Checklist, 05-3 §5.12 Plan, §5.15 Proof chip, §5.19 Stuck, §5.20 Error, §5.21 Spend cap, 06-3 §14 C-21,
// 08-1 §3.2 job:stop (X-124). foo-verify journey for M4 T5: the `m4-cards` seed (one of each M4 card in the Errands chat, no
// engine), light and dark; the proof chip's number popover; C-21 raises the AI cap through settings:set; Stop on the live
// checklist with no engine ends the job in main and the card turns "Stopped by you". Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m4-t5-cards.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { phraseCopyKey } from '../../src/shared/phrases';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, rest, setTheme, settle, windowSize } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await page.evaluate(async () => {
    const t = window.__fooTest!;
    await t.clock.set('2026-10-16T09:41:00+05:30');
    return t.seed('m4-cards');
  });
  await page.reload();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'Errands');

  const cards = [TID.cardPlan, TID.cardError, TID.cardStuck, TID.cardSpendCap, TID.cardChecklist];
  for (const id of cards) await page.getByTestId(id).first().waitFor();
  v.note(`Errands shows ${cards.join(', ')} and the proof chip from seeded rows, no engine`);

  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await page.getByTestId(TID.threadProofChip).scrollIntoViewIfNeeded();
    await rest(page);
    await settle(page);
    await v.shot(`errands-top-${theme}`);
    await page.getByTestId(TID.cardChecklist).scrollIntoViewIfNeeded();
    await rest(page);
    await settle(page);
    await v.shot(`errands-bottom-${theme}`);
  }
  await setTheme(page, 'light');

  // Proof chip: a booking number opens the popover with Copy and See in activity.
  await page.getByTestId(TID.threadProofChip).click();
  await page.getByTestId(TID.threadProofCopy).waitFor();
  v.note('proof chip "Proof: booking #TB40217" → popover with Copy and See in activity');
  await settle(page);
  await v.shot('proof-popover');
  await page.keyboard.press('Escape');

  // C-21: Raise cap → type 1500 → "Raise to ₹1,500" → the AI cap is saved.
  await page.getByTestId(TID.cardSpendCapRaise).click();
  const field = page.getByTestId(TID.dialogConfirmField);
  await field.fill('1050');
  await page.getByText(t('dialog.c_21.error_min', { min: '₹1,100' })).waitFor();
  v.note('C-21 with ₹1,050 shows "The new cap has to be at least ₹1,100."');
  await field.fill('1500');
  const primary = page.getByTestId(TID.dialogPrimary);
  const label = (await primary.textContent())?.trim();
  if (label !== t('dialog.c_21.primary', { amount: '₹1,500' })) throw new Error(`C-21 primary reads "${label}"`);
  await settle(page);
  await v.shot('c21-raise', byTid(TID.dialogC21));
  await primary.click();
  await page.getByTestId(TID.dialogC21).waitFor({ state: 'detached' });
  const cap = await page.evaluate(() => window.foo.invoke('settings:get', {}).then((r) => (r.ok ? r.value.money.aiCapPaise : null)));
  if (cap !== 150_000) throw new Error(`AI cap after C-21 is ${cap}`);
  v.note('Raise to ₹1,500 saved money.aiCapPaise = 150000 through settings:set');

  // Stop on the live checklist: no engine, so main ends the job itself; the card follows job:upsert.
  const checklist = page.getByTestId(TID.cardChecklist);
  await checklist.scrollIntoViewIfNeeded();
  await page.getByTestId(TID.cardChecklistStop).click();
  await checklist.getByText(t(phraseCopyKey('stopped', 'done')!), { exact: true }).waitFor({ timeout: 5_000 });
  v.note(
    `Stop with no engine → main cancels the job, the checklist follows job:upsert: ${(await checklist.innerText()).replace(/\s+/g, ' ')}`,
  );
  await rest(page);
  await settle(page);
  await v.shot('checklist-stopped', byTid(TID.cardChecklist));
}
