// Spec: 10-acceptance-1 AT-027 ("thanks!" → foo adds a 👍 reaction and posts no message), AT-030 (an answer arrives as at
// most 3 bubbles, no bubble splitting a list), AT-006 (no AI passes a test → the composer stays disabled with the not-set-up
// placeholder; 04-2 §20.4 / §23.1 copy "Connect your AI first", implementation-notes M3 item 11), 10-acceptance-2 ART-23a
// (ack messages get a reaction only). 04 §3.3 (ticks: ✓✓ when the lane accepts it, Clock while it waits to send), §4.1
// rule 4 / §4.2 (👀 `seen` on the first byte, gone when the first word shows), §12.3 (every reply is one bubble, never split,
// CR-0024 F2), §14.3 (Thinking row
// while a request is in flight), §14.4 (Stop keeps the text with "Stopped."), §19.4 (cut-off reply: "Try again"), 08-4
// §25.5 item 2 (the engine's 1.5 s release gate on the injected Clock), 08-3 §22.3 (the fake AI). Every reply comes from the
// fake AI (FOO_FAKE_AI); no test reaches a real AI or the network. The ux-world seed (08-3 §22.9) supplies a verified AI and
// the chats; in a FOO_FAKE_AI run every turn goes to the fake whatever the settings name (AiService header).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import type { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

const byTid = (id: string) => `[data-testid="${id}"]`;
/** The engine's hold before a reply streams (08-4 §25.5 item 2). */
const HOLD_MS = 1500;

interface Run {
  app: ElectronApplication;
  page: Page;
  dirs: ReturnType<typeof testDirs>;
}

async function start(lines: FakeLine[], o: { seed?: boolean } = {}): Promise<Run> {
  const { app, dirs } = await launchWithFakeAi(lines);
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  if (o.seed !== false) {
    const { refs } = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
    await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
    await settleSeededJobs(page, refs);
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.waitForFunction(() => window.innerWidth === 1280);
  await recordEvents(page);
  return { app, page, dirs };
}

/** Records the message and typing patches the window receives, in order (the 👀 badge lives for a few ms only). */
async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __events: { ch: string; p: unknown }[] };
    w.__events = [];
    for (const ch of ['message:upsert', 'message:delta', 'chat:typing'] as const)
      window.foo.on(ch, (p) => w.__events.push({ ch, p: JSON.parse(JSON.stringify(p)) }));
  });
}
type Ev = { ch: string; p: { id?: string; authorKind?: string; status?: string; badge?: string | null; text?: string; on?: boolean } };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Ev[] }).__events);

async function openChat(page: Page, name: string) {
  await page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) })
    .first()
    .click();
  await expect(page.getByTestId(TID.chatHeaderName)).toContainText(name);
  await expect(page.getByTestId(TID.composerField)).toBeVisible();
}

const field = (page: Page) => page.getByTestId(TID.composerField);
const fooBubbles = (page: Page) => page.getByTestId(TID.bubbleFoo);
const round = (page: Page) => page.getByTestId(TID.composerSend);

/** Types the text and presses Enter; returns the new user message's id and its row (found by id: the list is virtual). */
async function send(page: Page, text: string) {
  const seen = (await events(page)).length;
  await field(page).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  const id = await page.waitForFunction(
    ([from, txt]) =>
      (window as unknown as { __events: Ev[] }).__events
        .slice(from as number)
        .find((e) => e.ch === 'message:upsert' && e.p.authorKind === 'user' && e.p.text === txt)?.p.id,
    [seen, text] as const,
  );
  const messageId = (await id.jsonValue()) as string;
  const row = page.locator(`${byTid(TID.threadLog)} [data-message-id="${messageId}"]`);
  await expect(row.getByTestId(TID.bubbleMe)).toBeVisible();
  return { id: messageId, row };
}

/** Every patch for one message, in order. */
async function patchesOf(page: Page, id: string) {
  return (await events(page)).filter((e) => e.ch === 'message:upsert' && e.p.id === id).map((e) => e.p);
}

/**
 * `ai:verify` through the real IPC, repeated until the engine is up and the fake answered it (before the engine connects,
 * main answers on its own and nothing reaches the fake). Returns the verify the fake answered.
 */
async function verifyLive(page: Page, dirs: Run['dirs'], providerId: 'fake' | 'claude-cli') {
  const before = fakeTurns(dirs).filter((x) => x.purpose === 'verify').length;
  for (let i = 0; i < 50; i++) {
    const r = await page.evaluate((id) => window.foo.invoke('ai:verify', { providerId: id }), providerId);
    if (fakeTurns(dirs).filter((x) => x.purpose === 'verify').length > before) return r;
    await page.waitForTimeout(200);
  }
  throw new Error('the engine never answered ai:verify');
}

/** Moves main's fake clock (the engine follows it, testHooks test:clock). */
const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

test('AT-027 · "thanks!" gets a 👍 and no message', async () => {
  test.info().annotations.push({
    type: 'AT-027',
    description: '**Given** the user sends "thanks!", **then** foo adds a 👍 reaction and posts no message.',
  });
  const { app, page, dirs } = await start([intake('thanks!', '', { decision: { kind: 'react', emoji: '👍' } })]);
  await openChat(page, 'foo');
  const foo = await fooBubbles(page).count();
  const { id, row } = await send(page, 'thanks!');
  await expect(row.getByTestId(TID.bubbleReaction).first()).toContainText('👍');
  await expect(page.getByTestId(TID.threadThinking)).toHaveCount(0);
  expect(await fooBubbles(page).count()).toBe(foo);
  const evs = await events(page);
  expect(evs.filter((e) => e.ch === 'message:upsert' && e.p.authorKind !== 'user')).toEqual([]);
  // ✓✓ delivered once the lane took it (04 §3.3); the reaction took the badge slot (04 §4.1 rule 5).
  expect((await patchesOf(page, id)).some((p) => p.status === 'complete')).toBe(true);
  const turns = fakeTurns(dirs).filter((x) => x.purpose === 'intake');
  expect(turns).toHaveLength(1);
  expect(turns[0]!.matchedLine).toBe(1);
  await app.close();
});

test('ART-23a · ack messages get a reaction only', async () => {
  const acks = ['thanks', 'ok', 'cool', '👍'];
  // One react line per ack, used in file order (each line once): the fake does not care which ack it is.
  const { app, page, dirs } = await start(acks.map(() => ({ ...intake('', '', { decision: { kind: 'react', emoji: '👍' } }) })));
  await openChat(page, 'Trips');
  for (const ack of acks) {
    const { id, row } = await send(page, ack);
    await expect(row.getByTestId(TID.bubbleReaction).first()).toContainText('👍');
    await expect(page.getByTestId(TID.threadThinking)).toHaveCount(0);
    expect((await patchesOf(page, id)).at(-1)?.badge ?? null).toBeNull();
  }
  const evs = await events(page);
  expect(evs.filter((e) => e.ch === 'message:upsert' && e.p.authorKind !== 'user')).toEqual([]);
  const turns = fakeTurns(dirs).filter((x) => x.purpose === 'intake');
  expect(turns.map((x) => x.matchedLine)).toEqual([1, 2, 3, 4]);
  acks.forEach((ack, i) => expect(turns[i]!.prompt).toContain(ack));
  await app.close();
});

/** Seven short paragraphs, ≤ 600 characters in all: chat mode (04 §12.3). */
const SEVEN = [
  'Yes, the Goa trip is booked.',
  'You fly out on Sat 12 Dec at 6:10 AM.',
  'The stay is at Taj Holiday Village.',
  'Check-in is from 2:00 PM.',
  'I put both dates in your calendar.',
  'Packing list is in Trips.',
  'Tell me if you want a cab to the airport.',
];

test('AT-030 · a 7-paragraph answer arrives as one bubble (at most 3), and no bubble splits a list', async () => {
  test.info().annotations.push({
    type: 'AT-030',
    description: '**Given** a 200-word answer, **then** it arrives as at most 3 bubbles, with no bubble splitting a list.',
  });
  // A 200-word answer with a list: over 600 characters, so one bubble that never splits (04 §12.3 "anything else").
  const items = Array.from(
    { length: 12 },
    (_, i) => `- Day ${i + 1}: beach in the morning, a slow lunch, a walk by the fort, dinner at the shack`,
  );
  const long = ['Here is the Goa plan for the long week.', items.join('\n'), 'I can book the cabs for each day if you like.'].join('\n\n');
  expect(long.split(/\s+/).length).toBeGreaterThanOrEqual(200);
  const { app, page } = await start([intake('Goa plan?', SEVEN.join('\n\n')), intake('whole week', long)]);
  await openChat(page, 'foo');

  // Chat mode: the whole reply came inside the 1.5 s hold (no clock moved); it shows as one bubble (CR-0024 F2).
  await send(page, 'Is the Goa plan? done');
  const reply = await page.waitForFunction(
    () => (window as unknown as { __events: Ev[] }).__events.find((e) => e.ch === 'message:upsert' && e.p.authorKind === 'foo')?.p,
  );
  const foo = (await reply.jsonValue()) as Ev['p'];
  expect(foo.status).toBe('complete');
  expect(foo.text).toBe(SEVEN.join('\n\n'));
  const parts = page.locator(`${byTid(TID.threadLog)} [data-message-id="${foo.id}"] ${byTid(TID.bubbleFoo)}`);
  await expect(parts).toHaveCount(1);
  await page.waitForTimeout(3_000);
  await expect(parts).toHaveCount(1);
  for (const p of SEVEN) await expect(parts).toContainText(p);

  // The 200-word answer with a list: one bubble, the list whole inside it.
  const { id } = await send(page, 'and the whole week?');
  const longReply = await page.waitForFunction(
    (from) =>
      (window as unknown as { __events: Ev[] }).__events.find(
        (e) => e.ch === 'message:upsert' && e.p.authorKind === 'foo' && e.p.status === 'complete' && e.p.id !== from,
      )?.p.id,
    foo.id,
  );
  const longId = (await longReply.jsonValue()) as string;
  expect(longId).not.toBe(id);
  const longParts = page.locator(`${byTid(TID.threadLog)} [data-message-id="${longId}"] ${byTid(TID.bubbleFoo)}`);
  await expect(longParts).toHaveCount(1);
  await page.waitForTimeout(3_000);
  await expect(longParts).toHaveCount(1);
  await expect(longParts.locator('li')).toHaveCount(items.length);
  await app.close();
});

test('AT-006 · no verified AI keeps the composer disabled', async () => {
  test.info().annotations.push({
    type: 'AT-006',
    description:
      '**Given** no AI passes a test, **then** the composer stays disabled with "Connect your AI first, then we can talk." and no step after J2 is reachable.',
  });
  // The fake answers every verify with an error: no AI passes its test.
  const { app, page, dirs } = await start([{ match: { purpose: 'verify' }, error: 'AI_SERVICE_DOWN', once: false }], { seed: false });
  const composer = page.getByTestId(TID.composer);
  const notSetUp = t('composer.placeholder.not_set_up');
  await expect(round(page)).toHaveAttribute('data-state', 'disabled');
  await expect(composer).toContainText(notSetUp);

  // The Test AI's test fails (ai:detect is not called: it would probe the real rungs on this machine).
  const verify = await verifyLive(page, dirs, 'fake');
  expect(verify.ok && verify.value.ok).toBe(false);
  const choose = await page.evaluate(() => window.foo.invoke('ai:choose', { primary: 'fake' }));
  expect(choose.ok ? null : choose.error.kind).toBe('AI_NOT_VERIFIED');

  // Still disabled: not focusable, not editable, the round button disabled, the not-set-up placeholder.
  await expect(round(page)).toHaveAttribute('data-state', 'disabled');
  await expect(composer).toContainText(notSetUp);
  await expect(field(page)).toHaveAttribute('contenteditable', 'false');
  await expect(field(page)).toHaveAttribute('aria-disabled', 'true');
  await field(page).click({ force: true });
  await page.keyboard.type('hello');
  await page.keyboard.press('Enter');
  await expect(field(page)).toHaveText('');
  expect(fakeTurns(dirs).filter((x) => x.purpose === 'intake')).toEqual([]);
  await app.close();
});

test('AT-006 · a message sent while the AI fails its test waits to send, then goes when it passes', async () => {
  // ux-world's AI was verified; its re-test fails once, then passes.
  const { app, page, dirs } = await start([
    { match: { purpose: 'verify' }, error: 'AI_SERVICE_DOWN' },
    VERIFY_OK,
    intake('are you there', 'Yes, I’m here.'),
  ]);
  await openChat(page, 'foo');
  const down = await verifyLive(page, dirs, 'claude-cli');
  expect(down.ok && down.value.ok).toBe(false);
  const { id, row } = await send(page, 'are you there?');
  // 04 §3.3: saved, Clock tick ("Waiting to send"); no turn reached the AI.
  await expect(row.getByTestId(TID.bubbleTick)).toHaveAttribute('data-state', 'waiting');
  await page.waitForTimeout(1_000);
  expect(fakeTurns(dirs).filter((x) => x.purpose === 'intake')).toEqual([]);
  expect((await patchesOf(page, id)).at(-1)?.status).toBe('queued');

  const up = await page.evaluate(() => window.foo.invoke('ai:verify', { providerId: 'claude-cli' }));
  expect(up.ok && up.value.ok).toBe(true);
  await expect(page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Yes, I’m here.' })).toBeVisible();
  // CR-0024 F9: foo answered it, so it stays ✓✓ read after the 👀 clears.
  await expect(row.getByTestId(TID.bubbleTick)).toHaveAttribute('data-state', 'read');
  expect(fakeTurns(dirs).filter((x) => x.purpose === 'intake')).toHaveLength(1);
  await app.close();
});

test('a reply: ✓✓, 👀 on the first byte, the Thinking row while it is in flight, then the bubble streams in', async () => {
  const say = 'Diwali is on Sun 8 Nov. Banks are closed on Mon 9 Nov too. Shall I add both to your calendar?';
  const { app, page } = await start([intake('next holiday', say, { delayMs: 3_000 })]);
  await openChat(page, 'foo');
  const { id } = await send(page, 'when is the next holiday?');
  const thinking = page.getByTestId(TID.threadThinking);
  await expect(thinking).toBeVisible();
  // "typing…" in foo's chat-list row (03-shell-1 §3.4.6 rule 1). The header's status line shows it only when no higher row
  // applies; in ux-world foo's chat has a Needs-you job (row 2), which wins (03-shell-2 §3.6.2.1).
  const fooRow = page
    .getByTestId(TID.chatlistRow)
    .filter({ has: page.getByTestId(TID.chatlistRowName).getByText('foo', { exact: true }) })
    .first();
  await expect(fooRow.getByTestId(TID.chatlistRowPreview)).toContainText(t('chatlist.row.preview.typing'));
  await expect(round(page)).toHaveAttribute('data-state', 'stop');
  expect((await patchesOf(page, id)).some((p) => p.status === 'complete')).toBe(true);

  // Past the 1.5 s hold the gate streams sentence by sentence; then the fake's reply comes (all of it at once).
  await advance(page, HOLD_MS + 100);
  await expect(thinking).toBeVisible();
  await advance(page, 3_000);
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Diwali is on Sun 8 Nov.' });
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText('Shall I add both to your calendar?');
  await expect(bubble).toHaveAttribute('data-state', 'complete');
  await expect(thinking).toHaveCount(0);
  await expect(round(page)).toHaveAttribute('data-state', 'mic');
  // 04 §1.8: a finished text row is announced once as "{sender}: {text}" (cards use 05-1 §0.7's line instead).
  await expect(page.getByTestId(TID.appAnnouncer).locator('[aria-live="polite"]')).toHaveText(
    t('bubble.row.announce_new', { sender: 'foo', text: say }),
  );

  const evs = await events(page);
  const fooEv = evs.filter((e) => e.ch === 'message:upsert' && e.p.authorKind === 'foo');
  expect(fooEv[0]?.p.status).toBe('streaming');
  expect(fooEv.at(-1)?.p.status).toBe('complete');
  expect(fooEv.at(-1)?.p.text).toBe(say);
  expect(evs.filter((e) => e.ch === 'message:delta').length).toBeGreaterThanOrEqual(3);
  // The user's message: ✓✓ complete → 👀 seen on the first byte → badge cleared once foo's first word shows.
  const mine = evs.filter((e) => e.ch === 'message:upsert' && e.p.id === id).map((e) => e.p);
  const seenAt = mine.findIndex((p) => p.badge === 'seen');
  expect(mine.findIndex((p) => p.status === 'complete')).toBeLessThanOrEqual(seenAt);
  expect(seenAt).toBeGreaterThanOrEqual(0);
  expect(mine.at(-1)?.badge ?? null).toBeNull();
  const order = evs.map((e) =>
    e.ch === 'message:upsert' && e.p.id === id && e.p.badge === 'seen'
      ? 'seen'
      : e.ch === 'message:upsert' && e.p.authorKind === 'foo'
        ? 'foo'
        : null,
  );
  expect(order.indexOf('seen')).toBeLessThan(order.indexOf('foo'));
  await app.close();
});

test('Stop while foo is thinking ends the reply and posts nothing; Esc does the same', async () => {
  const { app, page, dirs } = await start([
    intake('slow one', 'This answer never comes.', { delayMs: 60_000 }),
    intake('slow two', 'This one neither.', { delayMs: 60_000 }),
  ]);
  await openChat(page, 'foo');
  const thinking = page.getByTestId(TID.threadThinking);

  const first = await send(page, 'a slow one please');
  await expect(thinking).toBeVisible();
  await expect(round(page)).toHaveAttribute('data-state', 'stop');
  await expect(round(page)).toHaveAttribute('aria-label', /Stop/);
  await round(page).click();
  await expect(thinking).toHaveCount(0);
  await expect(round(page)).toHaveAttribute('data-state', 'mic');
  expect((await patchesOf(page, first.id)).at(-1)?.badge ?? null).toBeNull();

  const second = await send(page, 'a slow two please');
  await expect(thinking).toBeVisible();
  await field(page).focus();
  await page.keyboard.press('Escape');
  await expect(thinking).toHaveCount(0);
  expect((await patchesOf(page, second.id)).at(-1)?.badge ?? null).toBeNull();

  // Nothing late: the fake's timers fire after the stop and no text is posted (08-4 §30.7).
  await advance(page, 61_000);
  await page.waitForTimeout(500);
  expect((await events(page)).filter((e) => e.ch === 'message:upsert' && e.p.authorKind !== 'user')).toEqual([]);
  expect(fakeTurns(dirs).filter((x) => x.purpose === 'intake')).toHaveLength(2);
  await app.close();
});

// 04 §14.4: Stopped text stays with a caption line "Stopped.". The fake streams its first sentences, then waits (CR-0007
// `chunks`), so the reply is on screen and still in flight when Stop is pressed.
test('Stop keeps the text that already showed, with "Stopped." under it', async () => {
  const { app, page, dirs } = await start([
    {
      match: { purpose: 'intake', promptIncludes: 'long story' },
      chunks: [
        { text: '<say>Here is the first part. It is already on screen. ' },
        { text: 'This part never comes.</say>', delayMs: 60_000 },
      ],
    },
  ]);
  await openChat(page, 'foo');
  await send(page, 'tell me a long story');
  // The turn starts on the engine's own schedule: wait until the fake took it, then move the clock past the hold until
  // the first part shows (a single advance can land before the turn started on a slow runner).
  await expect.poll(() => fakeTurns(dirs).filter((x) => x.purpose === 'intake').length).toBeGreaterThan(0);
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Here is the first part.' });
  await expect
    .poll(async () => {
      await advance(page, HOLD_MS + 100);
      return bubble.count();
    })
    .toBeGreaterThan(0);
  await expect(bubble).toBeVisible();
  await expect(round(page)).toHaveAttribute('data-state', 'stop');
  await round(page).click();
  await expect(bubble.getByTestId(TID.bubbleStopped)).toHaveText(t('bubble.stopped.caption'));
  await expect(bubble).toHaveAttribute('data-state', 'complete');
  await expect(round(page)).toHaveAttribute('data-state', 'mic');
  await advance(page, 61_000);
  await page.waitForTimeout(500);
  await expect(page.getByText('This part never comes.')).toHaveCount(0);
  expect(fakeTurns(dirs).filter((x) => x.purpose === 'intake')).toHaveLength(1);
  await app.close();
});

test('a cut-off reply shows "Try again", and Try again answers', async () => {
  const { app, page, dirs } = await start([
    intake('train times', '', { error: 'AI_TIMEOUT' }),
    intake('train times', 'The 7:10 AM Deccan Queen gets to Mumbai by 10:25 AM.'),
  ]);
  await openChat(page, 'foo');
  await send(page, 'train times to Mumbai?');
  const cut = page.locator(`${byTid(TID.bubbleFoo)}[data-state="failed"]`);
  await expect(cut).toBeVisible();
  await expect(cut).toContainText(t('bubble.error.cut_off'));
  const retry = cut.getByTestId(TID.bubbleErrorRetry);
  await expect(retry).toHaveText(t('bubble.error.retry'));
  await expect(page.getByTestId(TID.threadThinking)).toHaveCount(0);
  await retry.click();
  await expect(page.getByTestId(TID.bubbleFoo).filter({ hasText: 'Deccan Queen' })).toBeVisible();
  expect(
    fakeTurns(dirs)
      .filter((x) => x.purpose === 'intake')
      .map((x) => x.matchedLine),
  ).toEqual([1, 2]);
  await app.close();
});

test('Hindi and Punjabi replies render in their own script', async () => {
  const hi = 'केक का ऑर्डर हो गया है। Sun 18 Oct, 11:00 AM तक पहुँच जाएगा।';
  const pa = 'ਕੇਕ ਆਰਡਰ ਹੋ ਗਿਆ। Sun 18 Oct, 11:00 AM ਤੱਕ ਪਹੁੰਚ ਜਾਵੇਗਾ।';
  const { app, page } = await start([intake('केक कब', hi), intake('ਕੇਕ ਕਦੋਂ', pa)]);
  await openChat(page, 'foo');
  for (const [ask, say, lang] of [
    ['मम्मी को केक कब मिलेगा?', hi, 'hi'],
    ['ਮੰਮੀ ਨੂੰ ਕੇਕ ਕਦੋਂ ਮਿਲੇਗਾ?', pa, 'pa'],
  ] as const) {
    const { row } = await send(page, ask);
    await expect(row.getByTestId(TID.bubbleMe)).toContainText(ask);
    const bubble = page
      .getByTestId(TID.bubbleFoo)
      .filter({ hasText: say.slice(0, 12) })
      .last();
    await expect(bubble).toContainText(say);
    await expect(bubble).toHaveAttribute('lang', lang);
    // 02 F1 --t-body-indic (SV-07): the taller Indic line.
    expect(await bubble.locator('[data-copy]').evaluate((el) => getComputedStyle(el).lineHeight)).toBe('24px');
  }
  await app.close();
});

// 04 §14.3 / UX-08-02 "The header face does the same": the chat header's face takes the Thinking mood while foo is typing
// (02-2 §F15.9.3, store selectChatMood).
test('the chat header face thinks while foo replies', async () => {
  const { app, page } = await start([intake('header face', 'Here.', { delayMs: 60_000 })]);
  try {
    await openChat(page, 'foo');
    await send(page, 'header face check');
    await expect(page.getByTestId(TID.threadThinking)).toBeVisible();
    await expect(page.getByTestId(TID.chatHeaderAvatar).locator('[data-mood="thinking"]')).toHaveCount(1, { timeout: 3_000 });
  } finally {
    await app.close();
  }
});

test('M4 T8 · foo’s reply carries the test clock set before the engine started', async () => {
  // 08-3 §22: the engine's fake clock follows main's. Set it to 9:41 AM IST as soon as the window has the test hooks,
  // before the engine forks (ready + 300 ms): the hello on engine start must carry it (main's engine-supervisor/hello).
  const at = Date.parse('2026-10-16T04:11:00.000Z');
  const { app } = await launchWithFakeAi([intake('what time', 'Here you go.')]);
  const page = await app.firstWindow();
  await page.waitForFunction(() => Boolean(window.__fooTest));
  await page.evaluate((n) => window.__fooTest!.clock.set(n), at);
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const { refs } = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await settleSeededJobs(page, refs);
  await recordEvents(page);
  await openChat(page, 'foo');
  const { row } = await send(page, 'what time');
  const reply = await page.waitForFunction(
    () =>
      (window as unknown as { __events: { ch: string; p: { authorKind?: string; status?: string; createdAt?: number } }[] }).__events.find(
        (e) => e.ch === 'message:upsert' && e.p.authorKind === 'foo' && e.p.status === 'complete',
      )?.p,
  );
  const foo = (await reply.jsonValue()) as { id: string; createdAt: number };
  expect(foo.createdAt).toBeGreaterThanOrEqual(at);
  const meta = (r: typeof row) => r.getByTestId(TID.bubbleMeta).first();
  const fooRow = page.locator(`${byTid(TID.threadLog)} [data-message-id="${foo.id}"]`);
  await expect(meta(row)).toContainText('9:41');
  await expect(meta(fooRow)).toContainText('9:41');
  await app.close();
});
