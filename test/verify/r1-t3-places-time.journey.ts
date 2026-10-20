// Spec: 04 §13.5 (kit pieces in foo's reply; ListPick and TimePick picks go main `kit:action` → engine `kit.action`),
// CR-0022 pick 4 (MapStops: no basemap, nothing leaves the PC), 05-1 §5.3.4 (a ListPick answer counts like a Choice
// answer), AT-341, AT-344, AT-345, AT-349, AT-350, X-180.
// foo-verify journey for R1 T3, real app on the seeded world with the fake AI: (1) "Saturday errands" map with 3 stops and
// no web request; (2) November timeline and the week calendar; (3) a list pick of 3 branches, tapped; (4) doctor slots,
// 11:15 picked, foo confirms; light and dark pictures of each piece.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t3-places-time.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake, type FakeTurn } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = (components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: 's1', components } });
const one = (piece: Record<string, unknown>) =>
  `\`\`\`a2ui\n${create}\n${comps([
    { id: 'root', component: 'Column', children: ['p'] },
    { id: 'p', ...piece },
  ])}\n\`\`\``;

const ERRANDS = [
  { name: 'Bakery on FC Road', lat: 18.5236, lng: 73.8412, note: 'Cake pickup' },
  { name: 'Post office', lat: 18.5308, lng: 73.8475 },
  { name: 'Pharmacy', lat: 18.5167, lng: 73.8563, note: 'Refill' },
];
const NOVEMBER = [
  { date: '15 Nov', title: 'Car insurance due', amount: 18450 },
  { date: '2 Nov', title: 'Rent', amount: 32000 },
  { date: '9 Nov', title: 'Dentist visit' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = DAYS.flatMap((_, day) => [
  { day, start: '09:00', end: '10:30', busy: day % 2 === 0 },
  { day, start: '13:00', end: '14:00', busy: day === 3 },
  { day, start: '16:00', end: '17:30', busy: day % 3 === 1 },
]);
const BRANCHES = [
  { title: 'Kothrud branch', sub: 'Open till 6 PM' },
  { title: 'Baner branch', sub: 'Open till 8 PM' },
  { title: 'Camp branch' },
];

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

const fooBubble = (page: Page, words: string) => page.getByTestId(TID.bubbleFoo).filter({ hasText: words });

async function shots(v: Verify, page: Page, name: string, el: Locator) {
  await el.scrollIntoViewIfNeeded();
  await setTheme(page, 'light');
  await settle(page);
  await v.shot(name, `[data-testid="${TID.threadLog}"]`);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot(`${name}-dark`, `[data-testid="${TID.threadLog}"]`);
  await setTheme(page, 'light');
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      intake('saturday errands', `Your Saturday errands, in this order.\n\n${one({ component: 'MapStops', stops: ERRANDS })}`),
      intake('november', `Here is November.\n\n${one({ component: 'Timeline', items: NOVEMBER })}`),
      intake('my week', `Your week: mornings are busiest.\n\n${one({ component: 'WeekCalendar', days: DAYS, slots: SLOTS })}`),
      intake(
        'nearest branch',
        `Three branches are open on Saturday.\n\n${one({ component: 'ListPick', rows: BRANCHES, action: { event: { name: 'pick_branch' } } })}`,
      ),
      intake('action pick_branch', 'Baner branch it is. It is open till 8 PM.'),
      intake(
        'doctor',
        `Dr. Rao (example clinic) has these on Thursday.\n\n${one({
          component: 'TimePick',
          date: 'Thursday 23 Oct',
          slots: ['10:30', '11:15', '12:00', '16:45'],
          action: { event: { name: 'pick_slot', context: { clinic: 'Example Clinic' } } },
        })}`,
      ),
      intake('action pick_slot', 'Done. You are down for 11:15 on Thursday 23 Oct.'),
    ],
  });
  const external: string[] = [];
  page.on('request', (r) => {
    if (/^(https?|wss?):/i.test(r.url())) external.push(r.url());
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await settle(page);
  await v.shot('before');

  // 1. Saturday errands: 3 numbered stops on a plain panel, the list beside it, nothing fetched from the web.
  await send(page, 'plan my saturday errands');
  const map = fooBubble(page, 'Your Saturday errands').getByTestId(TID.kitMapStops);
  await showUp(page, map);
  const circles = await map.locator('svg[role="img"] circle').count();
  if (circles !== 3) throw new Error(`expected 3 stops, saw ${circles}`);
  if (external.length) throw new Error(`the map fetched ${external.join(', ')}`);
  v.note(`map: ${circles} numbered stops, list ${JSON.stringify(await map.getByRole('listitem').allTextContents())}, web requests 0`);
  await shots(v, page, 'map', map);

  // 2. November timeline (date order, money form) and the week calendar.
  await send(page, 'what is coming up in november');
  const line = fooBubble(page, 'Here is November.').getByTestId(TID.kitTimeline);
  await showUp(page, line);
  const order = await line.getByRole('listitem').allTextContents();
  if (!order[0]?.includes('2 Nov') || !order[0].includes('₹32,000')) throw new Error(`timeline order ${JSON.stringify(order)}`);
  v.note(`timeline: ${JSON.stringify(order)}`);
  await send(page, 'how does my week look');
  const cal = fooBubble(page, 'Your week').getByTestId(TID.kitWeekCalendar);
  await showUp(page, cal);
  const firstSlot = await cal.getByRole('listitem').first().getAttribute('aria-label');
  v.note(
    `week: ${await cal.getByRole('list').count()} days, ${await cal.getByRole('listitem').count()} slots; Narrator reads "${firstSlot}"`,
  );
  await shots(v, page, 'timeline-week', cal);

  // 3. A list pick of 3 branches: the tap is the user's answer, foo replies.
  await send(page, 'which nearest branch is open saturday');
  const pick = fooBubble(page, 'Three branches are open').getByTestId(TID.kitListPick);
  await showUp(page, pick);
  await pick.getByRole('radio', { name: /Baner branch/ }).click();
  await page.getByTestId(TID.bubbleMe).filter({ hasText: 'Baner branch' }).waitFor();
  await showUp(page, fooBubble(page, 'Baner branch it is.'));
  v.note(`list pick: tapped "Baner branch", state ${await pick.getAttribute('data-state')}, foo replied`);
  await shots(v, page, 'list-pick', pick);

  // 4. Doctor slots: 11:15 goes back to foo, who confirms it.
  await send(page, 'find me a doctor slot this week');
  const time = fooBubble(page, 'Dr. Rao').getByTestId(TID.kitTimePick);
  await showUp(page, time);
  await time.getByRole('radio', { name: '11:15' }).click();
  await page.getByTestId(TID.bubbleMe).filter({ hasText: '11:15' }).waitFor();
  await showUp(page, fooBubble(page, 'You are down for 11:15'));
  const turn = (v.fakeTurns() as FakeTurn[]).find((x) => x.purpose === 'intake' && x.prompt.includes('action pick_slot'));
  if (!turn?.prompt.includes('"choice":"11:15"')) throw new Error('the AI was not told the picked slot');
  v.note('time pick: 11:15 tapped, the AI read action pick_slot with choice 11:15, foo confirmed "You are down for 11:15"');
  await shots(v, page, 'time-pick', time);
  if (external.length) throw new Error(`web requests: ${external.join(', ')}`);
  v.note('web requests from the window during the whole journey: 0');
}
