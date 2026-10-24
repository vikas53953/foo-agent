// Spec: 10-acceptance-2 §C.9 AT-342 (Stepper and Slider binding: + / − and arrow keys change the value within min/max;
// every component bound to the same path updates at once), AT-343 (Compare: 2–3 columns; the highlighted column is
// outlined with its one-line why), AT-346 (TimedChecklist: a timer runs in the renderer; ticks are kept in the surface's
// data model), AT-347 (Calculator: outputs recompute from the inputs; a bad formula shows "Can't work this out"), AT-348
// (GoalRing: arc proportional to value / target, "{value} of {target}" in the middle, role="meter"), AT-351 (ShortForm: up
// to 6 fields; submit sends one action with the values; a secret-looking value is refused and the Secret box offered,
// AT-370); 04 §13.5, 02-2 §F19.9, Article 8, CR-0022, X-180. R1 T4: the real app on the fake AI.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import { settleSeededJobs } from './m4-start';
import { say } from './m9-booking-world';
import { openChat, openWorld } from '../fidelity/capture';

const HOLD_MS = 1500;
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = (components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: 's1', components } });
const data = (path: string, value: unknown) => JSON.stringify({ updateDataModel: { surfaceId: 's1', path, value } });
const a2ui = (...lines: string[]) => `\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(300);
  }
  await expect(loc.first()).toBeVisible();
}

async function start(lines: FakeLine[]) {
  const { app, dirs } = await launchWithFakeAi([VERIFY_OK, ...lines]);
  const page = await app.firstWindow();
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  return { app, page, dirs };
}

const fooBubble = (page: Page, words: string) => page.getByTestId(TID.bubbleFoo).filter({ hasText: words });

/** The bill splitter: people (Stepper) and tip (Slider) bound to the Calculator's inputs; one output is broken. */
const splitter = `Here is the bill split.\n\n${a2ui(
  create,
  comps([
    { id: 'root', component: 'Column', children: ['people', 'tip', 'calc'] },
    { id: 'people', component: 'Stepper', label: 'People', value: { path: '/people' }, min: 1, max: 6 },
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
        { label: 'Odd one', formula: 'bill +' },
      ],
    },
  ]),
  data('/people', 4),
  data('/tip', 10),
)}`;

test('AT-342 · Stepper and Slider binding: + / − and arrow keys stay within min/max and every part on the path updates', async () => {
  const { app, page } = await start([intake('split the bill', splitter)]);
  try {
    await say(page, 'split the bill');
    const bubble = fooBubble(page, 'Here is the bill split.');
    const stepper = bubble.getByTestId(TID.kitStepper);
    await showUp(page, stepper);
    const spin = stepper.getByRole('spinbutton', { name: 'People' });
    const calcPeople = bubble.getByTestId(TID.kitCalculator).locator('input[data-input="people"]');
    await expect(spin).toHaveAttribute('aria-valuenow', '4');
    await stepper.getByRole('button', { name: t('kit.stepper.increase', { label: 'People' }) }).click();
    await expect(spin).toHaveAttribute('aria-valuenow', '5');
    await expect(calcPeople).toHaveValue('5');
    await spin.focus();
    await page.keyboard.press('ArrowDown');
    await expect(spin).toHaveAttribute('aria-valuenow', '4');
    await page.keyboard.press('ArrowDown');
    await expect(spin).toHaveAttribute('aria-valuenow', '3');
    await expect(calcPeople).toHaveValue('3');
    // End jumps to max; + stops there.
    await page.keyboard.press('End');
    await expect(spin).toHaveAttribute('aria-valuenow', '6');
    await expect(stepper.getByRole('button', { name: t('kit.stepper.increase', { label: 'People' }) })).toBeDisabled();
    await page.keyboard.press('Home');
    await expect(spin).toHaveAttribute('aria-valuenow', '1');
    await expect(stepper.getByRole('button', { name: t('kit.stepper.decrease', { label: 'People' }) })).toBeDisabled();
    // The Slider on /tip and the Calculator's tip input are the same number.
    const slider = bubble.getByRole('slider', { name: 'Tip %' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(bubble.getByTestId(TID.kitCalculator).locator('input[data-input="tip"]')).toHaveValue('15');
    await page.keyboard.press('ArrowUp');
    await expect(bubble.getByTestId(TID.kitCalculator).locator('input[data-input="tip"]')).toHaveValue('20');
    await expect(slider).toBeFocused();
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('AT-347 · Calculator outputs recompute from the inputs and a bad formula shows "Can\'t work this out"', async () => {
  const { app, page } = await start([intake('split the bill', splitter)]);
  try {
    await say(page, 'split the bill');
    const calc = fooBubble(page, 'Here is the bill split.').getByTestId(TID.kitCalculator);
    await showUp(page, calc);
    const each = calc.locator('[data-output="0"] dd');
    // ₹2,400 with a 10% tip for 4.
    await expect(each).toHaveText('₹660');
    await calc.locator('input[data-input="bill"]').fill('3000');
    await expect(each).toHaveText('₹825');
    await calc.locator('input[data-input="people"]').fill('3');
    await expect(each).toHaveText('₹1,100');
    await expect(calc.locator('[data-output="1"] dd')).toHaveText(t('kit.calculator.cannot'));
  } finally {
    await app.close();
  }
});

test('AT-343 · Compare draws 2–3 columns and outlines the highlighted one with its why', async () => {
  const col = (title: string, price: string, time: string) => ({
    title,
    rows: [
      { label: 'Price', value: price },
      { label: 'Leaves', value: time },
    ],
  });
  const reply = `Three flights to Goa.\n\n${a2ui(
    create,
    comps([
      {
        id: 'root',
        component: 'Compare',
        columns: [
          col('IndiGo 6E 201', '₹4,200', '6:10 AM'),
          col('Akasa QP 1101', '₹3,900', '9:40 AM'),
          col('Air India AI 663', '₹5,100', '1:15 PM'),
        ],
        highlight: 1,
        why: 'Cheapest, and not too early',
      },
    ]),
  )}`;
  const { app, page } = await start([intake('goa flights', reply)]);
  try {
    await say(page, 'compare goa flights');
    const cmp = fooBubble(page, 'Three flights to Goa.').getByTestId(TID.kitCompare);
    await showUp(page, cmp);
    await expect(cmp).toHaveAttribute('data-columns', '3');
    await expect(cmp.getByRole('region')).toHaveCount(3);
    const best = cmp.locator('[data-best="true"]');
    await expect(best).toHaveCount(1);
    await expect(best).toHaveAccessibleName('Akasa QP 1101');
    await expect(best).toContainText(t('kit.compare.best'));
    await expect(best).toContainText('Cheapest, and not too early');
    const accent = await best.evaluate((el) => getComputedStyle(el).borderTopColor);
    const plain = await cmp
      .locator('section:not([data-best])')
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(accent).not.toBe(plain);
  } finally {
    await app.close();
  }
});

test('AT-348 · GoalRing arc is value / target with "{value} of {target}" in the middle as a meter', async () => {
  const reply = `You are most of the way there.\n\n${a2ui(
    create,
    comps([{ id: 'root', component: 'GoalRing', value: { path: '/saved' }, target: 20000, label: 'Goa trip fund' }]),
    data('/saved', 15000),
  )}`;
  const { app, page } = await start([intake('trip fund', reply)]);
  try {
    await say(page, 'how is my trip fund');
    const ring = fooBubble(page, 'You are most of the way there.').getByTestId(TID.kitGoalRing);
    await showUp(page, ring);
    const meter = ring.getByRole('meter', { name: 'Goa trip fund' });
    await expect(meter).toHaveAttribute('aria-valuenow', '15000');
    await expect(meter).toHaveAttribute('aria-valuemax', '20000');
    await expect(meter).toContainText(t('kit.goal.of', { value: '15,000', target: '20,000' }));
    await expect(ring).toHaveAttribute('data-share', '0.750');
    const drawn = await ring
      .locator('circle')
      .last()
      .evaluate((c) => {
        const len = Number(c.getAttribute('stroke-dasharray'));
        return 1 - Number(c.getAttribute('stroke-dashoffset')) / len;
      });
    expect(drawn).toBeCloseTo(0.75, 3);
  } finally {
    await app.close();
  }
});

test('AT-346 · TimedChecklist runs a timer in the renderer and keeps ticks in the surface data model', async () => {
  const reply = `Here is the dal recipe.\n\n${a2ui(
    create,
    comps([
      {
        id: 'root',
        component: 'TimedChecklist',
        steps: [{ title: 'Rinse the dal' }, { title: 'Pressure cook', seconds: 600 }, { title: 'Temper with jeera' }],
      },
    ]),
  )}`;
  const { app, page } = await start([intake('dal recipe', reply)]);
  try {
    await say(page, 'dal recipe please');
    const list = fooBubble(page, 'Here is the dal recipe.').getByTestId(TID.kitTimedChecklist);
    await showUp(page, list);
    const cook = list.locator('[data-step="1"]');
    await expect(cook).toContainText(t('kit.checklist.left', { time: '10:00' }));
    await cook.getByRole('button', { name: t('kit.checklist.start') }).click();
    // The timer is the renderer's own: it counts down with wall time and nothing is sent.
    const left = cook.locator('[data-left-ms]');
    await expect.poll(async () => Number(await left.getAttribute('data-left-ms')), { timeout: 5_000 }).toBeLessThan(599_000);
    await cook.getByRole('button', { name: t('kit.checklist.pause') }).click();
    const paused = await left.getAttribute('data-left-ms');
    await page.waitForTimeout(600);
    await expect(left).toHaveAttribute('data-left-ms', paused!);
    await expect(cook.getByRole('button', { name: t('kit.checklist.start') })).toBeVisible();
    // Ticks: kept in the data model, so they stay after the chat is left and opened again.
    await list.getByRole('checkbox', { name: 'Rinse the dal' }).check();
    await expect(list.locator('[data-step="0"]')).toHaveAttribute('data-ticked', 'true');
    await openChat(page, 'Trips');
    await openChat(page, 'foo');
    const again = fooBubble(page, 'Here is the dal recipe.').getByTestId(TID.kitTimedChecklist);
    await showUp(page, again);
    await expect(again.getByRole('checkbox', { name: 'Rinse the dal' })).toBeChecked();
    await expect(again.getByRole('checkbox', { name: 'Pressure cook' })).not.toBeChecked();
    // The paused timer is kept in the data model too, so it comes back where it stopped.
    await expect(again.locator('[data-step="1"] [data-left-ms]')).toHaveAttribute('data-left-ms', paused!);
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Rinse' })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('AT-351 · ShortForm sends one action with the values; a secret-looking value is refused and the Secret box offered', async () => {
  const reply = `Tell me about the visit.\n\n${a2ui(
    create,
    comps([
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
  const { app, page, dirs } = await start([intake('plan a visit', reply), intake('action plan_visit', 'Saturday it is.')]);
  try {
    await say(page, 'plan a visit');
    const form = fooBubble(page, 'Tell me about the visit.').getByTestId(TID.kitShortForm);
    await showUp(page, form);
    // A field that asks for a password is not drawn.
    await expect(form.locator('input[name="pw"]')).toHaveCount(0);
    await expect(form.locator('[data-refused-field="pw"]')).toHaveText(t('kit.form.secret_refused'));
    const submit = form.getByRole('button', { name: t('kit.form.submit', { agentName: 'foo' }) });
    // A password typed into a normal field never leaves: refused, and the Secret box is offered.
    await form.getByLabel('Name').fill('Asha password: Tiger#2026');
    await submit.click();
    const surface = fooBubble(page, 'Tell me about the visit.').getByTestId(TID.kitSurface);
    await expect(surface.getByRole('alert')).toContainText(t('kit.form.secret_refused'));
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Plan visit' })).toHaveCount(0);
    await surface.getByRole('button', { name: t('composer.paste.move') }).click();
    const box = page.getByTestId(TID.cardSecret).last();
    await expect(box).toContainText(t('composer.paste.name.password'));
    // CR-0057: the box's Name field comes first; the moved value is in the masked field after it.
    await expect(box.getByTestId(TID.cardSecretField).nth(1)).not.toHaveValue('');
    // The secret left the field; the rest stayed.
    await expect(form.getByLabel('Name')).toHaveValue('Asha');
    await expect(surface.getByRole('alert')).toHaveCount(0);
    // A card number in a number field travels as a number and is caught too (a test card number, not a real one).
    await form.getByLabel('Guests').fill('4111111111111111');
    await submit.click();
    await expect(surface.getByRole('alert')).toContainText(t('kit.form.secret_refused'));
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Plan visit' })).toHaveCount(0);
    // Now the form sends one action with every value.
    await form.getByLabel('Guests').fill('4');
    await form.getByLabel('Day').selectOption('Saturday');
    await submit.click();
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Plan visit' })).toBeVisible();
    await showUp(page, fooBubble(page, 'Saturday it is.'));
    const turn = fakeTurns(dirs).find((x) => x.purpose === 'intake' && x.prompt.includes('action plan_visit'));
    expect(turn?.prompt).toContain('"place":"Lalbagh"');
    expect(turn?.prompt).toContain('"who":"Asha"');
    expect(turn?.prompt).toContain('"guests":4');
    expect(turn?.prompt).toContain('"day":"Saturday"');
    expect(turn?.prompt).not.toContain('Tiger#2026');
  } finally {
    await app.close();
  }
});

test('a secret typed in a TextField is refused when a Button sends it, offered to the Secret box and removed from the field', async () => {
  const reply = `Send me the note.\n\n${a2ui(
    create,
    comps([
      { id: 'root', component: 'Column', children: ['note', 'go'] },
      { id: 'note', component: 'TextField', label: 'Note', value: { path: '/note' } },
      { id: 'go', component: 'Button', child: 'go-t', action: { event: { name: 'save_note', context: { note: { path: '/note' } } } } },
      { id: 'go-t', component: 'Text', text: 'Save note' },
    ]),
    data('/note', ''),
  )}`;
  const { app, page } = await start([intake('a note', reply)]);
  try {
    await say(page, 'take a note');
    const surface = fooBubble(page, 'Send me the note.').getByTestId(TID.kitSurface);
    await showUp(page, surface.getByTestId(TID.kitTextField));
    await surface.getByTestId(TID.kitTextField).fill('wifi password: Monsoon#77');
    await surface.getByTestId(TID.kitButton).click();
    await expect(surface.getByRole('alert')).toContainText(t('kit.form.secret_refused'));
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Save note' })).toHaveCount(0);
    await surface.getByRole('button', { name: t('composer.paste.move') }).click();
    await expect(page.getByTestId(TID.cardSecret).last()).toContainText(t('composer.paste.name.password'));
    await expect(surface.getByTestId(TID.kitTextField)).toHaveValue('wifi');
  } finally {
    await app.close();
  }
});
