// Spec: 08-2 §5.10 items 4 and 6 (pre-call cap check on every key call; web tools at the cap use the local path instead of
// waiting; free-tier calls still priced), §8.3.12 e, 08-4 §27.3 item 5 (cost rows; a row with no price fields → cost_source
// 'unknown', cost_paise NULL, the call still runs, logged pricing.missing), AT-143.
import { describe, expect, it } from 'vitest';
import { priceWebCall } from '../../../src/engine/tools/web/cost';
import { WebTools } from '../../../src/engine/tools/web/WebTools';
import type { SpendMeter, WebTurnRow } from '../../../src/engine/tools/web/types';
import { fakeExa } from '../../fakes/web/exa';
import { fakeFirecrawl } from '../../fakes/web/firecrawl';
import { EXA_KEY_SETTINGS, FakeNet, FakePage, fixture, html, keys, world } from '../../fakes/web/net';

const ctx = { chatId: 'c_1', jobId: 'j_1', toolCallId: 'tc_c' };

/** M4-T3's meter as the AT states it: cap ₹1,000, ₹999 spent before, plus every web row written since. */
function meter(turns: WebTurnRow[]): SpendMeter & { spent: () => number } {
  const spent = (): number => 99_900 + turns.reduce((s, t) => s + (t.cost_paise ?? 0), 0);
  return { spent, wouldCross: (est) => spent() + est > 100_000 };
}

describe('web cost and the AI cap', () => {
  it('AT-143 AI cap ₹1,000 with ₹999 spent: a cloud search that would cross the cap is not called, the local path is used, and the meter includes every earlier cloud call', async () => {
    const turns: WebTurnRow[] = [];
    const m = meter(turns);
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    const page = new FakePage(() => fixture('bing.html'));
    const w = world({
      net,
      page,
      meter: m,
      recordTurn: (r) => void turns.push(r),
      settings: () => EXA_KEY_SETTINGS,
      keys: keys({ exa: 'k' }),
    });
    const tools = new WebTools(w.deps);
    const via: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await tools.search({ query: `q${i}` }, ctx);
      via.push(r.ok ? r.via : r.errorKind);
    }
    // Exa = $0.005 × 88 × 100 = 44 paise: 99,900 → 99,944 → 99,988; the third (100,032) would cross.
    expect(via).toEqual(['exa', 'exa', 'this_pc']);
    expect(net.to('api.exa.ai')).toHaveLength(2);
    expect(page.loads).toHaveLength(1);
    expect(m.spent()).toBe(99_988);
    expect(w.logs).toContain('web.cap_local');
  });

  it('AT-143 a cloud read at the cap is not called either', async () => {
    const turns: WebTurnRow[] = [];
    const net = new FakeNet().on('api.firecrawl.dev', fakeFirecrawl()).on('news.example.test', () => html(fixture('news.html')));
    const w = world({
      net,
      meter: { wouldCross: () => true },
      recordTurn: (r) => void turns.push(r),
      settings: () => ({ ...EXA_KEY_SETTINGS, read: 'firecrawl' }),
      keys: keys({ firecrawl: 'k' }),
    });
    const r = await new WebTools(w.deps).fetch({ url: 'https://news.example.test/a' }, ctx);
    expect(r.ok && r.via).toBe('this_pc');
    expect(net.to('api.firecrawl.dev')).toEqual([]);
    expect(turns).toEqual([]);
  });

  it('prices: per call, per step, missing fields count 0 only beside another field, none → unknown', () => {
    const pricing = { usdToInr: 88, web: { exa: { perCallUsd: 0.005 }, browseruse: { perCallUsd: 0.002, perStepUsd: 0.01 } } };
    expect(priceWebCall(pricing, 'exa')).toEqual({ paise: 44, source: 'priced' });
    expect(priceWebCall(pricing, 'browseruse', 5)).toEqual({ paise: Math.ceil(0.052 * 8800), source: 'priced' });
    expect(priceWebCall(pricing, 'tavily')).toEqual({ paise: null, source: 'unknown' });
  });

  it('a web row with no price fields still runs, writes cost_source unknown and logs pricing.missing', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    const w = world({ net, pricing: { usdToInr: 88, web: {} }, settings: () => EXA_KEY_SETTINGS, keys: keys({ exa: 'k' }) });
    const r = await new WebTools(w.deps).search({ query: 'cafe' }, ctx);
    expect(r.ok && r.via).toBe('exa');
    expect(w.turns).toMatchObject([{ cost_paise: null, cost_source: 'unknown' }]);
    expect(w.logs).toContain('pricing.missing');
  });
});
