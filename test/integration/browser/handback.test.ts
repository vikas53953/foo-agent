// Spec: AT-142 (asked to pay on a netbanking site → foo does not open it in its own window: the error card says "This is your
// bank's site. I'll open it for you, and you do this part." and [ Open {site} ] opens the user's default browser), 08-2
// §8.3.10 (hand-back sites are never driven; the step is handed back), 08-1 §3.2 (`app:openExternal { target: 'handback_site' }`
// only with an https address the matcher catches and the id + nonce of the card that offers it; else URL_NOT_ALLOWED).
// Driven on the sandbox bank (`netbanking.sandbank.test`, caught by the production matcher with no test override).
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadHandback, openExternalHandback } from '../../../src/main/ipc/openExternalHandback';
import { jobHarness, jobIntake, tool, type JobHarness } from '../jobs/jobHarness';
import { bookingWorld, type BookingWorld } from './booking';

let h: JobHarness | null = null;
let w: BookingWorld | null = null;
afterEach(async () => {
  h?.close();
  h = null;
  await w?.close();
  w = null;
});

const handback = loadHandback(resolve(__dirname, '../../../resources'));

async function payOnBank(): Promise<{ h: JobHarness; url: string; card: Record<string, unknown> }> {
  w = await bookingWorld();
  const url = w.sb.url('handback', '/pay?amount=500');
  h = jobHarness({
    script: [
      jobIntake([{ phraseKey: 'check_site', slots: { site: 'netbanking.sandbank.test' }, route: 'browser' }], { title: 'Pay the bill' }),
      tool('browser.open', { url }),
    ],
    browser: w.browser,
  });
  h.userSays('Pay my electricity bill on my bank site');
  await h.settle(20);
  const card = h.cards('error')[0]!;
  return { h, url, card };
}

describe('hand-back (08-2 §8.3.10) · a bank site is handed back', () => {
  it('browser.open on a netbanking site → no window, job failed, the hand-back card with [ Open site ]', async () => {
    const x = await payOnBank();
    const call = x.h.toolCalls().find((c) => c.tool === 'browser.open')!;
    expect(call.error_kind).toBe('SITE_HANDBACK');
    // foo never opened its own window on the bank: the sandbox saw no request.
    expect((await w!.control('handback')).counters.requests ?? 0).toBe(0);
    expect(x.h.job().state).toBe('failed');
    const p = JSON.parse(String(x.card.payload)) as Record<string, unknown>;
    expect(p.kind).toBe('SITE_HANDBACK');
    expect(p.whatHappened).toBe('This is your bank’s site. I’ll open it for you, and you do this part.');
    expect(p.button).toEqual({ label: 'Open netbanking.sandbank.test', action: { kind: 'open_url', url: x.url } });
  }, 60_000);

  it('[ Open site ] opens the card’s own page only; any other address, card or nonce is URL_NOT_ALLOWED', async () => {
    const x = await payOnBank();
    const opened: string[] = [];
    const open = (u: string) => void opened.push(u);
    const id = String(x.card.id);
    const nonce = String(x.card.nonce);
    expect(await openExternalHandback(x.h.db, handback, { url: x.url, cardId: id, nonce }, open)).toEqual({ ok: true, value: undefined });
    expect(opened).toEqual([x.url]);

    const refused = [
      { url: x.url, cardId: id, nonce: 'wrong' },
      { url: x.url, cardId: 'card_missing', nonce },
      { url: x.url.replace('/pay', '/other'), cardId: id, nonce },
      { url: 'https://example.com/pay', cardId: id, nonce },
      { url: x.url.replace('https:', 'http:'), cardId: id, nonce },
      { url: x.url },
    ];
    for (const r of refused) {
      const res = await openExternalHandback(x.h.db, handback, r, open);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.kind).toBe('URL_NOT_ALLOWED');
    }
    expect(opened).toEqual([x.url]);
  }, 60_000);
});
