// Spec: AT-018 (a WhatsApp message goes out only after its Draft card and a Send tap), AT-054 (foo never posts to X: Open in
// X opens X's compose page with the text), AT-070 (a group needs the full Approval card), AT-269 part 2 (the mirror composer
// drafts into foo's chat; the fake phone records 0 outbound), 05-2 §5.7 (WhatsApp and X Draft card variants), 08-2 §9.4 ("Can
// I use WhatsApp for this?" once per job), 08-3 §16.3, §16.4. foo-verify journey for M8 T7 on the ux-world seed with the
// FOO_TEST fake phone (it records every outbound message) and the fake AI; light and dark. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m8-t7-wa-x.journey.ts
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { FAKE_WA } from '../../src/wa-bridge/fakeSocket';
import { waitForDraft } from '../e2e/m8-drafts-world';
import type { FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const MOM = FAKE_WA.people[0];
const GROUP = FAKE_WA.groups[0];
const ASK_MOM = 'message Mom on WhatsApp that I reached safely';
const ASK_POST = 'write a post for X about the power cut';
const MOM_TEXT = 'Reached safely, Ma. Will call you at 8.';
const POST = 'Third power cut in Indiranagar this week. Anyone else?';

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const tool = (name: string, args: Record<string, unknown>) => act({ kind: 'tool', call: { tool: name, args }, why: 'next' });
const job = (ask: string, title: string, channel: string): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: ask },
  reply: act({
    kind: 'job',
    title,
    plan: [{ phraseKey: 'draft', slots: { channel }, route: 'api' }],
    estimate: { minutes: 1 },
    routeHint: ['api'],
    needsApps: [],
  }),
});

function script(): FakeLine[] {
  return [
    { match: { purpose: 'verify' }, reply: 'ready', once: false },
    { match: { purpose: 'second_look' }, reply: `<say></say><act>${JSON.stringify({ match: true })}</act>`, once: false },
    job(ASK_MOM, 'Message Mom', 'message'),
    // The first call meets "Can I use WhatsApp for this?"; after Yes the step asks again and the call runs.
    { match: { purpose: 'step' }, reply: tool('whatsapp.draft', { to: 'Mom', text: MOM_TEXT }) },
    { match: { purpose: 'step' }, reply: tool('whatsapp.draft', { to: 'Mom', text: MOM_TEXT }) },
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }) },
    { match: { purpose: 'step' }, reply: act({ kind: 'done', result: 'The message is ready for you below.', unverified: true }) },
    job(ASK_POST, 'Post about power cut', 'post'),
    { match: { purpose: 'step' }, reply: tool('x.draft', { text: POST }) },
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }) },
    { match: { purpose: 'step' }, reply: act({ kind: 'done', result: 'The post is ready for you below.', unverified: true }) },
  ];
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

async function both(v: Verify, page: Page, name: string, sel?: string): Promise<void> {
  await rest(page);
  await settle(page);
  await v.shot(name, sel);
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot(name, sel);
  await setTheme(page, 'light');
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: script() });
  await openWorld(app, page, '2026-10-16T11:01:00+05:30');
  await windowSize(app, page, 1440, 900);
  await setTheme(page, 'light');
  const outbound = () => app.evaluate(() => (globalThis as { __fooWaOutbound?: { jid: string }[] }).__fooWaOutbound ?? []);
  const opened = () => app.evaluate(() => (globalThis as { __fooOpenedExternal?: string[] }).__fooOpenedExternal ?? []);

  // 0 · link the fake phone (Settings → Connections → Link WhatsApp → scan).
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.settingsNavConnections).click();
  const row = page.getByTestId(TID.settingsRowConnectionsWhatsapp);
  await row.getByRole('button', { name: t('settings.connections.whatsapp.link') }).click();
  const dialog = page.getByTestId(TID.dialogLinkWhatsapp);
  await dialog.getByTestId(TID.cardConnectQr).waitFor({ timeout: 15_000 });
  check((await page.evaluate(() => window.__fooTest!.wa({ op: 'scan' }))).delivered, 'the fake phone did not scan');
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
  await row.and(page.locator('[data-state="linked"]')).waitFor();
  await page.keyboard.press('Escape');
  v.note('linked the FOO_TEST fake phone from Settings → Connections (it knows Mom and two groups)');

  // 1 · "message Mom": the Choice "Can I use WhatsApp for this?", then the Draft card; nothing goes out.
  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);
  const before = await log.locator(byTid(TID.cardDraft)).count();
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK_MOM);
  await page.keyboard.press('Enter');
  const question = t('cards.choice.question.app_use', { app: 'WhatsApp' });
  const choice = log.locator(byTid(TID.cardChoice)).filter({ hasText: question }).last();
  for (let i = 0; i < 80 && !(await choice.count()); i++) {
    await advance(page, 500);
    await page.waitForTimeout(50);
  }
  await choice.waitFor();
  await both(v, page, 'app-use-choice', `${byTid(TID.cardChoice)}[data-card-id="${await choice.getAttribute('data-card-id')}"]`);
  await choice.getByText(t('cards.choice.option.yes'), { exact: true }).click();
  const momId = await waitForDraft(page, before);
  const momSel = `${byTid(TID.cardDraft)}[data-card-id="${momId}"]`;
  const mom = page.locator(momSel);
  await mom.scrollIntoViewIfNeeded();
  check((await mom.textContent())!.includes(t('cards.draft.to_whatsapp', { name: MOM.name })), 'the To line is not "Mom (WhatsApp)"');
  check(
    (await mom.getByTestId(TID.cardDraftSend).textContent())!.includes(t('cards.draft.button.send_message')),
    'Primary is not Send message',
  );
  await advance(page, 60_000);
  check((await outbound()).length === 0, 'a WhatsApp message went out with no tap');
  await both(v, page, 'wa-draft-pending', momSel);
  v.note(
    `"${ASK_MOM}" → "${question}" (Yes) → a Draft card "To ${t('cards.draft.to_whatsapp', { name: MOM.name })}", Primary "Send message"; a minute later the fake phone has sent nothing (AT-018)`,
  );

  // 2 · Send → 5 s undo → ✓ Sent; the phone acks delivered → "Proof: Delivered".
  await mom.getByTestId(TID.cardDraftSend).click();
  await mom.and(page.locator('[data-card-state="undo_window"]')).waitFor();
  await v.shot('wa-undo-window', momSel);
  await advance(page, 6_000);
  await mom.and(page.locator('[data-card-state="sent"]')).waitFor({ timeout: 15_000 });
  for (let i = 0; i < 40 && !(await mom.getByTestId(TID.threadProofChip).count()); i++) {
    await advance(page, 500);
    await page.waitForTimeout(50);
  }
  const chip = (await mom.getByTestId(TID.threadProofChip).textContent()) ?? '';
  check(chip.includes(t('cards.proof_chip.chip.wa_delivered')), `the proof chip reads "${chip}"`);
  const sent = await outbound();
  check(sent.length === 1 && sent[0]!.jid === MOM.jid, `the fake phone sent ${JSON.stringify(sent)}`);
  await both(v, page, 'wa-sent-delivered', momSel);
  v.note(`Send → "Sending in 5…" + Undo → 5 s later "✓ Sent" and "${chip}"; the fake phone sent exactly one message, to Mom`);

  // 3 · an X post: the counter, Open in X opens x.com/intent/post with the text; foo never posts.
  const beforeX = await log.locator(byTid(TID.cardDraft)).count();
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK_POST);
  await page.keyboard.press('Enter');
  const xId = await waitForDraft(page, beforeX);
  const xSel = `${byTid(TID.cardDraft)}[data-card-id="${xId}"]`;
  const x = page.locator(xSel);
  await x.scrollIntoViewIfNeeded();
  const left = t('cards.draft.x_chars_left', { n: 280 - POST.length });
  check((await x.textContent())!.includes(left), `the X counter is not "${left}"`);
  check(!(await x.textContent())!.includes(t('cards.draft.row_label.to')), 'the X draft has a To row');
  await both(v, page, 'x-draft-pending', xSel);
  await x.getByTestId(TID.cardDraftSend).click();
  await x.and(page.locator('[data-card-state="opened_in_app"]')).waitFor({ timeout: 10_000 });
  await log.getByText(t('cards.draft.x_opened_line')).waitFor();
  const urls = await opened();
  check(urls.at(-1) === `https://x.com/intent/post?text=${encodeURIComponent(POST)}`, `opened ${urls.join(', ')}`);
  await both(v, page, 'x-opened', xSel);
  v.note(
    `"${ASK_POST}" → an X draft with "${left}"; Open in X to post opened ${urls.at(-1)} and the card reads "Opened in X · not posted by foo" (AT-054)`,
  );

  // 4 · the mirror composer: a group Draft card in foo's chat, the marker and Open; nothing goes out.
  await openChat(page, GROUP.name);
  await page.getByTestId(TID.composerField).fill('Water is off from 10 to 12 tomorrow.');
  await page.keyboard.press('Enter');
  const marker = page.getByTestId(TID.threadMarker).filter({ hasText: t('thread.wa_mirror.draft_made', { agentName: 'foo' }) });
  await marker.waitFor({ timeout: 10_000 });
  await both(v, page, 'mirror-marker');
  const groupCard = await marker.getAttribute('data-card-id');
  await marker.getByTestId(TID.threadMarkerLink).click();
  const g = page.locator(`${byTid(TID.cardDraft)}[data-card-id="${groupCard}"]`);
  await g.waitFor();
  await g.getByTestId(TID.cardDraftSend).click();
  await g.getByTestId(TID.cardDraftWaiting).waitFor();
  const full = log.locator(byTid(TID.cardApproval)).last();
  await full.waitFor();
  check(
    ((await full.textContent()) ?? '').includes(t('cards.approval.send_whatsapp.title', { name: GROUP.name })),
    'the full Approval card does not name the group',
  );
  await advance(page, 10_000);
  check((await outbound()).length === 1, 'the mirror or the group draft sent a message');
  await full.scrollIntoViewIfNeeded();
  await both(v, page, 'group-full-approval');
  v.note(
    `typing in "${GROUP.name}" → "Draft ready in foo's chat." with Open → foo's chat at the group draft; its Send waits on the full Approval card "${t('cards.approval.send_whatsapp.title', { name: GROUP.name })}" and the fake phone still has only Mom's message (AT-269, AT-070)`,
  );
}
