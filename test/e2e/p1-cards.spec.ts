// Spec: 10-acceptance-2 §C.8 AT-310 (checklist: named steps with their `StepKind` icon, the live step shimmers, ✓ overshoot,
// sources pile ≤ 5 with "+n" after 3), AT-311 (the Approve card springs in with `--shadow-28`, amounts in `--weight-money`
// tabular digits, the primary lip, no sparks or celebration on a money card), AT-312 (DONE with proof: the card line
// "{job title} · saved you about {n} min." from the fixed table, hidden under 5 min; DONE "⚠ Not checked live" shows none of
// it). CR-0021 picks 5, 12–15. The real app on the fake AI and foo's real browser on the M9 sandbox restaurant (fictional
// places, a made-up name; never a real booking).
import { expect, test, type Locator } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { SETUP_LINES, advanceUntil, bookedLine, lastCard, requestBooking, say, startBooking, stepLine, toolLine } from './m9-booking-world';

const ASK = 'book a table for 4 at an Italian place in Bandra on Sunday';
const TITLE = 'Table for 4 on Sunday';
// 08-4 §26.1: a slot is at most 40 characters.
const SITES = 'Coastline, Saffron Table and Bay Leaf';
// 08-2 §5.3: the runner names the job from its booking verb ("Booking {what}"); the intake title is the AI's proposal.
const JOB_TITLE = 'Booking a table for 4';

const intake = {
  match: { purpose: 'intake' as const, promptIncludes: ASK },
  reply: `<say></say><act>${JSON.stringify({
    decision: {
      kind: 'job',
      title: TITLE,
      plan: [
        { phraseKey: 'look_web', slots: {}, route: 'browser' },
        { phraseKey: 'check_sites', slots: { sites: SITES }, route: 'browser' },
        { phraseKey: 'book', slots: { what: 'a table for 4' }, route: 'browser' },
      ],
      estimate: { minutes: 3 },
      routeHint: ['browser'],
      needsApps: [],
    },
    usedMemoryIds: [],
  })}</act>`,
};

const css = (el: Locator, prop: string) => el.evaluate((n, p) => getComputedStyle(n).getPropertyValue(p), prop);

test('AT-310 AT-311 AT-312 a booking job: step icons, the source pile, the Approve card on a money weight, the end-card line', async () => {
  test.setTimeout(240_000);
  const w = await startBooking((sb) => [
    ...SETUP_LINES,
    intake,
    toolLine('browser.open', { url: sb.url('restaurant', '/') }),
    toolLine('browser.snapshot', {}),
    // 08-2 §5.4: the AI ticks its steps off (look on the web, check the three places); `step_done` is not a tool call.
    stepLine({ kind: 'step_done', idx: 0 }),
    stepLine({ kind: 'step_done', idx: 1 }),
    toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
    toolLine('browser.snapshot', {}),
    requestBooking(4),
    stepLine({ kind: 'step_done', idx: 2 }),
    bookedLine(5),
  ]);
  const { page } = w;
  try {
    await say(page, ASK);
    // Four steps (the runner adds "Show you before booking"), so foo shows its plan first (05-3 §5.12).
    const plan = lastCard(page, TID.cardPlan);
    await advanceUntil(page, plan);
    await plan.getByTestId(TID.cardPlanGo).click();
    const checklist = lastCard(page, TID.cardChecklist);
    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    // AT-310 while live: the step waiting on the user already carries its kind's icon.
    await expect(checklist.getByTestId(TID.cardChecklistStep).first().locator('[data-icon="Search"]')).toHaveCount(1);

    // AT-311: the waiting Approve card sits on --shadow-28 and lands on --ease-spring; amounts in the money weight only.
    const shadow = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--shadow-28').trim());
    expect(await css(approval, 'box-shadow')).not.toBe('none');
    expect(shadow.length).toBeGreaterThan(0);
    const money = approval.locator('[data-money]');
    expect(await money.count()).toBeGreaterThan(0);
    for (const m of await money.all()) {
      await expect(m).toHaveText(/^₹/);
      expect(await css(m, 'font-weight')).toBe('700');
      expect(await css(m, 'font-variant-numeric')).toBe('tabular-nums');
    }
    const title = approval.locator('[data-copy="external"]').first();
    expect(Number(await css(title, 'font-weight'))).toBeLessThan(700);
    // Nothing playful on a money card: no spark, no celebrating face inside it.
    await expect(approval.locator('[data-spark], [data-mood="celebrating"]')).toHaveCount(0);

    await approval.getByTestId(TID.cardApprovalApprove).click();
    const proof = page.getByTestId(TID.threadLog).getByTestId(TID.threadProofChip);
    await advanceUntil(page, proof);

    // AT-312: DONE with proof → the end-card line from the job title and the fixed table: search 2 + read 3 + wait 0 + book 5 = 10.
    const done = page.getByTestId(TID.threadLog).locator(`[data-testid="${TID.cardChecklist}"][data-card-state="done"]`).last();
    await advanceUntil(page, done);
    const saved = done.getByTestId(TID.cardDoneSaved);
    await expect(saved).toHaveText(t('cards.done.saved', { title: JOB_TITLE, n: 10 }));

    // AT-310 on the finished list (Details): the runner marks the steps done as the job finishes.
    await done.getByTestId(TID.cardChecklistDetails).click();
    // AT-310: every step row carries its kind's icon (look_web → Search, check_sites → Document, show_before → Clock, book → Wallet).
    const steps = done.getByTestId(TID.cardChecklistStep);
    const icons = await steps.evaluateAll((rows) =>
      rows.map((r) => [...r.querySelectorAll('[data-icon]')].map((i) => i.getAttribute('data-icon')).at(-1)),
    );
    expect(icons).toEqual(['Search', 'Document', 'Clock', 'Wallet']);
    // The read step's sites: three letter tiles, no "+n" (≤ 5 shows all).
    const pile = done.getByTestId(TID.cardChecklistSources);
    await expect(pile).toHaveCount(1);
    await expect(pile).toHaveAttribute('data-count', '3');
    await expect(pile.locator('[data-site]')).toHaveCount(3);
    await expect(pile).not.toContainText('+');
    // The ✓ lands on the spring (AT-310 overshoot) at Full; test PCs start at Basic (X-150), so Full is set here.
    await page.evaluate(() => (document.documentElement.dataset.motion = 'full'));
    const tick = done.locator('[data-state="done"] [data-icon="CheckmarkCircle"]').first();
    expect(await tick.evaluate((n) => getComputedStyle(n).animationTimingFunction)).toContain('linear(');
    // The finished card tilts 1° on hover (rotate(1deg) = matrix(cos 1°, sin 1°, …)).
    await done.hover();
    await expect.poll(() => css(done, 'transform')).toMatch(/^matrix\(0\.9998\d*, 0\.0174/);
  } finally {
    await w.close();
  }
});

test('AT-312 DONE "⚠ Not checked live" shows no end-card line and no tilt', async () => {
  test.setTimeout(240_000);
  const w = await startBooking((sb) => [
    ...SETUP_LINES,
    intake,
    toolLine('browser.open', { url: sb.url('restaurant', '/') }),
    toolLine('browser.snapshot', {}),
    stepLine({ kind: 'step_done', idx: 0 }),
    stepLine({ kind: 'step_done', idx: 1 }),
    toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
    toolLine('browser.snapshot', {}),
    requestBooking(4),
    stepLine({ kind: 'step_done', idx: 2 }),
    // A code the site never showed: the proof check fails, so the job ends DONE "⚠ Not checked live" (08-2 §6).
    stepLine({
      kind: 'done',
      result: 'Booked. Coastline Kitchen, Sun 18 Oct at 8:00 PM for 4. Your code is ZZ0000.',
      proof: { kind: 'confirmation', code: 'ZZ0000', site: 'tablejoy.test', seenInToolCallId: 'tc_000005' },
    }),
  ]);
  const { page } = w;
  try {
    await say(page, ASK);
    const plan = lastCard(page, TID.cardPlan);
    await advanceUntil(page, plan);
    await plan.getByTestId(TID.cardPlanGo).click();
    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    await approval.getByTestId(TID.cardApprovalApprove).click();
    const unverified = page
      .getByTestId(TID.threadLog)
      .locator(`[data-testid="${TID.cardChecklist}"][data-card-state="done_unverified"]`)
      .last();
    await advanceUntil(page, unverified);
    await expect(unverified.getByTestId(TID.cardDoneSaved)).toHaveCount(0);
    await page.evaluate(() => (document.documentElement.dataset.motion = 'full'));
    await unverified.hover();
    expect(await css(unverified, 'transform')).toBe('none');
  } finally {
    await w.close();
  }
});
