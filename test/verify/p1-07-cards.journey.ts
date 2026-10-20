// Spec: 10-acceptance-2 §C.8 AT-310 (step icons, source pile), AT-311 (the Approve card on `--shadow-28`, money weight, no
// sparks on a money card), AT-312 (DONE with proof: "{job title} · saved you about {n} min." from the fixed table), CR-0021
// picks 12–15. foo-verify journey for P1 T7: the real app on the fake AI and foo's real browser on the M9 sandbox restaurant
// (fictional places; never a real booking). A job with 3 sources runs to an Approval, the user approves, it ends DONE with
// proof; light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-07-cards.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { advanceUntil, lastCard, say } from '../e2e/m9-booking-world';
import { settleSeededJobs } from '../e2e/m4-start';
import { CARDS_ASK, CARDS_JOB_TITLE, CARDS_SAVED_MIN, cardsLines } from '../e2e/p1-cards-world';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';
import { startSandbox } from '../sites/server';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

const style = (el: Locator, prop: string) => el.evaluate((n, p) => getComputedStyle(n).getPropertyValue(p), prop);

async function both(v: Verify, page: Page, name: string, sel?: string): Promise<void> {
  await rest(page);
  await settle(page);
  await v.shot(name, sel);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot(name, sel);
  await setTheme(page, 'light');
}

export default async function journey(v: Verify): Promise<void> {
  const sb = await startSandbox();
  try {
    const { app, page } = await v.launch({
      fakeAi: cardsLines(sb),
      env: {
        FOO_TEST_ALLOW_HOSTS: sb.allowHosts,
        FOO_TEST_BROWSER_HOST_RULES: sb.resolverRules,
        FOO_TEST_BROWSER_SPKI: sb.cert.spkiSha256,
        FOO_TEST_TOOL_IDS: 'counting',
      },
    });
    await settleSeededJobs(page, await openWorld(app, page, '2026-10-16T11:01:00+05:30'));
    await windowSize(app, page, 1440, 900);
    await setTheme(page, 'light');
    await openChat(page, 'Home');

    // 1 · the ask → the plan → Go.
    await say(page, CARDS_ASK);
    const plan = lastCard(page, TID.cardPlan);
    await advanceUntil(page, plan);
    v.note(`Plan: ${(await plan.getByTestId(TID.cardPlanStep).allInnerTexts()).map((s) => s.replace(/\s+/g, ' ')).join(' / ')}`);
    await plan.getByTestId(TID.cardPlanGo).click();

    // 2 · the Approval card, with the live checklist above it: step icons and the 3-site pile.
    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    const checklist = lastCard(page, TID.cardChecklist);
    const icons = await checklist
      .getByTestId(TID.cardChecklistStep)
      .evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('[data-icon]')].map((i) => i.getAttribute('data-icon')).at(-1)));
    check(icons.join(',') === 'Search,Document,Clock,Wallet', `step icons ${icons.join(',')}`);
    const pile = checklist.getByTestId(TID.cardChecklistSources);
    const sites = await pile.locator('[data-site]').evaluateAll((n) => n.map((x) => x.getAttribute('data-site')));
    check(sites.join('|') === 'Coastline|Saffron Table|Bay Leaf', `pile ${sites.join('|')}`);
    check(!(await pile.innerText()).includes('+'), 'no "+n" with 3 sources');
    v.note(`Checklist step icons ${icons.join(', ')}; source pile ${sites.join(', ')} (3 tiles, no "+n")`);

    const shadow = await style(approval, 'box-shadow');
    check(shadow !== 'none', 'the waiting Approve card has a shadow');
    const money = approval.locator('[data-money]');
    const amounts = await money.allInnerTexts();
    check(amounts.length > 0 && amounts.every((a) => a.startsWith('₹')), `money spans ${amounts.join(', ')}`);
    for (const m of await money.all()) check((await style(m, 'font-weight')) === '700', 'money weight 700');
    const titleWeight = await style(approval.locator('[data-copy="external"]').first(), 'font-weight');
    check(Number(titleWeight) < 700, `title weight ${titleWeight}`);
    check((await approval.locator('[data-spark], [data-mood="celebrating"]').count()) === 0, 'no spark on the money card');
    v.note(`Approve card: box-shadow "${shadow}"; amounts ${amounts.join(', ')} at 700 tabular; title ${titleWeight}; no spark`);
    await checklist.scrollIntoViewIfNeeded();
    await both(v, page, 'checklist-live', byTid(TID.cardChecklist));
    await approval.scrollIntoViewIfNeeded();
    await both(v, page, 'approval', byTid(TID.cardApproval));

    // 3 · Approve → Booked with proof → the DONE card's end-card line.
    await approval.getByTestId(TID.cardApprovalApprove).click();
    const done = page.getByTestId(TID.threadLog).locator(`[data-testid="${TID.cardChecklist}"][data-card-state="done"]`).last();
    await advanceUntil(page, done);
    const line = (await done.getByTestId(TID.cardDoneSaved).innerText()).trim();
    const want = t('cards.done.saved', { title: CARDS_JOB_TITLE, n: CARDS_SAVED_MIN });
    check(line === want, `end-card line "${line}"`);
    check((await page.getByTestId(TID.threadLog).getByTestId(TID.threadProofChip).count()) > 0, 'proof chip shows');
    v.note(`DONE with proof: "${line}" (search 2 + read 3 + wait 0 + book 5 = 10, the pick 14 table)`);
    await done.getByTestId(TID.cardChecklistDetails).click();
    const finished = await done
      .getByTestId(TID.cardChecklistStep)
      .evaluateAll((rows) => rows.map((r) => `${r.getAttribute('data-state')}:${r.textContent ?? ''}`));
    v.note(`Finished steps: ${finished.join(' / ')}`);
    await done.scrollIntoViewIfNeeded();
    await both(v, page, 'done', byTid(TID.threadLog));
  } finally {
    await sb.close();
  }
}
