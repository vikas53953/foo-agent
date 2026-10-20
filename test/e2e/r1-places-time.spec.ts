// Spec: 10-acceptance-2 §C.9 AT-341 (MapStops: numbered stops to scale on a plain panel with a dashed route and the stops
// list; "Open in Maps" is an action chip; no network request leaves the PC while it draws), AT-344 (Timeline: items in date
// order, amounts in money format), AT-345 (WeekCalendar: busy and free slots for 7 days; Narrator reads each slot), AT-349
// (ListPick: the pick counts as a Choice answer; a reaction counts too, 05-1 §5.3.4; it answers once and stays, §5.3.5),
// AT-350 (TimePick: the picked slot goes back to foo, who confirms it); 04 §13.5, CR-0022 pick 4, X-180. R1 T3: the real app on the fake AI, sample data only.
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
const a2ui = (...lines: string[]) => `\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;
const one = (piece: Record<string, unknown>) =>
  a2ui(
    create,
    comps([
      { id: 'root', component: 'Column', children: ['p'] },
      { id: 'p', ...piece },
    ]),
  );

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
const meBubble = (page: Page, words: string) => page.getByTestId(TID.bubbleMe).filter({ hasText: words });

const ERRANDS = [
  { name: 'Bakery on FC Road', lat: 18.5236, lng: 73.8412, note: 'Cake pickup' },
  { name: 'Post office', lat: 18.5308, lng: 73.8475 },
  { name: 'Pharmacy', lat: 18.5167, lng: 73.8563, note: 'Refill' },
];

test('AT-341 · MapStops draws numbered stops to scale with a dashed route and the list, opens Maps from a chip, and sends nothing out', async () => {
  const reply = `Your Saturday errands, in this order.\n\n${one({ component: 'MapStops', stops: ERRANDS })}`;
  const { app, page } = await start([intake('saturday errands', reply)]);
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^(https?|wss?):/i.test(r.url())) external.push(r.url());
  });
  try {
    await app.evaluate(({ shell }) => {
      const g = globalThis as unknown as { __opened: string[] };
      g.__opened = [];
      shell.openExternal = async (url: string) => void g.__opened.push(url);
    });
    await say(page, 'plan my saturday errands');
    const map = fooBubble(page, 'Your Saturday errands').getByTestId(TID.kitMapStops);
    await showUp(page, map);
    const panel = map.getByRole('img', { name: t('kit.map.accessible_name', { n: 3 }) });
    await expect(panel).toBeVisible();
    // Numbered stops on a plain panel (no tiles, no images), joined by one dashed route.
    await expect(panel.locator('circle')).toHaveCount(3);
    await expect(panel.locator('text')).toHaveText(['1', '2', '3']);
    await expect(map.locator('svg image, img')).toHaveCount(0);
    await expect(panel.locator('path')).toHaveAttribute('class', /route/);
    expect(await panel.locator('path').evaluate((p) => getComputedStyle(p).strokeDasharray)).not.toBe('none');
    // To scale: the Post office is furthest north (highest), the Pharmacy furthest east (rightmost).
    const pts = await map
      .locator('svg circle')
      .evaluateAll((cs) => cs.map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) })));
    expect(pts[1]!.y).toBeLessThan(Math.min(pts[0]!.y, pts[2]!.y));
    expect(pts[2]!.x).toBeGreaterThan(Math.max(pts[0]!.x, pts[1]!.x));
    await expect(map.getByRole('listitem')).toHaveText([/Bakery on FC Road\s*Cake pickup/, /Post office/, /Pharmacy\s*Refill/]);
    const chip = map.getByTestId(TID.kitMapOpen);
    await expect(chip).toHaveText(t('kit.map.open'));
    expect(external).toEqual([]);
    await chip.click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened))
      .toEqual([
        'https://www.google.com/maps/dir/?api=1&origin=18.5236%2C73.8412&destination=18.5167%2C73.8563&waypoints=18.5308%2C73.8475',
      ]);
    expect(external).toEqual([]);
  } finally {
    await app.close();
  }
});

test('AT-344 · Timeline lists items in date order with amounts in money format', async () => {
  const items = [
    { date: '15 Nov', title: 'Car insurance due', amount: 18450 },
    { date: '2 Nov', title: 'Rent', amount: 123450 },
    { date: '9 Nov', title: 'Dentist visit' },
  ];
  const reply = `Here is November.\n\n${one({ component: 'Timeline', items })}`;
  const { app, page } = await start([intake('november', reply)]);
  try {
    await say(page, 'what is coming up in november');
    const line = fooBubble(page, 'Here is November.').getByTestId(TID.kitTimeline);
    await showUp(page, line);
    await expect(line).toHaveAccessibleName(t('kit.timeline.accessible_name', { n: 3 }));
    await expect(line.getByRole('listitem')).toHaveText([
      /2 Nov\s*Rent\s*₹1,23,450/,
      /9 Nov\s*Dentist visit$/,
      /15 Nov\s*Car insurance due\s*₹18,450/,
    ]);
  } finally {
    await app.close();
  }
});

test('AT-345 · WeekCalendar shows busy and free slots for 7 days and Narrator reads each slot', async () => {
  const days = ['Mon 20', 'Tue 21', 'Wed 22', 'Thu 23', 'Fri 24', 'Sat 25', 'Sun 26'];
  const slots = days.flatMap((_, day) => [
    { day, start: '09:00', end: '10:30', busy: day % 2 === 0 },
    { day, start: '14:00', end: '15:00', busy: day % 2 === 1 },
  ]);
  const reply = `Your week looks like this.\n\n${one({ component: 'WeekCalendar', days, slots })}`;
  const { app, page } = await start([intake('my week', reply)]);
  try {
    await say(page, 'how does my week look');
    const cal = fooBubble(page, 'Your week looks like this.').getByTestId(TID.kitWeekCalendar);
    await showUp(page, cal);
    await expect(cal.getByRole('list')).toHaveCount(7);
    await expect(cal.getByRole('listitem')).toHaveCount(14);
    const busy = t('kit.calendar.busy');
    const free = t('kit.calendar.free');
    const mon = cal.getByRole('list', { name: 'Mon 20' }).getByRole('listitem');
    await expect(mon.nth(0)).toHaveAccessibleName(`Mon 20 09:00–10:30, ${busy}`);
    await expect(mon.nth(1)).toHaveAccessibleName(`Mon 20 14:00–15:00, ${free}`);
    await expect(cal.getByRole('list', { name: 'Sun 26' }).getByRole('listitem').first()).toHaveAccessibleName(
      `Sun 26 09:00–10:30, ${busy}`,
    );
    await expect(cal.locator('[data-busy="true"]')).toHaveCount(7);
    await expect(cal.locator('[data-busy="false"]')).toHaveCount(7);
    await expect(fooBubble(page, 'Your week looks like this.').getByTestId(TID.kitDropped)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

const branches = (name: string) =>
  one({
    component: 'ListPick',
    rows: [{ title: 'Kothrud branch', sub: 'Open till 6 PM' }, { title: 'Baner branch', sub: 'Open till 8 PM' }, { title: 'Camp branch' }],
    action: { event: { name, context: { bank: 'Example Bank' } } },
  });

test('AT-349 · a ListPick pick counts as the answer, and a keycap reaction counts too', async () => {
  const { app, page, dirs } = await start([
    intake('nearest branch', `Three branches are open on Saturday.\n\n${branches('pick_branch')}`),
    intake('action pick_branch', 'Baner branch it is. I will note the hours.'),
    intake('atm', `These three have an ATM inside.\n\n${branches('pick_atm')}`),
    intake('action pick_atm', 'Kothrud branch has the ATM. Noted.'),
  ]);
  try {
    await say(page, 'which nearest branch is open saturday');
    const first = fooBubble(page, 'Three branches are open').getByTestId(TID.kitListPick);
    await showUp(page, first);
    await expect(first.getByRole('radio')).toHaveCount(3);
    await first.getByRole('radio', { name: /Baner branch/ }).click();
    // The pick is the user's answer in the row's own words, and foo's reply follows.
    await expect(meBubble(page, 'Baner branch')).toBeVisible();
    await expect(first).toHaveAttribute('data-state', 'answered');
    await expect(first.getByRole('radio', { name: /Baner branch/ })).toHaveAttribute('aria-checked', 'true');
    await expect(first.getByRole('status')).toHaveText(t('kit.pick.chosen', { choice: 'Baner branch' }));
    await showUp(page, fooBubble(page, 'Baner branch it is.'));
    const turn = fakeTurns(dirs).find((x) => x.purpose === 'intake' && x.prompt.includes('action pick_branch'));
    expect(turn?.prompt).toContain('"choice":"Baner branch"');
    expect(turn?.prompt).toContain('"bank":"Example Bank"');

    // A 1️⃣ reaction on the second message picks its first row, like a tap (05-1 §5.3.4).
    await say(page, 'which ones have an atm');
    const bubble = fooBubble(page, 'These three have an ATM inside.');
    const second = bubble.getByTestId(TID.kitListPick);
    await showUp(page, second);
    const messageId = await bubble.locator('xpath=ancestor::*[@data-message-id][1]').getAttribute('data-message-id');
    await page.evaluate((id) => window.foo.invoke('message:react', { messageId: id!, emoji: '1️⃣', on: true }), messageId);
    await expect(meBubble(page, 'Kothrud branch')).toBeVisible();
    await expect(second).toHaveAttribute('data-state', 'answered');
    await expect(second.getByRole('radio', { name: /Kothrud branch/ })).toHaveAttribute('aria-checked', 'true');
    await showUp(page, fooBubble(page, 'Kothrud branch has the ATM.'));
    // It answers once (05-1 §5.3.5): taking the reaction off, or a 2️⃣ after it, changes nothing.
    const react = (emoji: string, on: boolean) =>
      page.evaluate(([id, e, o]) => window.foo.invoke('message:react', { messageId: id!, emoji: e, on: o }), [
        messageId,
        emoji,
        on,
      ] as const);
    await react('1️⃣', false);
    await react('2️⃣', true);
    await advance(page, HOLD_MS + 100);
    await expect(second.getByRole('radio', { name: /Kothrud branch/ })).toHaveAttribute('aria-checked', 'true');
    // No second answer: the newest user message is still the 1️⃣ pick.
    await expect(page.getByTestId(TID.bubbleMe).last()).toContainText('Kothrud branch');
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Baner branch' })).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('AT-350 · a TimePick slot goes back to foo, who confirms it', async () => {
  const slots = ['10:30', '11:15', '12:00', '16:45'];
  const offer = `Dr. Rao (example clinic) has these on Thursday.\n\n${one({
    component: 'TimePick',
    date: 'Thursday 23 Oct',
    slots,
    action: { event: { name: 'pick_slot', context: { clinic: 'Example Clinic' } } },
  })}`;
  const { app, page, dirs } = await start([
    intake('doctor', offer),
    intake('action pick_slot', 'Done. You are down for 11:15 on Thursday 23 Oct.'),
  ]);
  try {
    await say(page, 'find me a doctor slot this week');
    const pick = fooBubble(page, 'Dr. Rao').getByTestId(TID.kitTimePick);
    await showUp(page, pick);
    await expect(pick.getByRole('radiogroup', { name: 'Thursday 23 Oct' }).getByRole('radio')).toHaveText(slots);
    await pick.getByRole('radio', { name: '11:15' }).click();
    await expect(meBubble(page, '11:15, Thursday 23 Oct')).toBeVisible();
    await expect(pick).toHaveAttribute('data-state', 'answered');
    await expect(pick.getByRole('radio', { name: '10:30' })).toBeDisabled();
    await showUp(page, fooBubble(page, 'You are down for 11:15'));
    // A reload drops everything the window held; the answer comes back from the chat (05-1 §5.3.5).
    await page.reload();
    await openChat(page, 'foo');
    const again = fooBubble(page, 'Dr. Rao').getByTestId(TID.kitTimePick);
    await expect(again).toHaveAttribute('data-state', 'answered');
    await expect(again.getByRole('radio', { name: '11:15' })).toHaveAttribute('aria-checked', 'true');
    const turn = fakeTurns(dirs).find((x) => x.purpose === 'intake' && x.prompt.includes('action pick_slot'));
    expect(turn?.prompt).toContain('"choice":"11:15"');
    expect(turn?.prompt).toContain('"date":"Thursday 23 Oct"');
  } finally {
    await app.close();
  }
});
