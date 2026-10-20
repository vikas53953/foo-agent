// Spec: 04 §10.11 (a mirrored WhatsApp group's composer: Send creates a `whatsapp.draft` for this group in **foo's chat**
// and the mirror shows "Draft ready in {agentName}'s chat." with Link "Open"; nothing is ever sent from the mirror, J16,
// Art. 4), 10-acceptance-1 AT-269 (no WhatsApp send call from the mirror: the fake phone records 0 outbound), 08-2 §8.2
// (`whatsapp.draft`: groups are always the full Approval card), 08-3 §16.4 Settings (`draft=false` hides WhatsApp drafts).
// M8 T7: main's deterministic intake for the mirror composer. No AI picks anything: the user typed in the group, so the
// group is the recipient and the typed text is the body; nothing is stored in the mirror itself (it shows only WhatsApp's
// own messages, 08-3 §16.4.3). The draft needs a job (its approvals row hangs on one), so a finished job in foo's chat
// carries it.
import { fail, ok, type Result } from '../../shared/errors';
import { newId } from '../../shared/ids';
import { t } from '../../shared/copy/t';
import type { Db } from '../store/db';
import { applyDbOps, type TxEffects } from '../engine-supervisor/engineHost';
import { fooChatId } from '../store/queries';
import type { DraftInput } from './DraftService';

/** 08-4 §26.2: a job title is at most 40 characters. */
const TITLE_MAX = 40;

export interface MirrorDraftDeps {
  db: Db;
  now(): number;
  draftsOn(): boolean;
  create(input: DraftInput): Promise<Result<{ approvalId: string; cardId: string; nonce: string }>>;
  changed(effects: TxEffects): void;
}

export interface MirrorDrafted {
  /** foo's chat and the Draft card there (the mirror's marker opens it). */
  fooChatId: string;
  draftCardId: string;
  /** The card's message in foo's chat. */
  messageId: string;
}

/** The mirror composer's Send: a WhatsApp group Draft card in foo's chat. Answers null when the chat is not a mirror. */
export async function mirrorDraft(d: MirrorDraftDeps, req: { chatId: string; text: string }): Promise<Result<MirrorDrafted> | null> {
  const chat = d.db
    .prepare("SELECT title, wa_jid FROM chats WHERE id = ? AND kind = 'wa_mirror' AND deleted_at IS NULL")
    .get(req.chatId) as { title: string | null; wa_jid: string | null } | undefined;
  if (!chat) return null;
  const body = req.text.trim();
  if (!body || !chat.wa_jid || !chat.wa_jid.endsWith('@g.us')) return fail('VALIDATION');
  if (!d.draftsOn()) return fail('VALIDATION', 'drafts_off');
  const foo = fooChatId(d.db);
  if (!foo) return fail('NOT_FOUND');
  const group = chat.title ?? '';
  const now = d.now();
  const jobId = newId('j', now);
  const title = t('composer.placeholder.wa_mirror', { group });
  const w = applyDbOps(
    d.db,
    [
      {
        op: 'insert',
        table: 'jobs',
        row: {
          id: jobId,
          chat_id: foo,
          origin_chat_id: foo,
          owner_kind: 'foo',
          title: title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title,
          origin: 'user',
          origin_ref: req.chatId,
          intent: 'do',
          do_verbs: ['send'],
          // The job's one step is the draft itself; the Draft card and its approval carry the rest.
          state: 'done',
          created_at: now,
          started_at: now,
          finished_at: now,
        },
      },
    ],
    { now },
  );
  if (!w.result.ok) return w.result;
  d.changed(w.effects);
  const made = await d.create({
    jobId,
    channel: 'whatsapp',
    to: { name: group, address: group },
    waJid: chat.wa_jid,
    isGroup: true,
    body,
  });
  if (!made.ok) return made;
  const messageId = d.db.prepare('SELECT message_id FROM cards WHERE id = ?').pluck().get(made.value.cardId) as string;
  return ok({ fooChatId: foo, draftCardId: made.value.cardId, messageId });
}
