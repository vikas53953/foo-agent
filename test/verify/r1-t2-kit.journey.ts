// Spec: 04 §13.5 (a kit surface in foo's reply, drawn as foo's own pieces; user actions go main `kit:action` → engine
// `kit.action`; a later reply updates the surface), 02-2 §F19.9 (LineChart), CR-0022 AT-340, AT-353, AT-355, X-180.
// foo-verify journey for R1 T2, real app on the seeded world with the fake AI: (1) "Goa flight prices" streams in and the
// chart draws while the reply is still streaming; (2) "Compare with last month" is tapped, the tap shows as the user's words,
// the AI is told the action, and the same chart redraws with 2 series and a key; (3) dark theme. The Book button that opens
// an approval runs on M9's sandbox restaurant in test/e2e/r1-kit.spec.ts (AT-356).
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t2-kit.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake, type FakeTurn } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const act = JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] });
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const comps = (components: unknown[]) => JSON.stringify({ updateComponents: { surfaceId: 's1', components } });
const data = (value: unknown) => JSON.stringify({ updateDataModel: { surfaceId: 's1', path: '/series', value } });
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const series = (label: string, ys: number[]) => ({ label, points: ys.map((y, i) => ({ x: days[i]!, y })) });
const THIS_WEEK = series('This week', [4200, 3900, 4700, 4100, 3800, 3600, 3500]);
const LAST_MONTH = series('Last month', [5100, 4800, 5200, 5000, 4900, 4700, 4600]);
const surface = comps([
  { id: 'root', component: 'Column', children: ['chart', 'cmp'] },
  { id: 'chart', component: 'LineChart', variant: 'area', title: 'Goa flight prices', unit: 'rupees', series: { path: '/series' } },
  { id: 'cmp', component: 'Button', child: 'cmp-t', action: { event: { name: 'compare_last_month', context: { route: 'BOM-GOI' } } } },
  { id: 'cmp-t', component: 'Text', text: 'Compare with last month' },
]);

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

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [
      {
        match: { purpose: 'intake', promptIncludes: 'goa flight prices' },
        chunks: [
          { text: `<say>Fares to Goa are falling this week.\n\n\`\`\`a2ui\n${create}\n${surface}\n${data([THIS_WEEK])}\n` },
          { text: `\`\`\`\nThe cheapest day is Sunday.</say>\n<act>${act}</act>`, delayMs: 60_000 },
        ],
      },
      intake('action compare_last_month', `Last month was dearer every day.\n\n\`\`\`a2ui\n${data([THIS_WEEK, LAST_MONTH])}\n\`\`\``),
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await settle(page);
  await v.shot('before');

  // 1. The chart draws while the reply still streams.
  await send(page, 'goa flight prices this week');
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Fares to Goa are falling this week.' });
  const chart = bubble.getByTestId(TID.kitLineChart);
  await showUp(page, chart);
  const state = await bubble.getAttribute('data-state');
  if (state !== 'streaming') throw new Error(`expected the chart while streaming, bubble is ${state}`);
  v.note(`streaming: chart drawn while the bubble is "${state}", series ${await chart.getAttribute('data-series')}`);
  await settle(page);
  await v.shot('chart-streaming');
  await advance(page, 60_000);
  await bubble.and(page.locator('[data-state="complete"]')).waitFor();
  v.note(
    `complete: captions ${await bubble.getByTestId(TID.kitDropped).count()}, code blocks ${await bubble.getByTestId(TID.bubbleCode).count()}`,
  );

  // 2. Compare with last month: the tap is the user's message; the reply updates the same chart.
  await bubble.getByTestId(TID.kitButton).click();
  await page.getByTestId(TID.bubbleMe).filter({ hasText: 'Compare with last month' }).waitFor();
  v.note('tap: "Compare with last month" shows as the user\'s message');
  await showUp(page, page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Last month was dearer every day.' }));
  await chart.and(page.locator('[data-series="2"]')).waitFor();
  const turn = (v.fakeTurns() as FakeTurn[]).find((x) => x.purpose === 'intake' && x.prompt.includes('action compare_last_month'));
  if (!turn?.prompt.includes('"route":"BOM-GOI"')) throw new Error('the AI was not told the action context');
  v.note(
    `kit.action: the AI read action compare_last_month with context {"route":"BOM-GOI"}; chart now has ${await chart.getAttribute('data-series')} series, key ${await chart.getByRole('listitem').allTextContents()}`,
  );
  await settle(page);
  await v.shot('after', `[data-testid="${TID.threadLog}"]`);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('after-dark', `[data-testid="${TID.threadLog}"]`);
}
