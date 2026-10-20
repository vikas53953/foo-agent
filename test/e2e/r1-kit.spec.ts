// Spec: 10-acceptance-2 §C.9 AT-340 (LineChart line, area, bar from one series and from 3; one hue; axis values by the 02
// rules; a legend only with 2+ series), AT-353 (each complete A2UI message draws while the reply streams; an incomplete one
// is held back), AT-354 (an invalid or unknown component is dropped, "Couldn't show part of this" shows, the words stay),
// AT-355 (a Button action reaches the engine as `kit.action` and the surface updates from the reply), AT-356 (a Button that
// would book opens an approval, never acts directly); 04 §13.5, 02-2 §F19.9, 08-1 §2.4, Article 6, CR-0022, X-180.
// R1 T2: the real app on the fake AI. AT-356 runs on M9's sandbox restaurant so the tap meets the real job and gate.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import { settleSeededJobs } from './m4-start';
import { SETUP_LINES, advanceUntil, bookingIntake, lastCard, requestBooking, say, startBooking, toolLine } from './m9-booking-world';
import { openChat, openWorld } from '../fidelity/capture';

const HOLD_MS = 1500;
const act = JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] });
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = (components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: 's1', components } });
const data = (path: string, value: unknown) => JSON.stringify({ updateDataModel: { surfaceId: 's1', path, value } });
const a2ui = (...lines: string[]) => `\`\`\`a2ui\n${lines.join('\n')}\n\`\`\``;

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const series = (label: string, ys: number[]) => ({ label, points: ys.map((y, i) => ({ x: days[i]!, y })) });
const THIS_WEEK = series('This week', [4200, 3900, 4700, 4100, 3800]);
const LAST_MONTH = series('Last month', [5100, 4800, 5200, 5000, 4900]);
const LAST_YEAR = series('Last year', [6100, 5800, 6000, 6400, 6200]);

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

test('AT-340 · LineChart draws line, area and bar from one series and from 3, in one hue, with a legend only for 2+ series', async () => {
  const charts = (['line', 'area', 'bar'] as const).flatMap((variant) => [
    { id: `${variant}1`, component: 'LineChart', variant, title: `Goa fares ${variant}`, unit: 'rupees', series: [THIS_WEEK] },
    {
      id: `${variant}3`,
      component: 'LineChart',
      variant,
      title: `Goa fares ${variant} x3`,
      unit: 'rupees',
      series: [THIS_WEEK, LAST_MONTH, LAST_YEAR],
    },
  ]);
  const reply = `Here are the Goa fares.\n\n${a2ui(create, comps([{ id: 'root', component: 'Column', children: charts.map((c) => c.id) }, ...charts]))}`;
  const { app, page } = await start([intake('goa fares', reply)]);
  try {
    await say(page, 'show goa fares');
    const bubble = fooBubble(page, 'Here are the Goa fares.');
    await showUp(page, bubble.getByTestId(TID.kitLineChart));
    const all = bubble.getByTestId(TID.kitLineChart);
    await expect(all).toHaveCount(6);
    for (const variant of ['line', 'area', 'bar']) {
      const one = all.and(page.locator(`[data-variant="${variant}"][data-series="1"]`));
      const three = all.and(page.locator(`[data-variant="${variant}"][data-series="3"]`));
      await expect(one).toHaveCount(1);
      await expect(three).toHaveCount(1);
      // F19.9: a legend only with 2 or more series.
      await expect(one.getByRole('list')).toHaveCount(0);
      await expect(three.getByRole('list', { name: t('kit.chart.legend') })).toBeVisible();
      await expect(three.getByRole('listitem')).toHaveText(['This week', 'Last month', 'Last year']);
    }
    // One hue: every series draws in the accent colour (series 2 and 3 are fainter and dashed, never another colour).
    const colours = await bubble.evaluate((el) => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const probe = document.createElement('i');
      probe.style.color = accent;
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      const marks = [...el.querySelectorAll('[data-testid="kit-line-chart"] path[class*="line"], [data-testid="kit-line-chart"] rect')];
      const got = new Set(marks.map((m) => (m.tagName === 'rect' ? getComputedStyle(m).fill : getComputedStyle(m).stroke)));
      const dashes = new Set(
        [...el.querySelectorAll('[data-series-index]')].map(
          (g) =>
            g.getAttribute('data-series-index') + ':' + (g.querySelector('[stroke-dasharray]')?.getAttribute('stroke-dasharray') ?? ''),
        ),
      );
      return { want, got: [...got], dashes: [...dashes] };
    });
    expect(colours.got).toEqual([colours.want]);
    expect(colours.dashes).toEqual(expect.arrayContaining(['0:', '1:6 4', '2:2 3']));
    // 02 §F19.2: rupee axis values in the money form; the chart has a Narrator name.
    await expect(all.first().locator('text').filter({ hasText: '₹5,000' })).toHaveCount(1);
    await expect(all.first().getByRole('img', { name: t('kit.chart.accessible_name', { title: 'Goa fares line', n: 1 }) })).toBeVisible();
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('AT-353 · each complete A2UI message draws while the reply streams; an incomplete one is held back', async () => {
  const head = comps([
    { id: 'root', component: 'Column', children: ['title', 'chart'] },
    { id: 'title', component: 'Text', text: 'Goa fares this week', variant: 'title' },
    { id: 'chart', component: 'LineChart', variant: 'line', unit: 'rupees', series: { path: '/fares' } },
  ]);
  const dataLine = data('/fares', [THIS_WEEK]);
  const cut = Math.floor(dataLine.length / 2);
  const { app, page } = await start([
    {
      match: { purpose: 'intake', promptIncludes: 'stream the fares' },
      chunks: [
        { text: `<say>Fares are falling.\n\n\`\`\`a2ui\n${create}\n${head}\n${dataLine.slice(0, cut)}` },
        { text: `${dataLine.slice(cut)}\n\`\`\`</say>\n<act>${act}</act>`, delayMs: 60_000 },
      ],
    },
  ]);
  try {
    await say(page, 'stream the fares');
    const bubble = fooBubble(page, 'Fares are falling.');
    await showUp(page, bubble);
    await expect(bubble).toHaveAttribute('data-state', 'streaming');
    // The two complete messages drew; the half-arrived data message is held back, so the bound chart waits (no caption).
    await expect(bubble.getByTestId(TID.kitSurface)).toContainText('Goa fares this week');
    await expect(bubble.getByTestId(TID.kitLineChart)).toHaveCount(0);
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveCount(0);
    await advance(page, 60_000);
    await expect(bubble).toHaveAttribute('data-state', 'complete');
    await expect(bubble.getByTestId(TID.kitLineChart)).toHaveAttribute('data-series', '1');
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('AT-354 · an invalid or unknown component is dropped with "Couldn\'t show part of this" and the words stay', async () => {
  const reply = `Here is the week.\n\n${a2ui(
    create,
    comps([
      { id: 'root', component: 'Column', children: ['chart', 'holo', 'bad'] },
      { id: 'chart', component: 'LineChart', variant: 'bar', series: [THIS_WEEK] },
      { id: 'holo', component: 'Hologram' },
      { id: 'bad', component: 'Text', text: { path: '/missing' } },
    ]),
  )}`;
  const { app, page } = await start([intake('the week', reply)]);
  try {
    await say(page, 'how was the week');
    const bubble = fooBubble(page, 'Here is the week.');
    await showUp(page, bubble.getByTestId(TID.kitDropped));
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveText(t('kit.surface.dropped'));
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveCount(1);
    await expect(bubble.getByTestId(TID.kitLineChart)).toBeVisible();
    await expect(bubble).toContainText('Here is the week.');
    await expect(bubble.getByTestId(TID.bubbleCode)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('AT-355 · a Button action reaches the engine as kit.action and the surface updates from the reply', async () => {
  const first = `Fares are falling.\n\n${a2ui(
    create,
    comps([
      { id: 'root', component: 'Column', children: ['chart', 'cmp'] },
      { id: 'chart', component: 'LineChart', variant: 'line', title: 'Goa flight prices', unit: 'rupees', series: { path: '/series' } },
      { id: 'cmp', component: 'Button', child: 'cmp-t', action: { event: { name: 'compare_last_month', context: { route: 'BOM-GOI' } } } },
      { id: 'cmp-t', component: 'Text', text: 'Compare with last month' },
    ]),
    data('/series', [THIS_WEEK]),
  )}`;
  const second = `Here is last month beside it.\n\n${a2ui(data('/series', [THIS_WEEK, LAST_MONTH]))}`;
  const { app, page, dirs } = await start([intake('goa flight prices', first), intake('action compare_last_month', second)]);
  try {
    await say(page, 'goa flight prices please');
    const bubble = fooBubble(page, 'Fares are falling.');
    const chart = bubble.getByTestId(TID.kitLineChart);
    await showUp(page, chart);
    await expect(chart).toHaveAttribute('data-series', '1');
    await bubble.getByTestId(TID.kitButton).click();
    // The tap is the user's message in the Button's words; the AI reads the action beside it.
    await expect(page.getByTestId(TID.bubbleMe).filter({ hasText: 'Compare with last month' })).toBeVisible();
    await showUp(page, fooBubble(page, 'Here is last month beside it.'));
    await expect(chart).toHaveAttribute('data-series', '2');
    await expect(chart.getByRole('listitem')).toHaveText(['This week', 'Last month']);
    const turn = fakeTurns(dirs).find((x) => x.purpose === 'intake' && x.prompt.includes('action compare_last_month'));
    expect(turn?.prompt).toContain('"route":"BOM-GOI"');
    expect(turn?.prompt).toContain('surfaceId "s1"');
  } finally {
    await app.close();
  }
});

test('AT-356 · a Button that would book opens an approval and books nothing', async () => {
  test.setTimeout(180_000);
  const ASK = 'tables near Marine Drive on Saturday';
  const offer = `Coastline Kitchen has a table at 8:00 PM for 4.\n\n${a2ui(
    create,
    comps([
      { id: 'root', component: 'Column', children: ['book'] },
      {
        id: 'book',
        component: 'Button',
        primary: true,
        child: 'book-t',
        action: { event: { name: 'book_table', context: { place: 'Coastline Kitchen', party: 4 } } },
      },
      { id: 'book-t', component: 'Text', text: 'Book Coastline Kitchen for 4' },
    ]),
  )}`;
  const w = await startBooking((sb) => [
    ...SETUP_LINES,
    intake(ASK, offer),
    bookingIntake('action book_table', 'Book Coastline Kitchen'),
    toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
    toolLine('browser.snapshot', {}),
    requestBooking(2),
  ]);
  const { page } = w;
  try {
    await say(page, ASK);
    // Home is a helper's chat: the reply is the helper's bubble.
    const button = page.getByTestId(TID.threadLog).getByTestId(TID.kitButton);
    await advanceUntil(page, button);
    await button.click();
    const approval = lastCard(page, TID.cardApproval);
    await advanceUntil(page, approval);
    await expect(approval.getByTestId(TID.cardApprovalApprove)).toHaveText(t('cards.approval.book.primary.table'));
    // The tap asked; nothing was booked.
    expect((await w.control()).counters.submits ?? 0).toBe(0);
  } finally {
    await w.close();
  }
});
