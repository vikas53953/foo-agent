// Spec: 04 §13.5 (a kit surface in foo's reply; an unknown component is dropped with "Couldn't show part of this" and the
// words still show), 04 §13.6 (an AI page block), CR-0022 AT-354 (parser half), X-180.
// foo-verify journey for R1 T1, real app on the seeded world with the fake AI: (1) a reply whose a2ui block holds an
// unknown component shows its words and the caption; (2) a valid block reaches the kit placeholder with both messages
// parsed and no caption; (3) a page block reaches the page placeholder in state "ready". T2 and T5 replace the
// placeholders with the drawn surface and the sealed frame.
// Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/r1-t1-contracts.journey.ts
import type { Locator, Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { TID } from '../../src/shared/testids';
import { intake } from '../e2e/fakeAi';
import { settleSeededJobs } from '../e2e/m4-start';
import { openChat, openWorld, setTheme, settle } from '../fidelity/capture';

const HOLD_MS = 1500;
const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const unknown =
  '{"updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"Column","children":["h"]},{"id":"h","component":"Hologram"}]}}';
const chart =
  '{"updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"LineChart","variant":"line","series":[{"label":"Goa","points":[{"x":"Mon","y":4200},{"x":"Tue","y":3900}]}]}]}}';

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function showUp(page: Page, loc: Locator) {
  for (let i = 0; i < 60 && (await loc.count()) === 0; i++) {
    await advance(page, HOLD_MS + 100);
    await page.waitForTimeout(500);
  }
  await loc.first().waitFor({ state: 'attached' });
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
      intake('hologram', `Here are this week's Goa fares.\n\n\`\`\`a2ui\n${create}\n${unknown}\n\`\`\``),
      intake('fares chart', `Fares are falling.\n\n\`\`\`a2ui\n${create}\n${chart}\n\`\`\``),
      intake('budget tool', 'Here is a small budget tool.\n\n```page\n<!doctype html><p>Food budget</p>\n```'),
    ],
  });
  await settleSeededJobs(page, await openWorld(app, page));
  await setTheme(page, 'light');
  await openChat(page, 'foo');
  await settle(page);
  await v.shot('before');

  // 1. Unknown component: the words show, the caption sits under the surface, the code fence is not shown as code.
  await send(page, 'show the hologram of fares');
  const first = page.getByTestId(TID.bubbleFoo).filter({ hasText: "Here are this week's Goa fares." });
  await showUp(page, first);
  const dropped = first.getByTestId(TID.kitDropped);
  await dropped.waitFor();
  v.note(
    `unknown component: caption "${(await dropped.textContent())?.trim()}", code blocks ${await first.getByTestId(TID.bubbleCode).count()}`,
  );
  v.note(`unknown component: messages parsed ${await first.getByTestId(TID.kitSurface).getAttribute('data-messages')}`);
  await settle(page);
  await v.shot('dropped-caption');

  // 2. A valid block: both messages parsed, no caption.
  await send(page, 'fares chart please');
  const second = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Fares are falling.' });
  await showUp(page, second);
  const surface = second.getByTestId(TID.kitSurface);
  await surface.waitFor({ state: 'attached' });
  v.note(
    `valid block: messages ${await surface.getAttribute('data-messages')}, captions ${await second.getByTestId(TID.kitDropped).count()}`,
  );

  // 3. A page block: the placeholder is ready once the reply ends.
  await send(page, 'make me a budget tool');
  const third = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Here is a small budget tool.' });
  await showUp(page, third);
  const pageBlock = third.getByTestId(TID.aiPage);
  await pageBlock.waitFor({ state: 'attached' });
  v.note(`page block: state ${await pageBlock.getAttribute('data-state')}, code blocks ${await third.getByTestId(TID.bubbleCode).count()}`);
  await settle(page);
  await v.shot('after');
}
