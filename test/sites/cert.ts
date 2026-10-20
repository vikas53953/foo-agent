// Spec: 08-3 §22.5 (test sites: a local HTTPS server). The sandbox makes its own self-signed certificate when it starts,
// so the repo holds no key and needs no openssl: an EC P-256 key from node:crypto and a hand-written DER X.509 v3 with
// the sandbox host names as subjectAltName. Test use only; the key never leaves memory.
import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';

export interface SandboxCert {
  key: string;
  cert: string;
  /** SHA-256 of the DER, `AA:BB:…` (what Chromium's certificate-error event reports). */
  fingerprint256: string;
  /** base64 SHA-256 of the public key (SPKI), for Chromium's `--ignore-certificate-errors-spki-list`. */
  spkiSha256: string;
}

const tlv = (tag: number, body: Buffer): Buffer => {
  const n = body.length;
  const len = n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
  return Buffer.concat([Buffer.from([tag]), len, body]);
};
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const set = (...parts: Buffer[]) => tlv(0x31, Buffer.concat(parts));
const oid = (dotted: string): Buffer => {
  const [a, b, ...rest] = dotted.split('.').map(Number) as [number, number, ...number[]];
  const bytes = [a * 40 + b];
  for (const v of rest) {
    const chunk = [v & 0x7f];
    for (let x = v >> 7; x > 0; x >>= 7) chunk.unshift((x & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
};
const utcTime = (d: Date) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const ipBytes = (ip: string) => Buffer.from(ip.split('.').map(Number));

const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'));

/** A fresh self-signed server certificate for `hosts` (DNS names) plus 127.0.0.1, valid from a day ago for 30 days. */
export function makeSandboxCert(hosts: readonly string[], now = new Date()): SandboxCert {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const name = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from('foo sandbox')))));
  const day = 86_400_000;
  const altNames = seq(...hosts.map((h) => tlv(0x82, Buffer.from(h))), tlv(0x87, ipBytes('127.0.0.1')));
  const extensions = tlv(
    0xa3,
    seq(
      seq(oid('2.5.29.17'), tlv(0x04, altNames)),
      seq(oid('2.5.29.37'), tlv(0x04, seq(oid('1.3.6.1.5.5.7.3.1')))),
      seq(oid('2.5.29.19'), tlv(0x04, seq())),
    ),
  );
  const serial = createHash('sha256').update(String(now.getTime())).digest().subarray(0, 8);
  // DER INTEGER: positive and minimal (a leading 0x00 byte would be illegal padding).
  serial[0] = (serial[0]! & 0x7f) | 0x40;
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, serial),
    ECDSA_SHA256,
    name,
    seq(utcTime(new Date(now.getTime() - day)), utcTime(new Date(now.getTime() + 30 * day))),
    name,
    spki,
    extensions,
  );
  const signature = sign('sha256', tbs, privateKey);
  const der = seq(tbs, ECDSA_SHA256, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])));
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n');
  const cert = `-----BEGIN CERTIFICATE-----\n${b64.trimEnd()}\n-----END CERTIFICATE-----\n`;
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    cert,
    fingerprint256: new X509Certificate(cert).fingerprint256,
    spkiSha256: createHash('sha256').update(spki).digest('base64'),
  };
}
