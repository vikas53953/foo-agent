// Spec: 08-3 §16.4.2 (who a `whatsapp.draft` goes to: (1) a jid foo has; (2) an E.164 or 10-digit Indian number →
// `91{10}@s.whatsapp.net`, checked through `wa.onWhatsApp`: not on WhatsApp → "That number isn't on WhatsApp.", bridge not
// open → "I can't check that number right now."; (3) a name → exact, then prefix, on wa_contacts and Contacts phones: one →
// that person, 0 → "Who is {Mom} on WhatsApp?" over the last chats, ≥ 2 → "Which {Mom}?" with masked numbers; someone new =
// no wa_messages row in 365 days and no wa_contacts / Contacts match), 08-2 §8.2 (`whatsapp.draft`: the engine resolves
// `to`, never the AI; groups are always the full Approval), 08-3 §16.4 Settings (`draft=false`). M8 T7: real SQLite through
// main's named queries; fake numbers only.
import { afterEach, describe, expect, it } from 'vitest';
import type { MainLink } from '../../src/engine/protocol';
import { linkWaRecipients, numberJid, resolveWaRecipient, whatsappDraftTool } from '../../src/engine/tools/connectors/recipients';
import { xTools } from '../../src/engine/tools/connectors/x';
import { createGate } from '../../src/engine/gate/GateLogic';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { PermissionApp } from '../../src/shared/types';
import type { ToolContext } from '../../src/engine/tools/ToolLayer';
import { ok, type Result } from '../../src/shared/errors';
import { makeHarness, type Harness } from '../unit/m3-engine-helpers';

const NOW = Date.UTC(2026, 9, 20, 6, 0);
const DAY = 86_400_000;
const MOM = '919800000011@s.whatsapp.net';
const MOM2 = '919800000012@s.whatsapp.net';
const RAVI = '919800000013@s.whatsapp.net';
const SOCIETY = '120363000000000001@g.us';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

function setup(check: boolean | null = true) {
  h = makeHarness({ script: [] });
  const x = h;
  const created: Record<string, unknown>[] = [];
  const opened: Record<string, unknown>[] = [];
  let seq = 0;
  const link: MainLink = {
    async request<T>(kind: string, payload: unknown): Promise<Result<T>> {
      if (kind === 'draft.create') {
        created.push(payload as Record<string, unknown>);
        return ok({ approvalId: 'ap_1', cardId: `k_${created.length}`, nonce: 'n' }) as Result<T>;
      }
      if (kind === 'draft.openX') {
        opened.push(payload as Record<string, unknown>);
        return ok(undefined) as Result<T>;
      }
      const reply = x.bridge.receive({ id: `t${++seq}`, kind: kind as 'db.query', payload } as never);
      if (!reply) throw new Error('no reply');
      return reply.result as Result<T>;
    },
    send: () => undefined,
  } as MainLink;
  const checked: string[] = [];
  const recipients = linkWaRecipients(link, {
    check: async (jid) => {
      checked.push(jid);
      return check;
    },
    now: () => NOW,
  });
  const db = x.db;
  const contact = (jid: string, name: string) =>
    db.prepare('INSERT INTO wa_contacts (jid, name, updated_at) VALUES (?, ?, 0)').run(jid, name);
  const message = (jid: string, at: number, label: string | null = null) =>
    db
      .prepare('INSERT INTO wa_messages (id, chat_jid, from_me, sender_label, text, at) VALUES (?, ?, 0, ?, ?, ?)')
      .run(`wa_${jid}:${at}`, jid, label, 'hi', at);
  const mirror = (jid: string, title: string) =>
    db
      .prepare(`INSERT INTO chats (id, kind, title, wa_jid, archived, last_activity_at, created_at) VALUES (?, 'wa_mirror', ?, ?, 0, 0, 0)`)
      .run(`c_${jid.slice(0, 8)}`, title, jid);
  const googleContact = (id: string, name: string, phones: string[]) => {
    db.prepare(
      `INSERT OR IGNORE INTO connections (id, app, account_label, account_hash, granted, status, vault_name, connected_at)
       VALUES ('cn_contacts', 'contacts', 't•••@example.com', 'hash', '{"contactsRead":true}', 'connected', 'foo/conn_token/google', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO contacts_index (id, connection_id, display_name, emails, phones, synced_at) VALUES (?, 'cn_contacts', ?, '[]', ?, 0)`,
    ).run(id, name, JSON.stringify(phones));
  };
  const ctx = { jobId: 'j_1' } as ToolContext;
  const draftsOn = { value: true };
  const tool = whatsappDraftTool({ link, recipients, draftsOn: () => draftsOn.value });
  return { x, link, recipients, checked, created, opened, contact, message, mirror, googleContact, ctx, tool, draftsOn };
}

describe('08-3 §16.4.2 (2) · numbers', () => {
  it('reads E.164 and 10-digit Indian numbers; anything else is not a number', () => {
    expect(numberJid('98000 00011')).toBe(MOM);
    expect(numberJid('098000-00011')).toBe(MOM);
    expect(numberJid('+91 98000 00011')).toBe(MOM);
    expect(numberJid('+44 20 7946 0000')).toBe('442079460000@s.whatsapp.net');
    expect(numberJid('12345')).toBeNull();
    expect(numberJid('Mom')).toBeNull();
  });

  it('a number foo never messaged is someone new, checked on WhatsApp', async () => {
    const s = setup(true);
    const r = await resolveWaRecipient('98000 00099', s.recipients);
    expect(r).toEqual({
      kind: 'one',
      to: { jid: '919800000099@s.whatsapp.net', name: '+91 98••• ••099', label: '+91 98••• ••099', isGroup: false, isNew: true },
    });
    expect(s.checked).toEqual(['919800000099@s.whatsapp.net']);
  });

  it('a number messaged within 365 days is known; one only seen before that is someone new', async () => {
    const s = setup(true);
    s.message(MOM, NOW - 10 * DAY, 'Mom');
    s.message(RAVI, NOW - 400 * DAY);
    expect(await resolveWaRecipient('+919800000011', s.recipients)).toMatchObject({ kind: 'one', to: { jid: MOM, isNew: false } });
    expect(await resolveWaRecipient('+919800000013', s.recipients)).toMatchObject({ kind: 'one', to: { jid: RAVI, isNew: true } });
  });

  it('a number in Google Contacts is known and takes the contact name', async () => {
    const s = setup(true);
    s.googleContact('people/c9', 'Ravi Kumar', ['+919800000013']);
    s.googleContact('people/c10', 'Asha', ['09800000014']);
    expect(await resolveWaRecipient('9800000013', s.recipients)).toMatchObject({
      kind: 'one',
      to: { jid: RAVI, name: 'Ravi Kumar', isNew: false },
    });
    expect(await resolveWaRecipient('+91 98000 00014', s.recipients)).toMatchObject({ kind: 'one', to: { name: 'Asha', isNew: false } });
  });

  it('not on WhatsApp → not_on; bridge not open → cant_check', async () => {
    expect(await resolveWaRecipient('9800000099', setup(false).recipients)).toMatchObject({ to: { waCheck: 'not_on' } });
    h?.close();
    expect(await resolveWaRecipient('9800000099', setup(null).recipients)).toMatchObject({ to: { waCheck: 'cant_check' } });
  });
});

describe('08-3 §16.4.2 (1), (3) · jids and names', () => {
  it('a jid foo already has is used as it is, with no check', async () => {
    const s = setup();
    s.contact(MOM, 'Mom');
    s.message(MOM, NOW - DAY);
    expect(await resolveWaRecipient(MOM, s.recipients)).toEqual({
      kind: 'one',
      to: { jid: MOM, name: 'Mom', label: '+91 98••• ••011', isGroup: false, isNew: false },
    });
    expect(s.checked).toEqual([]);
  });

  it('one name match → that person; exact beats prefix', async () => {
    const s = setup();
    s.contact(MOM, 'Mom');
    s.contact(MOM2, 'Mommy Jaan');
    expect(await resolveWaRecipient('mom', s.recipients)).toMatchObject({ kind: 'one', to: { jid: MOM, name: 'Mom', isNew: false } });
    expect(await resolveWaRecipient('Momm', s.recipients)).toMatchObject({ kind: 'one', to: { jid: MOM2 } });
  });

  it('a group by name is a group (the card shows its name, never a number)', async () => {
    const s = setup();
    s.mirror(SOCIETY, 'Building society');
    expect(await resolveWaRecipient('Building society', s.recipients)).toEqual({
      kind: 'one',
      to: { jid: SOCIETY, name: 'Building society', label: 'Building society', isGroup: true, isNew: false },
    });
  });

  it('two matches → "Which Mom?" with masked numbers', async () => {
    const s = setup();
    s.contact(MOM, 'Mom');
    s.googleContact('people/c8', 'Mom', ['+919800000012']);
    const r = await resolveWaRecipient('Mom', s.recipients);
    expect(r).toMatchObject({
      kind: 'ask',
      question: 'Which Mom?',
      options: [
        { label: 'Mom · +91 98••• ••011', to: { jid: MOM } },
        { label: 'Mom · +91 98••• ••012', to: { jid: MOM2 } },
      ],
    });
  });

  it('no match → "Who is Mom on WhatsApp?" over the last 4 chats, newest first', async () => {
    const s = setup();
    for (let i = 0; i < 6; i++) s.message(`91980000002${i}@s.whatsapp.net`, NOW - (10 - i) * 60_000, `Friend ${i}`);
    const r = await resolveWaRecipient('Mom', s.recipients);
    if (r.kind !== 'ask') throw new Error(r.kind);
    expect(r.question).toBe('Who is Mom on WhatsApp?');
    expect(r.options.map((o) => o.label)).toEqual([
      'Friend 5 · +91 98••• ••025',
      'Friend 4 · +91 98••• ••024',
      'Friend 3 · +91 98••• ••023',
      'Friend 2 · +91 98••• ••022',
    ]);
  });

  it('no match and no chats → none', async () => {
    expect(await resolveWaRecipient('Mom', setup().recipients)).toEqual({ kind: 'none' });
  });
});

describe('08-2 §8.2 · whatsapp.draft', () => {
  it('drafts to the resolved person; the AI never sees the number', async () => {
    const s = setup();
    s.contact(MOM, 'Mom');
    s.message(MOM, NOW - DAY);
    const r = await s.tool.run({ to: 'Mom', text: 'Reached safely' }, s.ctx);
    expect(s.created).toEqual([
      { jobId: 'j_1', channel: 'whatsapp', to: { name: 'Mom', address: '+91 98••• ••011' }, waJid: MOM, body: 'Reached safely' },
    ]);
    expect(r).toEqual({ kind: 'ok', result: { drafted: true, cardId: 'k_1', to: 'Mom', waitingForSend: true } });
    expect(JSON.stringify(r)).not.toContain('9800000011');
  });

  it('a group draft says so (main makes it a full Approval)', async () => {
    const s = setup();
    s.mirror(SOCIETY, 'Building society');
    await s.tool.run({ to: 'Building society', text: 'Water off 10 to 12' }, s.ctx);
    expect(s.created[0]).toMatchObject({ waJid: SOCIETY, isGroup: true, to: { name: 'Building society', address: 'Building society' } });
  });

  it('someone new and an unchecked number travel to main with the draft', async () => {
    const s = setup(null);
    await s.tool.run({ to: '9800000099', text: 'Hello' }, s.ctx);
    expect(s.created[0]).toMatchObject({ isNew: true, waCheck: 'cant_check' });
  });

  it('"Which Mom?" asks a Choice card; the answer drafts to the picked person', async () => {
    const s = setup();
    s.contact(MOM, 'Mom');
    s.googleContact('people/c8', 'Mom', ['+919800000012']);
    const ask = await s.tool.run({ to: 'Mom', text: 'Call me' }, s.ctx);
    expect(ask).toMatchObject({
      kind: 'needs_user',
      card: {
        type: 'choice',
        payload: { purpose: 'job', question: 'Which Mom?', options: [{ id: 'o1' }, { id: 'o2', label: 'Mom · +91 98••• ••012' }] },
      },
    });
    expect(s.created).toEqual([]);
    await s.tool.run({ to: 'Mom · +91 98••• ••012', text: 'Call me' }, s.ctx);
    expect(s.created[0]).toMatchObject({ waJid: MOM2, to: { name: 'Mom' } });
  });

  it('the answer may come back as the option id, or the name when only one option has it; the picks end with the draft', async () => {
    const s = setup();
    for (let i = 0; i < 2; i++) s.message(`91980000002${i}@s.whatsapp.net`, NOW - (10 - i) * 60_000, `Friend ${i}`);
    await s.tool.run({ to: 'Mom', text: 'Hi' }, s.ctx);
    await s.tool.run({ to: 'o2', text: 'Hi' }, s.ctx);
    expect(s.created.at(-1)).toMatchObject({ waJid: '919800000020@s.whatsapp.net' });
    // A drafted job asks again; a unique name part answers it.
    await s.tool.run({ to: 'Mom', text: 'Hi' }, s.ctx);
    expect(s.created).toHaveLength(1);
    await s.tool.run({ to: 'Friend 1', text: 'Hi' }, s.ctx);
    expect(s.created.at(-1)).toMatchObject({ waJid: '919800000021@s.whatsapp.net' });
  });

  it('a name two options share is not an answer: "Mom" asks again', async () => {
    const s = setup();
    s.contact(MOM, 'Mom');
    s.googleContact('people/c8', 'Mom', ['+919800000012']);
    await s.tool.run({ to: 'Mom', text: 'Call me' }, s.ctx);
    expect(await s.tool.run({ to: 'Mom', text: 'Call me' }, s.ctx)).toMatchObject({ kind: 'needs_user' });
    expect(s.created).toEqual([]);
  });

  it('no one to send to is NOT_FOUND; drafts off is VALIDATION; nothing reaches main', async () => {
    const s = setup();
    expect(await s.tool.run({ to: 'Mom', text: 'x' }, s.ctx)).toEqual({ kind: 'error', errorKind: 'NOT_FOUND' });
    s.draftsOn.value = false;
    s.contact(MOM, 'Mom');
    expect(await s.tool.run({ to: 'Mom', text: 'x' }, s.ctx)).toMatchObject({ kind: 'error', errorKind: 'VALIDATION' });
    expect(await s.tool.run({ to: ['Mom'], text: 'x' }, s.ctx)).toMatchObject({ kind: 'error', errorKind: 'VALIDATION' });
    expect(s.created).toEqual([]);
  });
});

describe('08-2 §8.2 · x.draft and x.openCompose', () => {
  it('x.draft makes an X card with only a body; x.openCompose asks main to open that card for this job', async () => {
    const s = setup();
    const x = xTools({ link: s.link });
    expect(await x['x.draft']!.run({ text: 'Power cut again' }, s.ctx)).toEqual({
      kind: 'ok',
      result: { drafted: true, cardId: 'k_1', waitingForUser: true },
    });
    expect(s.created).toEqual([{ jobId: 'j_1', channel: 'x', to: { name: '', address: '' }, body: 'Power cut again' }]);
    expect(await x['x.openCompose']!.run({ draftCardId: 'k_1' }, s.ctx)).toEqual({ kind: 'ok', result: { opened: true, posted: false } });
    expect(s.opened).toEqual([{ jobId: 'j_1', cardId: 'k_1' }]);
    expect(x['x.draft']!.description).toBe('Write a post for X (at most 280 characters) for the user to review.');
    expect(x['x.openCompose']!.description).toBe('Open the draft in X so the user can post it.');
  });
});

describe('08-2 §9.4 · "Can I use WhatsApp for this?"', () => {
  it('whatsapp.draft asks the app_use Choice while WhatsApp is Ask; once answered in the job it is not asked again', () => {
    const settings = structuredClone(settingsDefaults);
    const gate = createGate({ settings: () => settings, now: () => NOW });
    const job = (answers: [PermissionApp, boolean][] = []) => ({
      id: 'j_1',
      intent: 'do' as const,
      doVerbs: ['send' as const],
      ownerId: null,
      appAnswers: new Map(answers),
    });
    const draft = { tool: 'whatsapp.draft', cls: 'prepare' as const };
    expect(settings.permissions.apps.whatsapp).toBe('ask');
    expect(gate.decide(job(), draft)).toEqual({ kind: 'ASK_CHOICE', purpose: 'app_use', app: 'whatsapp' });
    expect(gate.decide(job([['whatsapp', true]]), draft)).toEqual({ kind: 'EXECUTE' });
    expect(gate.decide(job([['whatsapp', false]]), draft)).toEqual({ kind: 'REFUSE', app: 'whatsapp' });
    // X has no account and no app row: x.draft is a plain prepare.
    expect(gate.decide(job(), { tool: 'x.draft', cls: 'prepare' })).toEqual({ kind: 'EXECUTE' });
  });
});
