// Shared start for the M8 T6 email specs (m8-drafts e2e, the UX-16 M8 steps, the foo-verify journey): a fake Google on
// 127.0.0.1 (FOO_FAKE_GOOGLE: Gmail read + drafts, People) and a fake AI script that turns "reply to my landlord…" into a job
// whose step calls `gmail.draft` (08-2 §8.2), so the Draft card is made by the real engine tool, main's DraftService and the
// real Gmail drafts port. Made-up people and addresses only (example.com).
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { byTid } from '../fidelity/capture';
import { fakePeople, peopleState } from '../fakes/connectors/contacts';
import { draftsState, fakeGmailDrafts, type FakeDraftsState } from '../fakes/connectors/gmail';
import { fakeGmailRead, gmailState, serveFakeGoogle, type FakeGmailState } from '../fakes/connectors/gmail-read';
import type { FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

export const LANDLORD = { name: 'Rakesh Sharma', address: 'r.sharma@example.com' };
export const NEW_PERSON = { name: 'priya.new@example.com', address: 'priya.new@example.com' };
export const ASK_LANDLORD = 'reply to my landlord saying I’ll pay rent on Monday';
export const ASK_NEW = 'email priya.new@example.com about the Goa dates';
export const LANDLORD_BODY = 'Hi Rakesh, I’ll pay October’s rent on Mon 19 Oct. Thanks for your patience. Vikas';
export const NEW_BODY = 'Hi Priya, we’re in Goa Sat 12 – Mon 14 Dec. Vikas';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const tool = (name: string, args: Record<string, unknown>) => act({ kind: 'tool', call: { tool: name, args }, why: 'next' });

/** One job: draft one email (the AI names the person; the engine resolves the address). */
function draftJob(ask: string, title: string, args: Record<string, unknown>, delayMs: number): FakeLine[] {
  return [
    {
      match: { purpose: 'intake', promptIncludes: ask },
      reply: act({
        kind: 'job',
        title,
        plan: [{ phraseKey: 'draft', slots: { channel: 'email' }, route: 'api' }],
        estimate: { minutes: 1 },
        routeHint: ['api'],
        needsApps: [],
      }),
    },
    { match: { purpose: 'step' }, reply: tool('gmail.draft', args), delayMs },
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs },
    // 08-2 §5.8 has no proof kind for "draft made" (the send's proof is the Draft card's own), so the AI says unverified.
    {
      match: { purpose: 'step' },
      reply: act({ kind: 'done', result: 'The draft is ready for you below.', unverified: true }),
      delayMs,
    },
  ];
}

/**
 * The fake AI lines for the asks, in order (step lines are taken in order, so a run makes the drafts in this order);
 * `delayMs` holds each step so a journey can take pictures.
 */
export function draftsScript(jobs: ('landlord' | 'new')[] = ['landlord', 'new'], delayMs = 0): FakeLine[] {
  const lines: FakeLine[] = [
    { match: { purpose: 'verify' }, reply: 'ready', once: false },
    // 08-2 §9.6: the second look on the card text before drafts.send finds the names and dates match.
    { match: { purpose: 'second_look' }, reply: `<say></say><act>${JSON.stringify({ match: true })}</act>`, once: false },
  ];
  for (const j of jobs)
    lines.push(
      ...(j === 'landlord'
        ? draftJob(ASK_LANDLORD, 'Reply to landlord', { to: [LANDLORD.name], body: LANDLORD_BODY, replyToMessageId: 'm_rent' }, delayMs)
        : draftJob(ASK_NEW, 'Email Priya', { to: [NEW_PERSON.address], subject: 'Goa dates', body: NEW_BODY }, delayMs)),
    );
  return lines;
}

export interface DraftsGoogle {
  url: string;
  mail: FakeGmailState;
  drafts: FakeDraftsState;
  requests: { method: string; path: string }[];
  close(): Promise<void>;
}

/** The fake Google: Rakesh is in Contacts and in the inbox (his "October rent" email) and in Sent (emailed before). */
export async function draftsGoogle(): Promise<DraftsGoogle> {
  const base = gmailState();
  const mail = gmailState({
    messages: [
      ...base.messages,
      {
        id: 'm_rent',
        threadId: 't_rent',
        from: `${LANDLORD.name} <${LANDLORD.address}>`,
        to: 'tester@example.com',
        subject: 'October rent',
        internalDate: Date.parse('2026-10-15T10:00:00+05:30'),
        snippet: 'Hi, just checking on October’s rent.',
        text: 'Hi, just checking on October’s rent.',
      },
      {
        id: 'm_sent_rakesh',
        threadId: 't_old',
        from: 'tester@example.com',
        to: LANDLORD.address,
        subject: 'September rent',
        internalDate: Date.parse('2026-09-15T10:00:00+05:30'),
        snippet: 'Paid.',
        text: 'Paid.',
        labels: ['SENT'],
      },
    ],
  });
  const people = peopleState();
  people.people.push({ resourceName: 'people/c5', name: LANDLORD.name, emails: [LANDLORD.address] });
  const drafts = draftsState();
  const g = await serveFakeGoogle([fakeGmailDrafts(drafts, mail), fakeGmailRead(mail), fakePeople(people)]);
  return { url: g.url, mail, drafts, requests: g.requests, close: () => g.close() };
}

/** Launches the app on the fake AI and the fake Google. */
export async function launchDrafts(google: DraftsGoogle, lines: FakeLine[] = draftsScript()): Promise<ElectronApplication> {
  const dirs = testDirs();
  const script = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return launch(dirs, [], { FOO_FAKE_AI: script, FOO_FAKE_GOOGLE: google.url });
}

/** Types the ask in the open chat and moves the fake clock until a Draft card for it shows. */
export async function askForDraft(page: Page, ask: string): Promise<string> {
  const before = await page.getByTestId(TID.threadLog).locator(byTid(TID.cardDraft)).count();
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ask);
  await page.keyboard.press('Enter');
  return waitForDraft(page, before);
}

/** Moves the fake clock until the chat holds more than `before` Draft cards; the new card's id. */
export async function waitForDraft(page: Page, before: number): Promise<string> {
  const log = page.getByTestId(TID.threadLog);
  for (let i = 0; i < 80; i++) {
    if ((await log.locator(byTid(TID.cardDraft)).count()) > before) break;
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await page.waitForTimeout(50);
  }
  const card = log.locator(byTid(TID.cardDraft)).nth(before);
  await card.waitFor({ timeout: 5_000 });
  return (await card.getAttribute('data-card-id'))!;
}

/** Moves main's fake clock in small steps (the send tick and the 5 s undo run on it). */
export async function advance(page: Page, ms: number): Promise<void> {
  for (let at = 0; at < ms; at += 500) {
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await page.waitForTimeout(40);
  }
}
