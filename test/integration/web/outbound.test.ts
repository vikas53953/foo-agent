// Spec: 08-2 §8.3.12 b (every outbound query, URL, goal and argument passes the Redactor; a hit removes it before sending; a
// hit in a URL path or host blocks the call: CLOUD_SECRET_BLOCKED), §11.4 R11, 08-2 §8.2 web.fetch (query params named
// token|key|code|sig|… stripped), AT-140.
import { describe, expect, it } from 'vitest';
import { cloudOutbound } from '../../../src/engine/tools/web/cloudOutbound';
import { CANARY_KEY, CANARY_VAULT, makeRedactor } from '../../fakes/web/net';

describe('cloud.outbound (R11)', () => {
  const r = makeRedactor();
  const scrub = (t: string): { text: string; hits: number } => r.scrub(t);

  it('AT-140 removes a vault canary and a pattern canary from a query before sending', () => {
    const out = cloudOutbound(scrub, { text: { query: `italian food near ${CANARY_VAULT} key ${CANARY_KEY}` } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text.query).not.toContain(CANARY_VAULT);
    expect(out.text.query).not.toContain(CANARY_KEY);
    expect(out.text.query).not.toContain('[hidden]');
    expect(out.text.query).toContain('italian food near');
  });

  it('AT-140 a canary in a URL host or path blocks the call with CLOUD_SECRET_BLOCKED', () => {
    expect(cloudOutbound(scrub, { urls: { url: `https://example.org/u/${CANARY_VAULT}/page` } })).toEqual({
      ok: false,
      kind: 'CLOUD_SECRET_BLOCKED',
    });
    expect(cloudOutbound(scrub, { urls: { url: `https://${CANARY_VAULT.toLowerCase()}.example.org/` } })).toEqual({
      ok: false,
      kind: 'CLOUD_SECRET_BLOCKED',
    });
  });

  it('strips secret-named query params, userinfo and the fragment; scrubs other param values', () => {
    const out = cloudOutbound(scrub, {
      urls: { url: `https://me:pw@example.org/menu?token=abc123&sig=zz&page=2&q=${CANARY_VAULT}#frag` },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.urls.url).toBe('https://example.org/menu?page=2');
  });

  it('an outbound payload never carries a canary in any field', () => {
    const out = cloudOutbound(scrub, {
      text: { goal: `compare menus ${CANARY_VAULT}` },
      urls: { startUrl: `https://example.org/?q=${CANARY_KEY}` },
    });
    expect(JSON.stringify(out)).not.toContain(CANARY_VAULT);
    expect(JSON.stringify(out)).not.toContain(CANARY_KEY);
  });
});
