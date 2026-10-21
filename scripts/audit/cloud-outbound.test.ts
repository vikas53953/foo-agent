// Spec: 08-2 §8.3.12 (cloud outbound redaction choke point); this fixture sends no network request.
import { describe, expect, it } from 'vitest';
import { cloudOutbound } from '../../src/engine/tools/web/cloudOutbound';

const scrub = (text: string) => ({
  text: text.replace(/fixture-secret/gu, '[hidden]'),
  hits: text.includes('fixture-secret') ? 1 : 0,
});

describe('production cloud outbound boundary', () => {
  it('removes secret query fields and free-text markers', () => {
    const safe = cloudOutbound(scrub, {
      urls: { model: 'https://api.anthropic.com/v1/messages?token=fixture-secret' },
      text: { prompt: 'hello fixture-secret' },
    });
    expect(safe).toEqual({
      ok: true,
      urls: { model: 'https://api.anthropic.com/v1/messages' },
      text: { prompt: 'hello' },
    });
  });

  it('blocks a secret-bearing host or path before a request can be made', () => {
    expect(cloudOutbound(scrub, { urls: { model: 'https://fixture-secret.example.test/send' } })).toEqual({
      ok: false,
      kind: 'CLOUD_SECRET_BLOCKED',
    });
  });
});
