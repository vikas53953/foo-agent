// Spec: 08-3 §22.5 (the sandbox makes its own self-signed certificate when it starts). The serial is a DER INTEGER: a
// leading 0x00 byte is "illegal padding" to OpenSSL, which failed the sandbox start about once in 500 runs.
import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeSandboxCert } from '../sites/cert';

describe('08-3 §22.5 sandbox certificate', () => {
  it('parses for every start time (serial never has a leading zero byte)', () => {
    for (let i = 0; i < 400; i++) {
      const c = makeSandboxCert(['example.test'], new Date(1_760_000_000_000 + i));
      expect(new X509Certificate(c.cert).subjectAltName).toContain('DNS:example.test');
    }
  });
});
