// Spec: 04 §13.5 (kit pieces drawn by foo: Stepper, Slider binding, Calculator, Compare, GoalRing, TimedChecklist,
// ShortForm; a secret-looking value is refused and the Secret box offered, Article 8), 02-2 §F19.9 (goal ring), CR-0022
// AT-342, AT-343, AT-346, AT-347, AT-348, AT-351, AT-370, X-180. foo-verify journey for R1 T4, real app on the seeded
// world with the fake AI: (1) a bill splitter (people 4, tip slider) recomputes as + and the slider move; (2) an EMI
// calculator recomputes when the loan changes; (3) Compare, GoalRing and a timed checklist; (4) a form that would ask for a
// password does not draw that field, refuses a password typed elsewhere, offers the Secret box, then sends its values.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t4-numbers-forms.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { intake, type FakeTurn } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const create = (s: string) => `{"version":"v0.9.1","createSurface":{"surfaceId":"${s}","catalogId":"foo.kit.v1"}}`;
const comps = (s: string, components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: s, components } });
const data = (s: string, path: string, value: unknown) => JSON.stringify({ updateDataModel: { surfaceId: s, path, value } });
const a2ui = (...lines: string[]) => `\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;

const SPLIT = `Here is the bill split.\n\n${a2ui(
  create('split'),
  comps('split', [
    { id: 'root', component: 'Column', children: ['people', 'tip', 'calc'] },
    { id: 'people', component: 'Stepper', label: 'People', value: { path: '/people' }, min: 1, max: 8 },
    { id: 'tip', component: 'Slider', label: 'Tip %', value: { path: '/tip' }, min: 0, max: 20, step: 5 },
    {
      id: 'calc',
      component: 'Calculator',
      inputs: [
        { name: 'bill', label: 'Bill', value: 2400 },
        { name: 'people', label: 'People', value: 4 },
        { name: 'tip', label: 'Tip %', value: 10 },
      ],
      outputs: [
        { label: 'Each pays', formula: 'round(bill × (1 + tip ÷ 100) ÷ people, 2)', unit: 'rupees' },
        { label: 'Tip in all', formula: 'bill × tip ÷ 100', unit: 'rupees' },
      ],
    },
  ]),
  data('split', '/people', 4),
  data('split', '/tip', 10),
)}`;

const EMI = `Here is the EMI.\n\n${a2ui(
  create('emi'),
  comps('emi', [
    {
      id: 'root',
      component: 'Calculator',
      inputs: [
        { name: 'loan', label: 'Loan', value: 500000 },
        { name: 'rate', label: 'Interest % a year', value: 9 },
        { name: 'months', label: 'Months', value: 60 },
      ],
      outputs: [
        { label: 'EMI', formula: 'round(pmt(rate / 1200, months, loan), 2)', unit: 'rupees' },
        { label: 'Total interest', formula: 'round(pmt(rate / 1200, months, loan) × months − loan)', unit: 'rupees' },
      ],
    },
  ]),
)}`;

const col = (title: string, price: string, leaves: string) => ({
  title,
  rows: [
    { label: 'Price', value: price },
    { label: 'Leaves', value: leaves },
  ],
});
const TRIP = `Your Goa trip so far.\n\n${a2ui(
  create('trip'),
  comps('trip', [
    { id: 'root', component: 'Column', children: ['cmp', 'ring', 'list'] },
    {
      id: 'cmp',
      component: 'Compare',
      columns: [col('IndiGo 6E 201', '₹4,200', '6:10 AM'), col('Akasa QP 1101', '₹3,900', '9:40 AM')],
      highlight: 1,
      why: 'Cheapest, and not too early',
    },
    { id: 'ring', component: 'GoalRing', value: { path: '/saved' }, target: 20000, label: 'Goa trip fund' },
    {
      id: 'list',
      component: 'TimedChecklist',
      steps: [{ title: 'Book the flight' }, { title: 'Pack sunscreen' }, { title: 'Leave for the airport', seconds: 900 }],
    },
  ]),
  data('trip', '/saved', 15000),
)}`;

const FORM = `Tell me about the visit.\n\n${a2ui(
  create('visit'),
  comps('visit', [
    {
      id: 'root',
      component: 'ShortForm',
      fields: [
        { name: 'who', label: 'Name', type: 'text' },
        { name: 'guests', label: 'Guests', type: 'number' },
        { name: 'day', label: 'Day', type: 'choice', options: ['Saturday', 'Sunday'] },
        { name: 'pw', label: 'Password', type: 'text' },
      ],
      action: { event: { name: 'plan_visit', context: { place: 'Lalbagh' } } },
    },
  ]),
)}`;

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(400);
  }
  await loc.first().waitFor();
}

async function send(page: Page, text: string) {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.getByTestId(TID.bubbleMe).filter({ hasText: text }).waitFor();
}

async function expectText(loc: Locator, want: string, what: string) {
  for (let i = 0; i < 20; i++) {
    if ((await loc.textContent())?.trim() === want) return;
    await loc.page().waitForTimeout(150);
  }
  throw new Error(`${what}: expected "${want}", got "${await loc.textContent()}"`);
}

const fooBubble = (page: Page, words: string) => page.getByTestId(TID.bubbleFoo).filter({ hasText: words });

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      intake('split the bill', SPLIT),
      intake('emi for my loan', EMI),
      intake('goa trip so far', TRIP),
      intake('plan a visit', FORM),
      intake('action plan_visit', 'Saturday at Lalbagh it is.'),
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await settle(page);
  await v.shot('before');

  // 1. Bill splitter: + on People and the tip slider recompute "Each pays".
  await send(page, 'split the bill');
  const split = fooBubble(page, 'Here is the bill split.');
  await showUp(page, split.getByTestId(TID.kitCalculator));
  const each = split.getByTestId(TID.kitCalculator).locator('[data-output="0"] dd');
  await expectText(each, '₹660', 'bill split for 4 at 10%');
  await split.getByRole('button', { name: t('kit.stepper.increase', { label: 'People' }) }).click();
  await expectText(each, '₹528', 'bill split for 5 at 10%');
  await split.getByRole('slider', { name: 'Tip %' }).focus();
  await page.keyboard.press('ArrowRight');
  await expectText(each, '₹552', 'bill split for 5 at 15%');
  v.note(
    'bill splitter: 4 people at 10% ₹660 each; + makes 5 → ₹528; tip slider to 15% → ₹552; Stepper, Slider and Calculator share the path',
  );
  await settle(page);
  await v.shot('bill-split', `[data-testid="${TID.threadLog}"]`);

  // 2. EMI calculator.
  await send(page, 'emi for my loan');
  const emi = fooBubble(page, 'Here is the EMI.').getByTestId(TID.kitCalculator);
  await showUp(page, emi);
  const emiOut = emi.locator('[data-output="0"] dd');
  await expectText(emiOut, '₹10,379.18', 'EMI on ₹5 lakh at 9% for 60 months');
  await emi.locator('input[data-input="loan"]').fill('800000');
  await expectText(emiOut, '₹16,606.68', 'EMI on ₹8 lakh at 9% for 60 months');
  v.note('EMI: ₹5,00,000 at 9% for 60 months → ₹10,379.18; loan changed to ₹8,00,000 → ₹16,606.68 (shared/kit/evaluate.ts pmt)');
  await settle(page);
  await v.shot('emi', `[data-testid="${TID.threadLog}"]`);

  // 3. Compare, GoalRing and a timed checklist.
  await send(page, 'goa trip so far');
  const trip = fooBubble(page, 'Your Goa trip so far.');
  await showUp(page, trip.getByTestId(TID.kitGoalRing));
  const best = await trip.getByTestId(TID.kitCompare).locator('[data-best="true"]').getAttribute('aria-label');
  const meter = trip.getByRole('meter', { name: 'Goa trip fund' });
  v.note(
    `compare: best column "${best}"; goal ring ${await meter.getAttribute('aria-valuetext')}, share ${await trip.getByTestId(TID.kitGoalRing).getAttribute('data-share')}`,
  );
  await trip.getByRole('checkbox', { name: 'Book the flight' }).check();
  await trip
    .locator('[data-step="2"]')
    .getByRole('button', { name: t('kit.checklist.start') })
    .click();
  await page.waitForTimeout(1_200);
  v.note(
    `checklist: "Book the flight" ticked; airport timer running, ${await trip.locator('[data-step="2"] [data-left-ms]').textContent()}`,
  );
  await trip
    .locator('[data-step="2"]')
    .getByRole('button', { name: t('kit.checklist.pause') })
    .click();
  await settle(page);
  await v.shot('trip', `[data-testid="${TID.threadLog}"]`);

  // 4. ShortForm: the Password field is not drawn; a password typed in Name is refused and offered to the Secret box.
  await send(page, 'plan a visit');
  const formBubble = fooBubble(page, 'Tell me about the visit.');
  const form = formBubble.getByTestId(TID.kitShortForm);
  await showUp(page, form);
  if ((await form.locator('input[name="pw"]').count()) !== 0) throw new Error('the Password field was drawn');
  await form.getByLabel('Name').fill('Asha password: Tiger#2026');
  await form.getByRole('button', { name: t('kit.form.submit', { agentName: 'foo' }) }).click();
  await formBubble.getByRole('alert').waitFor();
  await settle(page);
  await v.shot('form-refused', `[data-testid="${TID.threadLog}"]`);
  await formBubble.getByRole('button', { name: t('composer.paste.move') }).click();
  await page
    .getByTestId(TID.cardSecret)
    .last()
    .filter({ hasText: t('composer.paste.name.password') })
    .waitFor();
  v.note(
    `form: Password field not drawn; "password: …" in Name refused, Secret box "${t('composer.paste.name.password')}" posted, Name now "${await form.getByLabel('Name').inputValue()}"`,
  );
  await form.getByLabel('Guests').fill('4');
  await form.getByLabel('Day').selectOption('Saturday');
  await form.getByRole('button', { name: t('kit.form.submit', { agentName: 'foo' }) }).click();
  await showUp(page, fooBubble(page, 'Saturday at Lalbagh it is.'));
  const turn = (v.fakeTurns() as FakeTurn[]).find((x) => x.purpose === 'intake' && x.prompt.includes('action plan_visit'));
  if (!turn?.prompt.includes('"guests":4') || turn.prompt.includes('Tiger#2026'))
    throw new Error('the form did not send its values cleanly');
  v.note(
    'form: one kit.action plan_visit with {"place":"Lalbagh","who":"Asha","guests":4,"day":"Saturday"}; the password never reached the AI',
  );
  await settle(page);
  await v.shot('form-sent', `[data-testid="${TID.threadLog}"]`);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('form-sent-dark', `[data-testid="${TID.threadLog}"]`);
}
