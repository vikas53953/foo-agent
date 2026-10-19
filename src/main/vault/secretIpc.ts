// Spec: 08-1 §3.2 `secret:save` ({ requestId?, kind, name, fields } → { target, savedAt, label }; VAULT_WRITE_FAILED,
// SECRET_EXISTS; a card with the same last 4 is refused, every other kind replaces and logs `secret_replaced`), `secret:list`
// (index rows, never values or targets), `secret:delete` ({ target, confirm: true }), `code:submit` (an `otp` Secret box's
// code goes to the engine through the SecretRegistry, never stored; REQUEST_GONE); 08-2 §11.2–§11.3; 05-2 §5.8.3 states
// (`asking` → `saved` | `rejected`), §5.8.6 activity `secret_saved` / `secret_replaced` / `secret_removed` (kind `changed`,
// the name only); 06-3 §14 C-22 (Remove: the vault entry goes, the card collapses to "Removed"); X-114 (`otp` registry only,
// 10 min); 04-2 §22.4 + G-M5-21 `secret:offer` (Move to secret box posts the card; the value stays in the renderer's memory).
// The IPC payloads are never logged (05-2 §5.8.5 rule 1). The router line in src/main/ipc/IpcRouter.ts stays T1's.
import type { DbOp } from '../../engine/protocol';
import { newNonce } from '../../shared/canon';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import { newId } from '../../shared/ids';
import type { SecretOfferSlot, VaultOff } from '../../shared/ipc';
import type { CardRow, SecretCardKind, SecretPayload } from '../../shared/types';
import { cardRow, type DbRow } from '../db/rows';
import { secretPayloadOf } from '../approvals/cardPayloads';
import { applyDbOps } from '../engine-supervisor/engineHost';
import { logEvent } from '../log/techLog';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';
import type { Db } from '../store/db';
import { secretActivityLine, type SecretEvent } from './labels';
import type { RegisterFn, SecretVault } from './SecretVault';
import { vaultRuntime } from './vaultRuntime';

/** X-114: a typed code lives in the registry for 10 minutes. */
export const OTP_TTL_MS = 10 * 60_000;

export interface SecretIpcDeps {
  db: Db;
  vault: SecretVault;
  register: RegisterFn;
  engine: Pick<EngineBridge, 'live' | 'send'> | undefined;
  now(): number;
  dataDir?: string;
  emitCard(row: CardRow): void;
  emitMessage(messageId: string): void;
  emitChat(chatId: string): void;
}

export type SecretChannels = 'secret:save' | 'secret:list' | 'secret:delete' | 'code:submit' | 'secret:offer';

/** A Secret box with a well-formed payload (M6 T9: guarded, never cast). */
type SecretCard = { card: CardRow; p: SecretPayload };
const secretCard = (r: DbRow | undefined): SecretCard | null => {
  const card = r ? cardRow(r) : null;
  const p = card ? secretPayloadOf(card) : null;
  return card && p ? { card, p } : null;
};
const getCard = (db: Db, id: string): SecretCard | null =>
  secretCard(db.prepare("SELECT * FROM cards WHERE id = ? AND type = 'secret' AND deleted_at IS NULL").get(id) as DbRow | undefined);

/** 04-2 §22.4 suggested names → the Secret box variant and title (G-M5-21). */
const OFFER: Record<SecretOfferSlot, { kind: SecretCardKind; vaultName?: string; title: () => string; fields: SecretPayload['fields'] }> = {
  openai: {
    kind: 'ai_key',
    vaultName: 'openai-key',
    title: () => t('composer.paste.name.openai'),
    fields: [{ key: 'value', label: '', masked: true }],
  },
  google: {
    kind: 'ai_key',
    vaultName: 'google-key',
    title: () => t('composer.paste.name.google'),
    fields: [{ key: 'value', label: '', masked: true }],
  },
  card: {
    kind: 'card',
    title: () => t('composer.paste.name.card'),
    fields: [
      { key: 'number', label: t('cards.secret.field.card_number'), masked: true },
      { key: 'expiry', label: t('cards.secret.field.expiry'), masked: false },
      { key: 'cvv', label: t('cards.secret.field.cvv'), masked: true },
      { key: 'name', label: t('cards.secret.field.name_on_card'), masked: false },
    ],
  },
  otp: { kind: 'otp', title: () => t('composer.paste.name.otp'), fields: [{ key: 'code', label: '', masked: true }] },
  // No vault kind yet (08-0 §E.8 names keys by provider, logins by host): the box is posted and its Save refuses plainly.
  password: { kind: 'ai_key', title: () => t('composer.paste.name.password'), fields: [{ key: 'value', label: '', masked: true }] },
  key: { kind: 'ai_key', title: () => t('composer.paste.name.key'), fields: [{ key: 'value', label: '', masked: true }] },
};

export function secretHandlers(d: SecretIpcDeps): IpcHandlers<SecretChannels> {
  const tx = (ops: DbOp[]) => applyDbOps(d.db, ops, { now: d.now(), dataDir: d.dataDir });
  const activity = (event: SecretEvent, label: string): DbOp => ({
    op: 'activity',
    row: {
      kind: 'changed',
      event,
      actor: 'user',
      chatId: null,
      chatTitle: null,
      jobId: null,
      approvalId: null,
      paymentId: null,
      routineId: null,
      summary: secretActivityLine(event, label),
      toLabel: null,
      fromLabel: null,
      amountPaise: null,
      approvedHow: 'user',
      ruleText: null,
      proofKind: null,
      proofRef: null,
      outcome: 'done',
      fields: { label },
    },
  });
  const moveCard = (card: CardRow, to: string, payload: SecretPayload): DbOp => ({
    op: 'transition',
    table: 'cards',
    id: card.id,
    from: [card.state],
    to,
    set: { payload },
  });
  const emitCards = (ids: Iterable<string>) => {
    for (const id of ids) {
      const c = d.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbRow | undefined;
      if (c) d.emitCard(cardRow(c));
    }
  };

  return {
    'secret:save': ({ requestId, kind, name, fields }) => {
      const box = requestId ? getCard(d.db, requestId) : null;
      const saved = d.vault.save(kind, name, fields);
      if (!saved.ok) {
        // A refused card number stays on the card as `rejected` (05-2 §5.8.2 "Card already saved"); the value stays in the field.
        if (box && box.card.state === 'asking' && saved.error.kind === 'SECRET_EXISTS') {
          const r = tx([moveCard(box.card, 'rejected', box.p)]);
          if (r.result.ok) emitCards([box.card.id]);
        }
        return saved;
      }
      const { target, savedAt, label, replaced } = saved.value;
      const ops: DbOp[] = [activity(replaced ? 'secret_replaced' : 'secret_saved', label)];
      // Replace from a saved row keeps the card `saved` with the new date (05-2 §5.8.3 Replaced).
      if (box && ['asking', 'rejected', 'saved'].includes(box.card.state)) {
        const { removedAt: _gone, ...p } = box.p;
        void _gone;
        ops.push(moveCard(box.card, 'saved', { ...p, savedAt, target, label }));
      }
      const r = tx(ops);
      if (r.result.ok) emitCards(r.effects.cardIds);
      return ok({ target, savedAt, label });
    },

    'secret:list': () => ok(d.vault.list()),

    'secret:delete': ({ target }) => {
      const del = d.vault.delete(target);
      if (!del.ok) return del;
      if (!del.value.removed) return ok(undefined);
      // Every saved Secret box that wrote this target collapses to "Removed" (06-3 §14 C-22).
      const boxes = (
        d.db
          .prepare("SELECT * FROM cards WHERE type = 'secret' AND state = 'saved' AND json_extract(payload, '$.target') = ?")
          .all(target) as DbRow[]
      ).flatMap((r) => secretCard(r) ?? []);
      const ops: DbOp[] = [
        activity('secret_removed', del.value.removed.label),
        ...boxes.map((b) => moveCard(b.card, 'withdrawn', { ...b.p, removedAt: d.now() })),
      ];
      const r = tx(ops);
      if (r.result.ok) emitCards(r.effects.cardIds);
      return ok(undefined);
    },

    'code:submit': ({ requestId, code }) => {
      // The asking code box this request belongs to; the engine must still be there to type it (08-1 §3.2).
      const row = d.db
        .prepare(
          "SELECT * FROM cards WHERE type = 'secret' AND state = 'asking' AND json_extract(payload, '$.secretKind') = 'otp' AND json_extract(payload, '$.requestId') = ?",
        )
        .get(requestId) as DbRow | undefined;
      const box = secretCard(row);
      if (!box || !/^\d{4,8}$/.test(code.replace(/\s/g, ''))) return fail(box ? 'VALIDATION' : 'REQUEST_GONE');
      if (!d.engine?.live) return fail('REQUEST_GONE');
      const codeRef = d.register(code.replace(/\s/g, ''), { kind: 'otp', ttlMs: OTP_TTL_MS });
      d.engine.send('code.submit', { requestId, codeRef });
      const r = tx([moveCard(box.card, 'saved', box.p)]);
      if (r.result.ok) emitCards(r.effects.cardIds);
      return ok(undefined);
    },

    'secret:offer': ({ chatId, slot }) => {
      const o = OFFER[slot];
      // 05-2 §5.8.6 "Groups: never": a Secret box is never posted in a group (the composer offers no Move there).
      const chat = d.db.prepare('SELECT kind FROM chats WHERE id = ?').get(chatId) as { kind: string } | undefined;
      if (!chat || chat.kind === 'group') return fail('VALIDATION');
      // 05-2 §5.9.4 tech log line (no value), through the one log sink (08-3 §19.1).
      logEvent({ lvl: 'info', mod: 'composer', evt: 'paste catcher shown', ids: { chatId }, kind: `${slot}, choice: move` });
      // A code goes into the code box foo already asked with, when there is one (P16 fires only after foo asked).
      if (o.kind === 'otp') {
        const open = d.db
          .prepare(
            "SELECT * FROM cards WHERE chat_id = ? AND type = 'secret' AND state = 'asking' AND json_extract(payload, '$.secretKind') = 'otp' ORDER BY created_at DESC LIMIT 1",
          )
          .get(chatId) as DbRow | undefined;
        if (open) return ok(cardRow(open));
      }
      const now = d.now();
      const cardId = newId('k', now);
      const messageId = newId('m', now);
      const payload: SecretPayload = {
        secretKind: o.kind,
        name: o.title(),
        why: '',
        fields: o.fields,
        ...(o.vaultName ? { vaultName: o.vaultName } : {}),
        // 08-1 §4.5 / §3.2: a code box carries the `requestId` its `code:submit` names; a box this Move posts answers itself.
        ...(o.kind === 'otp' ? { requestId: cardId } : {}),
      };
      const off = o.kind === 'otp' ? null : d.vault.off();
      if (off) payload.vaultOff = off;
      const r = tx([
        {
          op: 'insert',
          table: 'messages',
          row: { id: messageId, chat_id: chatId, author_kind: 'foo', kind: 'card', card_id: cardId, status: 'complete', created_at: now },
        },
        {
          op: 'insert',
          table: 'cards',
          row: {
            id: cardId,
            chat_id: chatId,
            message_id: messageId,
            type: 'secret',
            state: 'asking',
            payload,
            nonce: newNonce(),
            created_at: now,
          },
        },
      ]);
      if (!r.result.ok) return r.result as Result<never>;
      const card = getCard(d.db, cardId)!.card;
      d.emitCard(card);
      d.emitMessage(messageId);
      d.emitChat(chatId);
      return ok(card);
    },
  };
}

const notReady = () => fail<never>('VAULT_WRITE_FAILED', 'keyring_unavailable' satisfies VaultOff);

/** The router's rows. Main wires the vault at startup (src/main/index.ts → {@link vaultRuntime}). */
export function secretIpc(ctx: AppContext): IpcHandlers<SecretChannels> {
  const rows = (): IpcHandlers<SecretChannels> | null => {
    const rt = vaultRuntime();
    return rt ? secretHandlers({ ...rt, db: ctx.db, engine: ctx.engine, dataDir: ctx.dataDir }) : null;
  };
  return {
    'secret:save': (req) => rows()?.['secret:save'](req) ?? notReady(),
    'secret:list': (req) => rows()?.['secret:list'](req) ?? ok([]),
    'secret:delete': (req) => rows()?.['secret:delete'](req) ?? notReady(),
    'code:submit': (req) => rows()?.['code:submit'](req) ?? fail('REQUEST_GONE'),
    'secret:offer': (req) => rows()?.['secret:offer'](req) ?? notReady(),
  };
}
