// Spec: 08-0 §E.4 (CSP: media reach the page only through app:), 08-1 §4.1 storage map (attachments in {DATA}\data\inbox\,
// draft copies in {DATA}\data\drafts\, voice notes in {DATA}\data\voice\; the database foo.db with WAL). M2 review S2: the
// app://media host serves only the media folders, after resolving symlinks, and never the database, WAL/SHM or settings.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mediaFile } from '../../src/main/windows/protocol';

let base = '';
let data = '';
const p = (url: string) => new URL(url).searchParams.get('p') ?? '';

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'foo-media-'));
  data = join(base, 'foo');
  for (const d of ['data/inbox', 'data/voice', 'data/drafts/c_1', 'logs']) mkdirSync(join(data, d), { recursive: true });
  writeFileSync(join(data, 'data/inbox/att_1-photo.svg'), '<svg/>');
  writeFileSync(join(data, 'data/voice/m_1.webm'), 'x');
  writeFileSync(join(data, 'data/drafts/c_1/att_2-a.png'), 'x');
  for (const f of ['data/foo.db', 'data/foo.db-wal', 'data/foo.db-shm', 'settings.json', 'logs/main.log'])
    writeFileSync(join(data, f), 'secret');
  writeFileSync(join(base, 'outside.txt'), 'secret');
  // A file named like the database inside a media folder is refused too.
  writeFileSync(join(data, 'data/inbox/foo.db'), 'secret');
  symlinkSync(join(data, 'data/foo.db'), join(data, 'data/inbox/att_3-db.svg'));
  symlinkSync(join(data, 'settings.json'), join(data, 'data/voice/m_2.webm'));
  symlinkSync(join(base, 'outside.txt'), join(data, 'data/inbox/att_4-out.svg'));
  symlinkSync(join(data, 'logs'), join(data, 'data/inbox/logs'), 'dir');
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('app://media serves only the media folders (review S2)', () => {
  it('serves attachments, voice notes and draft copies, relative or absolute', () => {
    expect(mediaFile(data, 'data/inbox/att_1-photo.svg')).toMatch(/att_1-photo\.svg$/);
    expect(mediaFile(data, 'data\\voice\\m_1.webm')).toMatch(/m_1\.webm$/);
    expect(mediaFile(data, join(data, 'data/drafts/c_1/att_2-a.png'))).toMatch(/att_2-a\.png$/);
  });

  it('refuses the database, WAL/SHM, settings, logs and anything outside the media folders', () => {
    for (const f of ['data/foo.db', 'data/foo.db-wal', 'data/foo.db-shm', 'settings.json', 'logs/main.log', 'data/inbox/foo.db'])
      expect(mediaFile(data, f), f).toBeNull();
    expect(mediaFile(data, 'data/inbox/missing.svg')).toBeNull();
    expect(mediaFile(data, 'data/inbox')).toBeNull();
  });

  it('follows symlinks and refuses those that lead out of the media folders', () => {
    expect(mediaFile(data, 'data/inbox/att_3-db.svg')).toBeNull();
    expect(mediaFile(data, 'data/voice/m_2.webm')).toBeNull();
    expect(mediaFile(data, 'data/inbox/att_4-out.svg')).toBeNull();
    expect(mediaFile(data, 'data/inbox/logs/main.log')).toBeNull();
  });

  it('refuses encoded traversal in the URL', () => {
    for (const url of [
      'app://media/?p=data%2Finbox%2F..%2F..%2Fsettings.json',
      'app://media/?p=data%2Finbox%2F..%2Ffoo.db',
      'app://media/?p=data%5Cinbox%5C..%5Cfoo.db',
      'app://media/?p=..%2Foutside.txt',
      'app://media/?p=data%2Finbox%2F%252e%252e%2Ffoo.db',
      'app://media/?p=data%2Finbox%2F%2e%2e%2Ffoo.db',
      `app://media/?p=${encodeURIComponent(join(base, 'outside.txt'))}`,
      'app://media/?p=data%2Finbox%2Fatt_1-photo.svg%00.db',
    ])
      expect(mediaFile(data, p(url)), url).toBeNull();
    expect(mediaFile(data, p('app://media/?p=data%2Finbox%2Fatt_1-photo.svg'))).toMatch(/att_1-photo\.svg$/);
  });
});
