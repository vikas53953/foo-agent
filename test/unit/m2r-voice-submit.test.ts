// Spec: 04-2 §22.1 / 08-3 §18.1 (the recorder's WebM/Opus is staged with files:stage, then voice:submit makes it a voice note
// in {DATA}\data\voice\), §22.6 (the type check every other staged file passes). M2 review S4: only a recording this flow
// staged (the recorder's name, a WebM/Ogg header, a voice mime) may become a voice note; a staged PDF or photo never does.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Inbox, isRecorderFile } from '../../src/main/data/inbox';

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);

describe('voice:submit takes only the recorder’s own staging (review S4)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foo-voice-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const inbox = new Inbox(dir);

  it('a WebM or Ogg recording staged by the recorder becomes data/voice/{messageId}.*', () => {
    expect(inbox.stage('att_w', 'voice.webm', WEBM)).toMatchObject({ ok: true, attachment: { mime: 'audio/webm' } });
    expect(inbox.isRecording('att_w')).toBe(true);
    expect(inbox.moveToVoice('att_w', 'm_1')).toBe('data/voice/m_1.webm');
    expect(existsSync(join(dir, 'data/voice/m_1.webm'))).toBe(true);
    expect(inbox.stage('att_o', 'voice.ogg', OGG).ok).toBe(true);
    expect(inbox.moveToVoice('att_o', 'm_2')).toBe('data/voice/m_2.ogg');
  });

  it('a staged PDF or photo is never a voice note, and stays where it was', () => {
    expect(inbox.stage('att_p', 'ticket.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])).ok).toBe(true);
    expect(inbox.stage('att_i', 'beach.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])).ok).toBe(true);
    expect(inbox.isRecording('att_p')).toBe(false);
    expect(inbox.moveToVoice('att_p', 'm_3')).toBeNull();
    expect(inbox.moveToVoice('att_i', 'm_4')).toBeNull();
    expect(inbox.get('att_p')).toBeDefined();
    expect(existsSync(join(dir, 'data/voice/m_3.pdf'))).toBe(false);
  });

  it('a .webm/.ogg that is not the recorder’s (other name or no header) gets no voice exception', () => {
    expect(isRecorderFile('voice.webm', new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(false);
    expect(isRecorderFile('song.ogg', OGG)).toBe(false);
    // Disguised as the recorder's name but not a WebM file: the §22.6 type check applies and the id is no recording.
    const fake = inbox.stage('att_f', 'voice.webm', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    if (fake.ok) expect(inbox.moveToVoice('att_f', 'm_5')).toBeNull();
    // An ordinary .ogg attachment may be staged as a file (§22.6 allows audio) but is not a voice note.
    const song = inbox.stage('att_s', 'song.ogg', OGG);
    if (song.ok) expect(inbox.moveToVoice('att_s', 'm_6')).toBeNull();
  });

  it('an unknown id is not a recording', () => {
    expect(inbox.isRecording('att_missing')).toBe(false);
    expect(inbox.moveToVoice('att_missing', 'm_7')).toBeNull();
  });
});
