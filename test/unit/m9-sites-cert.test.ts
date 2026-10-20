// Spec: 08-3 §22.5 (test sites: a local HTTPS server with its own self-signed certificate). The certificate's serial is
// derived from the start time; a serial whose first byte came out 0x00 was a non-minimal DER INTEGER and OpenSSL refused
// the whole certificate ("illegal padding"), failing one sandbox start in a few hundred.
import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeSandboxCert } from '../sites/cert';

describe('sandbox certificate', () => {
  it('parses for a start time whose serial hash begins with a zero byte', () => {
    // sha256("1792454400259") starts 0x00/0x80 then a byte < 0x80: the old serial encoding was illegal for this time.
    const c = makeSandboxCert(['tablejoy.test'], new Date(1792454400259));
    expect(new X509Certificate(c.cert).subjectAltName).toContain('DNS:tablejoy.test');
  });

  it('parses across many start times', () => {
    const base = Date.UTC(2026, 9, 20);
    for (let i = 0; i < 300; i++) expect(() => makeSandboxCert(['a.test'], new Date(base + i))).not.toThrow();
  });
});
