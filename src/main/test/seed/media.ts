// Spec: 08-3 §22.9 (seed sets are generated deterministically; test builds only), 08-1 §4.3 purge rule (attachments
// live at `{DATA}\data\inbox\{attachmentId}-{name}`, voice notes at `{DATA}\data\voice\{messageId}.*`), 04 §10.1–§10.4
// (the bubbles that show them). The seeds write small stand-in files so the bubbles have something to load.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { insideDir } from '../../windows/protocol';

export type SeedMedia = { path: string; kind: 'image'; label: string; hue: number } | { path: string; kind: 'voice'; ms: number };

/** A flat-colour picture with a caption, as SVG (no raster encoder in main). */
export function seedSvg(label: string, hue: number): string {
  const safe = label.replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">` +
    `<rect width="640" height="480" fill="hsl(${hue} 45% 62%)"/>` +
    `<circle cx="480" cy="140" r="70" fill="hsl(${(hue + 40) % 360} 70% 80%)"/>` +
    `<path d="M0 380 L200 240 L360 360 L460 300 L640 420 L640 480 L0 480 Z" fill="hsl(${hue} 35% 35%)"/>` +
    `<text x="32" y="64" font-family="Segoe UI, sans-serif" font-size="36" fill="#fff">${safe}</text></svg>`
  );
}

/** A quiet 16-bit mono WAV of `ms` (8 kHz; a soft 220 Hz tone so a player has something to play). */
export function seedWav(ms: number): Buffer {
  const rate = 8000;
  const n = Math.round((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 1500), 44 + i * 2);
  return buf;
}

/** Writes the seed's media under `dataDir`; paths that would leave it are skipped. */
export function writeSeedMedia(dataDir: string, media: readonly SeedMedia[]): number {
  let written = 0;
  for (const m of media) {
    const file = insideDir(dataDir, m.path);
    if (!file) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, m.kind === 'image' ? seedSvg(m.label, m.hue) : seedWav(m.ms));
    written++;
  }
  return written;
}
