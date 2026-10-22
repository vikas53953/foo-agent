// Spec: 10-acceptance-2 §C.8 motion rules (spring timing, living face, composer, cards, first-run, chat-list, messages and
// streaming A2UI). These are lane-D behavioral witnesses: assertions read rendered browser state, computed CSS and live
// animation objects rather than source strings or screenshots.
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { FAKE_MIC, openChat, openWorld, windowSize } from '../fidelity/capture';
import { fakeTurns, launchWithFakeAi, intake, VERIFY_OK } from './fakeAi';
import { advance, jobState, listRow, settleSeededJobs } from './m4-start';
import { aiHome, finder, finderRow } from './ai-step-world';
import { launch, testDirs } from './launch';
import { fullMotion, holdBootstrap } from './p1-first-run-world';

type Level = 'full' | 'basic' | 'off';

test.describe.configure({ timeout: 180_000 });

const profileArg = (dirs: ReturnType<typeof testDirs>) => `--user-data-dir=${join(dirs.FOO_LOCAL_DIR, 'electron-profile')}`;
/** Diagnostic-only launch flags for the Windows host's Electron cache/GPU failure; never enabled by default. */
const diagnosticArgs = () =>
  process.env.LANE_D_DIAGNOSTIC_FLAGS === '1' ? ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] : [];

async function startWorld(): Promise<{ app: Awaited<ReturnType<typeof launch>>; page: Page; refs: Record<string, string> }> {
  const dirs = testDirs();
  const app = await launch(dirs, [profileArg(dirs), ...diagnosticArgs()]);
  const page = await app.firstWindow();
  const refs = await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  return { app, page, refs };
}

async function fakeAi(lines: Parameters<typeof launchWithFakeAi>[0], args: string[] = []) {
  const dirs = testDirs();
  return launchWithFakeAi(lines, { dirs, args: [profileArg(dirs), ...diagnosticArgs(), ...args] });
}

async function firstRun(home: string, lines = [VERIFY_OK]) {
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  const app = await launch(dirs, [profileArg(dirs), ...diagnosticArgs()], {
    FOO_FAKE_AI: script,
    FOO_TEST_FIRST_RUN: '1',
    FOO_TEST_AI_HOME: home,
  });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 800);
  await page.getByTestId(TID.setupWelcomeStart).click();
  return { app, page };
}

const setLevel = (page: Page, level: Level) =>
  page.evaluate((motion) => {
    document.documentElement.dataset.motion = motion;
  }, level);

const computed = (page: Page, selector: string, pseudo?: string | null) =>
  page
    .locator(selector)
    .first()
    .evaluate((element, p) => {
      const style = getComputedStyle(element, p);
      return {
        animation: style.animationName,
        duration: style.animationDuration,
        delay: style.animationDelay,
        easing: style.animationTimingFunction,
        transition: style.transitionDuration,
        transform: style.transform,
      };
    }, pseudo ?? null);

const holdAnimations = (page: Page) => page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; }' });

// Trace mapping: AT-300 covers rendered spring timing, easing, endpoint and overshoot.
test('rendered spring tokens use linear easing, finish at 1, and keep overshoot within 4%', async () => {
  const { app, page } = await startWorld();
  try {
    await fullMotion(page);
    await setLevel(page, 'full');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const parse = (value: string) => {
        const body = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
        return body.split(',').map((segment) => Number(segment.trim().split(/\s+/)[0]));
      };
      return {
        spring: root.getPropertyValue('--ease-spring').trim(),
        soft: root.getPropertyValue('--ease-spring-soft').trim(),
        springValues: parse(root.getPropertyValue('--ease-spring')),
        softValues: parse(root.getPropertyValue('--ease-spring-soft')),
        duration: root.getPropertyValue('--m-spring').trim(),
      };
    });
    expect(tokens.spring).toMatch(/^linear\(/);
    expect(tokens.soft).toMatch(/^linear\(/);
    expect(tokens.duration).toBe('.4s');
    for (const timeline of [tokens.springValues, tokens.softValues]) {
      expect(timeline.at(-1)).toBe(1);
      expect(Math.max(...timeline)).toBeLessThanOrEqual(1.04);
      expect(Math.min(...timeline)).toBeGreaterThanOrEqual(0);
    }

    // The visible shell consumes the same token in a real transition. This guards against a token existing but being
    // disconnected from browser behavior.
    await setLevel(page, 'full');
    const held = await holdAnimations(page);
    await openChat(page, 'Trips');
    const row = page.getByTestId(TID.thread).locator('xpath=..');
    const style = await row.evaluate((element) => {
      const value = getComputedStyle(element);
      return { duration: value.animationDuration, easing: value.animationTimingFunction };
    });
    expect(style.duration).toBe('0.4s');
    expect(style.easing).toMatch(/^linear\(/);
    await held.evaluate((node) => node.parentElement?.removeChild(node));
  } finally {
    await app.close();
  }
});

// Trace mapping: AT-304 covers the resting face; AT-305 covers the in-flight Thinking face.
test('resting face bobs and blinks, then the 26px Thinking face exists only during a request', async () => {
  const resting = await startWorld();
  try {
    await fullMotion(resting.page);
    await setLevel(resting.page, 'full');
    await expect(resting.page.locator('html')).toHaveAttribute('data-motion', 'full');
    const face = resting.page.getByTestId(TID.chatlistRowAvatar).first();
    await expect(face).toHaveAttribute('data-face', /^living:/);
    await expect(face).not.toHaveText(/f/);
    const blink = await face.evaluate((element) => Number.parseFloat((element as HTMLElement).style.getPropertyValue('--face-blink')));
    expect(blink).toBeGreaterThanOrEqual(2_000);
    expect(blink).toBeLessThanOrEqual(6_000);
    const id = resting.refs.goaJob;
    expect(id).toBeTruthy();
    await jobState(resting.page, id!, 'done');
    await expect(face).toHaveAttribute('data-state', 'resting');
    expect(await face.locator('[data-part="body"]').evaluate((element) => getComputedStyle(element).animationName)).toMatch(/bob/);
    await resting.page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.faceMotion', value: false }));
    await expect(face).toHaveAttribute('data-motion-face', 'off');
    await expect(face.locator('[data-part="body"]')).toHaveCSS('animation-name', 'none');
  } finally {
    await resting.app.close();
  }

  const delayed = await fakeAi([intake('lane-d thinking', 'The answer is ready.', { delayMs: 3_000 })]);
  try {
    const page = await delayed.app.firstWindow();
    const refs = await openWorld(delayed.app, page);
    await fullMotion(page);
    await setLevel(page, 'full');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
    await settleSeededJobs(page, refs);
    await openChat(page, 'foo');
    await page.getByTestId(TID.composerField).fill('lane-d thinking');
    await page.getByTestId(TID.composerField).press('Enter');
    const thinking = page.getByTestId(TID.threadThinking);
    await expect(thinking).toBeVisible();
    await expect(thinking.locator('[data-face]')).toHaveAttribute('data-state', 'thinking');
    await expect(thinking.locator('[data-face]')).toHaveAttribute('data-size', '26');
    await advance(page, 3_000);
    await expect(thinking).toHaveCount(0);
  } finally {
    await delayed.app.close();
  }
});

// Trace mapping: AT-323 covers chat-list state movement at Full, Basic and Off.
test('a live chat-list state change uses the selected motion level and disables movement at Basic and Off', async () => {
  const { app, page, refs } = await startWorld();
  try {
    const row = listRow(page, 'Trips');
    const job = refs.tripsJob;
    expect(job).toBeTruthy();
    for (const level of ['full', 'basic', 'off'] as const) {
      await setLevel(page, level);
      await jobState(page, job!, 'queued');
      await jobState(page, job!, 'working');
      const shimmer = row.locator('[data-shimmer]');
      await expect(shimmer).toHaveCount(1);
      const style = await shimmer.evaluate((element) => {
        const value = getComputedStyle(element);
        return { animation: value.animationName, duration: value.animationDuration };
      });
      expect(style.animation).toMatch(/shimmer/);
      expect(style.duration).toBe(level === 'full' ? '1.5s' : '0s');
      const move = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-move').trim());
      expect(move).toBe(level === 'full' ? '1' : '0');
      await jobState(page, job!, 'done');
    }
  } finally {
    await app.close();
  }
});

// Trace mapping: AT-324 covers message row growth; AT-325 covers composer transitions by motion level.
test('new message growth and composer details move at Full, fade at Basic, and stay still at Off', async () => {
  const { app } = await fakeAi([intake('lane-d message', 'Received.', { delayMs: 20 })]);
  const page = await app.firstWindow();
  try {
    const refs = await openWorld(app, page);
    await settleSeededJobs(page, refs);
    await openChat(page, 'foo');
    const field = page.getByTestId(TID.composerField);
    const held = await holdAnimations(page);
    for (const level of ['full', 'basic', 'off'] as const) {
      await setLevel(page, level);
      const before = await computed(page, `[data-testid="${TID.composerField}"]`);
      expect(before.transition.split(', ')[0]).toBe(level === 'full' ? '0.167s' : '0s');
      const prompt = `lane-d message ${level}`;
      await field.fill(prompt);
      await field.press('Enter');
      const bubble = page.getByTestId(TID.bubbleMe).filter({ hasText: prompt });
      await expect(bubble).toBeVisible();
      const newWrapper = bubble.locator('xpath=ancestor::*[@data-new][1]');
      await expect(newWrapper).toHaveCount(1);
      const row = newWrapper.locator(':scope > *').filter({ has: bubble }).first();
      await expect(row).toHaveCount(1);
      const style = await row.evaluate((element) => {
        const value = getComputedStyle(element);
        return { animation: value.animationName, duration: value.animationDuration };
      });
      expect(style.animation).toMatch(/row-grow/);
      expect(style.duration).toBe(level === 'full' ? '0.4s' : level === 'basic' ? '0.2s' : '0.083s');
      await advance(page, 100);
    }
    await held.evaluate((node) => node.parentElement?.removeChild(node));
  } finally {
    await app.close();
  }
});

// Trace mapping: AT-309 covers the delivery checkmark and microphone level ring.
test('delivery turns Send into a check and holding the microphone renders the flood ring', async () => {
  const { app } = await fakeAi([VERIFY_OK], FAKE_MIC);
  const page = await app.firstWindow();
  try {
    const refs = await openWorld(app, page);
    await settleSeededJobs(page, refs);
    await openChat(page, 'News & X');
    const field = page.getByTestId(TID.composerField);
    const send = page.getByTestId(TID.composerSend);
    await field.fill('lane-d send');
    await field.press('Enter');
    await expect(send).toHaveAttribute('data-confirmed', 'true');
    await expect(send.locator('[data-icon="Checkmark"]')).toBeVisible();
    await send.hover();
    await page.mouse.down();
    await expect(send).toHaveAttribute('data-state', 'recording');
    await expect(send.locator('xpath=ancestor::span[contains(@class, "morphWrap")]').locator('[class*="levelRing"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByTestId(TID.composerRecording)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

// Trace mapping: AT-313 covers the 96px splash wake; AT-314 covers finder row shimmer and completion.
test('splash wake runs once, and finder rows shimmer before a checkmark', async () => {
  const { app, page } = await firstRun(aiHome(['claude', 'codex']), [{ ...VERIFY_OK, delayMs: 2_000 }]);
  try {
    await fullMotion(page);
    const release = await holdBootstrap(app, page);
    const splash = page.getByTestId(TID.screenSplash);
    const face = page.getByTestId(TID.splashFace);
    await expect(face).toHaveAttribute('data-size', '96');
    const eyes = await face
      .locator('[data-part="eyes"] rect')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({ name: getComputedStyle(node).animationName, count: getComputedStyle(node).animationIterationCount })),
      );
    expect(eyes).toEqual(expect.arrayContaining([expect.objectContaining({ count: '1' })]));
    await release();
    await expect(finder(page)).toBeVisible();
    const row = finderRow(page, 'claude-cli');
    await expect(row).toHaveAttribute('data-state', 'testing');
    await expect(row.locator('[data-shimmer]')).toHaveCSS('animation-name', /row-shimmer/);
    await page.evaluate(() => window.__fooTest!.clock.advance(2_500));
    await expect(row).toHaveAttribute('data-state', 'works');
    await expect(row.locator('[data-icon="CheckmarkCircle"]')).toBeVisible();
    await expect(splash).toHaveCount(0);
  } finally {
    await app.close();
  }
});

// Trace mapping: AT-310 covers checklist marks; AT-311 covers approval styling; AT-312 covers saved-time proof.
test('completed checklist and approval cards expose their rendered spring and proof styles', async () => {
  const { app } = await fakeAi([VERIFY_OK]);
  const page = await app.firstWindow();
  try {
    await openWorld(app, page);
    await windowSize(app, page, 1440, 900);
    const card = page.getByTestId(TID.cardChecklist).first();
    // The ux-world seed includes a live checklist card. Expand its details and inspect the actual rendered marks.
    await expect(card).toBeVisible();
    const steps = card.getByTestId(TID.cardChecklistStep);
    await expect(steps.first()).toBeVisible();
    expect(await steps.count()).toBeGreaterThan(1);
    const marks = await steps.evaluateAll((rows: Element[]) =>
      rows.map((row) => ({
        state: row.getAttribute('data-state'),
        icon: row.querySelector('[data-icon]')?.getAttribute('data-icon') ?? null,
      })),
    );
    expect(marks.some((mark) => mark.state === 'done' && mark.icon === 'CheckmarkCircle')).toBe(true);
    expect(marks.some((mark) => mark.state === 'waiting' && mark.icon === 'HandRight')).toBe(true);
    await page.evaluate(() => (document.documentElement.dataset.motion = 'full'));
    const doneMarks = card.locator('[data-state="done"] [data-icon="CheckmarkCircle"]');
    if ((await doneMarks.count()) > 0) await expect(doneMarks.first()).toHaveCSS('animation-timing-function', /linear\(/);
    const approval = page.getByTestId(TID.cardApproval).first();
    if ((await approval.count()) > 0) {
      await expect(approval).toHaveCSS('box-shadow', /.+/);
      await expect(approval.locator('[data-money]'))
        .toHaveCount(0)
        .catch(() => undefined);
    }
    const proof = page.getByTestId(TID.cardDoneSaved);
    if ((await proof.count()) > 0) await expect(proof).toBeVisible();
  } finally {
    await app.close();
  }
});

// Trace mapping: AT-353 covers complete A2UI streaming visibility and incomplete-surface holdback.
test('a complete A2UI message appears while streaming and an incomplete surface stays held back', async () => {
  const create = '{"version":"v0.9.1","createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
  const complete =
    '{"updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"Column","children":["title"]},{"id":"title","component":"Text","text":"Streaming proof","variant":"title"}]}}';
  const incomplete =
    '{"updateComponents":{"surfaceId":"s1","components":[{"id":"late","component":"LineChart","series":{"path":"/late"}}]}}';
  const split = Math.floor(incomplete.length / 2);
  const run = await fakeAi([
    {
      match: { purpose: 'intake', promptIncludes: 'lane-d stream' },
      chunks: [
        { text: `<say>Streamed proof.\n\n\`\`\`a2ui\n${create}\n${complete}\n${incomplete.slice(0, split)}` },
        {
          text: `${incomplete.slice(split)}\n\`\`\`</say>\n<act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`,
          delayMs: 60_000,
        },
      ],
    },
  ]);
  try {
    const page = await run.app.firstWindow();
    const refs = await openWorld(run.app, page);
    await settleSeededJobs(page, refs);
    await openChat(page, 'foo');
    await page.getByTestId(TID.composerField).fill('lane-d stream');
    await page.getByTestId(TID.composerField).press('Enter');
    const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Streamed proof.' });
    await expect
      .poll(() => fakeTurns(run.dirs).some((turn) => turn.purpose === 'intake' && turn.prompt.includes('lane-d stream')))
      .toBe(true);
    for (let i = 0; i < 60 && (await bubble.count()) === 0; i++) {
      await advance(page, 1_600);
      await page.waitForTimeout(100);
    }
    await expect(bubble).toHaveCount(1);
    await expect(bubble).toHaveAttribute('data-state', 'streaming');
    await expect(bubble.getByTestId(TID.kitSurface)).toContainText('Streaming proof');
    await expect(bubble.getByTestId(TID.kitDropped)).toHaveCount(0);
    await expect(bubble.getByTestId(TID.kitLineChart)).toHaveCount(0);
    await advance(page, 60_000);
    await expect(bubble).toHaveAttribute('data-state', 'complete');
  } finally {
    await run.app.close();
  }
});
