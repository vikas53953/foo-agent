// Spec: 05-1 §5.3, §5.4, 05-2 §5.5, §5.7, §5.8 (the five M5 card roots), 05-1 §0.5 (gated status edge), 08-0 §C (test ids),
// §G.2 (card states), §G.7 (a Draft's approvals row), CR-0009 (test:card.seed). foo-verify journey for M5 T1: seed one card
// of each new type into the foo chat through the FOO_TEST seed hook (the real db.tx path) and see each root render with its
// type and state, light and dark. The cards are stubs; T2/T4/T5/T6 draw them. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m5-t1-contracts.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import type { CardSeedRequest } from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld, rest, setTheme, settle } from '../fidelity/capture';

const SEEDS: { tid: keyof typeof TID; seed: CardSeedRequest }[] = [
  {
    tid: 'cardChoice',
    seed: { type: 'choice', state: 'asking', payload: { question: 'Which flight time works for Delhi?', purpose: 'pick' } },
  },
  { tid: 'cardTiles', seed: { type: 'tiles', state: 'asking', payload: { question: 'Which hotel looks right?' } } },
  {
    tid: 'cardApproval',
    seed: {
      type: 'approval',
      state: 'PENDING',
      payload: { title: 'Book this table?', approvalId: '' },
      approval: { fields: { verb: 'book', siteDomain: 'example.in', partySize: 4, irreversible: false } },
    },
  },
  {
    tid: 'cardDraft',
    seed: {
      type: 'draft',
      state: 'pending',
      payload: { approvalId: '', channel: 'email', body: 'Hi, the rent is sent.', edited: false, sendAllowed: true },
      approval: { fields: { verb: 'send', channel: 'email', irreversible: true } },
    },
  },
  { tid: 'cardSecret', seed: { type: 'secret', state: 'asking', payload: { name: 'OpenAI key', kind: 'ai_key' } } },
];

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await openChat(page, 'foo');
  await setTheme(page, 'light');

  for (const { tid, seed } of SEEDS) {
    const r = await page.evaluate((s) => window.__fooTest!.cardSeed(s), seed);
    const root = page.locator(`${byTid(TID[tid])}[data-card-id="${r.cardId}"]`);
    await root.waitFor({ timeout: 5_000 });
    const [type, state] = await Promise.all([root.getAttribute('data-card-type'), root.getAttribute('data-card-state')]);
    if (type !== seed.type || state !== seed.state) throw new Error(`${TID[tid]}: type ${type}, state ${state}`);
    v.note(
      `${seed.type} card seeded (${seed.state}${r.approvalId ? `, approvals row ${seed.approval!.fields.verb}` : ''}) → ${TID[tid]} renders with data-card-type="${type}" data-card-state="${state}"`,
    );
  }

  // Chromium snaps a 1.5px border to whole device pixels (1px at 100% scale), so the check is the --accent colour on top
  // only, against the 1px --line edge the other cards keep.
  const edges = await page.locator(`${byTid(TID.cardApproval)}, ${byTid(TID.cardDraft)}, ${byTid(TID.cardChoice)}`).evaluateAll((els) => {
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    const probe = document.createElement('i');
    probe.style.color = accent;
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return els.map((e) => [
      e.getAttribute('data-card-type'),
      getComputedStyle(e).borderTopColor === want,
      getComputedStyle(e).borderBottomColor === want,
    ]);
  });
  const wrong = edges.filter(([type, top, bottom]) => bottom || top !== (type !== 'choice'));
  if (wrong.length) throw new Error(`gated edges wrong: ${JSON.stringify(edges)}`);
  v.note('the PENDING Approval and the pending Draft both carry the --accent gated top edge; the Choice card does not');

  await rest(page);
  await settle(page);
  await v.shot('foo-five-m5-cards');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('foo-five-m5-cards');
}
