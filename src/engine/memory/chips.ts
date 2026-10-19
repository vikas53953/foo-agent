// Spec: 08-3 §12.4.2 (accepted ops → file write → memory chip, `messages.kind='marker'`, `marker_kind='memory_chip'`; R-20
// placement: under the foo bubble that followed the evidence, else a system line under the user's bubble that carried the fact;
// `MemoryChip.messageId` names that bubble), §12.5 ("Used: {fact} ✕" under the reply for at most 2 facts, preferring `guessed`
// ones; ✕ → forget), 05-3 §5.17.1 (the six kinds; Undo for 24 h after the save; "Undone. I won't remember that."; "Forgot it.
// I won't use that again."; a forget from the chip is activity `forgot_facts`, count only), 08-5 §3.6 `MemoryChip`, 08-1 §3.3
// `memory:changed { factIds, chip? }`, J17 ("Not saving this one."), CR-0010 G-M6-04 (an intake forget: "Forgot it…" with Undo
// 5 s), G-M6-10 (chip forget = `forgot_facts` count 1).
// The chip's own fields live in the marker row's `messages.why` as `{ memoryChip: ChipData }` (the spec names no column for
// them; implementation-notes "M6 T5").
import { fail, type Result } from '../../shared/errors';
import type { MemoryChip, MemoryFactView } from '../../shared/types';
import type { EngineFact, EngineMessage } from '../../main/db/queries';
import type { DbOp, DbTxReply } from '../protocol';
import type { MemoryParts } from './retrieval';

/** 05-3 §5.17.1: Undo is offered for 24 h after the save. */
export const UNDO_SAVE_MS = 24 * 60 * 60_000;
/** 08-3 §12.5: at most 2 "Used:" chips under one reply. */
export const USED_MAX = 2;
/** `memory:undo` tokens of a chip's own Undo (a save, a guess or an update): `chip_{markerMessageId}`. */
export const CHIP_TOKEN = 'chip_';

export type ChipState = 'undone' | 'forgotten' | 'restored';
/** What the marker row keeps (messages.why.memoryChip). */
export interface ChipData {
  kind: MemoryChip['kind'];
  /** The bubble the chip sits under (R-20). */
  messageId: string;
  factIds: string[];
  was?: string;
  undoToken?: string;
  undoUntil?: number;
  /** After Undo or ✕ (05-3 §5.17.1 states undone / forgotten); `restored` = an intake forget undone. */
  state?: ChipState;
}

/** The marker row's chip fields, or null when the row is not a memory chip. */
export function chipOf(why: Record<string, unknown> | null | undefined): ChipData | null {
  const c = why?.memoryChip as ChipData | undefined;
  return c && typeof c.kind === 'string' && Array.isArray(c.factIds) ? c : null;
}

/** The 08-5 §3.6 view of a chip row. */
export function chipView(text: string, c: ChipData): MemoryChip {
  return {
    messageId: c.messageId,
    factIds: c.factIds,
    kind: c.kind,
    text,
    ...(c.was !== undefined ? { was: c.was } : {}),
    ...(c.undoToken !== undefined ? { undoToken: c.undoToken } : {}),
    ...(c.undoUntil !== undefined ? { undoUntil: c.undoUntil } : {}),
  };
}

/** 08-3 §12.5: the facts a reply names, at most 2, `guessed` first (spec order kept within each provenance). */
export function usedForChips(facts: readonly EngineFact[]): EngineFact[] {
  const guessed = facts.filter((f) => f.provenance === 'guessed');
  const said = facts.filter((f) => f.provenance === 'said');
  return [...guessed, ...said].slice(0, USED_MAX);
}

/** 08-4 §24.16 item 6 / 08-3 §12.5: the offered facts (parts 5/5b as sent) the AI named, once each, in its order. */
export function usedFacts(named: readonly string[], offered: readonly string[], memory: MemoryParts): EngineFact[] {
  const facts = new Map([...memory.part5, ...memory.part5b].map((x) => [x.id, x.fact]));
  return [...new Set(named)].filter((id) => offered.includes(id)).flatMap((id) => facts.get(id) ?? []);
}

/** The memory seam the chips act through (MemoryService). */
export interface ChipMemory {
  cmd(c: { cmd: 'forget'; factId: string }): Promise<Result<unknown>>;
  forgetFromChip(factId: string): Promise<Result<{ undoToken: string }>>;
  update(factId: string, text: string): Promise<Result<MemoryFactView>>;
  view(factId: string): Promise<Result<MemoryFactView>>;
}

export interface ChipDeps {
  now(): number;
  newId(prefix: 'm'): string;
  tx(ops: DbOp[]): Promise<Result<DbTxReply>>;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
  memory: ChipMemory;
  /** `memory:changed { factIds, chip }` (08-1 §3.3). */
  changed(factIds: string[], chip: MemoryChip): void;
}

/** Posts memory chips as marker rows and runs their Undo / ✕. */
export class MemoryChips {
  /** A 5 s forget undo token (intake "forget …") → its chip, so a restore can update the chip. */
  private readonly forgetChips = new Map<string, string>();

  constructor(private readonly d: ChipDeps) {}

  /** "I'll remember: {fact}" (said) or "… · I guessed" (guessed), Undo for 24 h. */
  saved(chatId: string, anchorId: string, fact: { id: string; text: string; provenance: 'said' | 'guessed' }): Promise<string | null> {
    const id = this.d.newId('m');
    return this.post(chatId, id, fact.text, {
      kind: fact.provenance === 'guessed' ? 'guessed' : 'saved',
      messageId: anchorId,
      factIds: [fact.id],
      undoToken: `${CHIP_TOKEN}${id}`,
      undoUntil: this.d.now() + UNDO_SAVE_MS,
    });
  }

  /** "Updated: {fact} (was {old})" with Undo for 24 h. */
  updated(chatId: string, anchorId: string, fact: { id: string; text: string }, was: string): Promise<string | null> {
    const id = this.d.newId('m');
    return this.post(chatId, id, fact.text, {
      kind: 'updated',
      messageId: anchorId,
      factIds: [fact.id],
      was,
      undoToken: `${CHIP_TOKEN}${id}`,
      undoUntil: this.d.now() + UNDO_SAVE_MS,
    });
  }

  /** "Used: {fact}" + ✕, one chip per fact, at most 2 (§12.5). */
  async used(chatId: string, anchorId: string, facts: readonly EngineFact[]): Promise<void> {
    for (const f of usedForChips(facts))
      await this.post(chatId, this.d.newId('m'), f.text, { kind: 'used', messageId: anchorId, factIds: [f.id] });
  }

  /** "Not saving this one." (J17 "don't remember this"). */
  notSaving(chatId: string, anchorId: string): Promise<string | null> {
    return this.post(chatId, this.d.newId('m'), '', { kind: 'not_saving', messageId: anchorId, factIds: [] });
  }

  /** An intake forget (G-M6-04): "Forgot it. I won't use that again." with the store's 5 s Undo. */
  async forgotten(chatId: string, anchorId: string, fact: { id: string; text: string }, undo: { token: string; until: number }) {
    const id = await this.post(chatId, this.d.newId('m'), fact.text, {
      kind: 'used',
      messageId: anchorId,
      factIds: [fact.id],
      undoToken: undo.token,
      undoUntil: undo.until,
      state: 'forgotten',
    });
    if (id) this.forgetChips.set(undo.token, id);
    return id;
  }

  /** ✕ on a "Used:" chip: forget, logged `forgot_facts` count 1 (G-M6-10); the chip reads "Forgot it…". */
  async forget(chipId: string, factId: string): Promise<Result<{ undoToken: string }>> {
    const row = await this.chip(chipId);
    if (!row) return fail('NOT_FOUND');
    const { m, c } = row;
    if (c.kind !== 'used' || c.state || !c.factIds.includes(factId)) return fail('VALIDATION');
    const r = await this.d.memory.forgetFromChip(factId);
    if (!r.ok) return r;
    await this.setState(m, c, 'forgotten');
    return r;
  }

  /** Undo on a saved / guessed / updated chip (24 h): the save is forgotten, or the old text comes back. */
  async undo(token: string): Promise<Result<MemoryFactView>> {
    const row = await this.chip(token.slice(CHIP_TOKEN.length));
    if (!row) return fail('NOT_FOUND');
    const { m, c } = row;
    if (c.state || c.undoToken !== token) return fail('TOO_LATE');
    if (c.undoUntil === undefined || this.d.now() > c.undoUntil) return fail('TOO_LATE');
    const factId = c.factIds[0];
    if (!factId) return fail('NOT_FOUND');
    let r: Result<MemoryFactView>;
    if (c.kind === 'updated') {
      if (c.was === undefined) return fail('VALIDATION');
      r = await this.d.memory.update(factId, c.was);
    } else if (c.kind === 'saved' || c.kind === 'guessed') {
      const before = await this.d.memory.view(factId);
      if (!before.ok) return before;
      const gone = await this.d.memory.cmd({ cmd: 'forget', factId });
      r = gone.ok ? before : gone;
    } else return fail('VALIDATION');
    if (!r.ok) return r;
    await this.setState(m, c, 'undone');
    return r;
  }

  /** The store restored a fact an intake forget removed (its 5 s Undo): that chip no longer says "Forgot it". */
  async restored(token: string): Promise<void> {
    const chipId = this.forgetChips.get(token);
    this.forgetChips.delete(token);
    const row = chipId ? await this.chip(chipId) : null;
    if (row) await this.setState(row.m, row.c, 'restored');
  }

  private async chip(id: string): Promise<{ m: EngineMessage; c: ChipData } | null> {
    const m = await this.d.query<EngineMessage>('messageById', id);
    const c = m && m.kind === 'marker' ? chipOf(m.why) : null;
    return m && c ? { m, c } : null;
  }

  private async setState(m: EngineMessage, c: ChipData, state: ChipState): Promise<void> {
    const next: ChipData = { ...c, state };
    delete next.undoToken;
    delete next.undoUntil;
    const r = await this.d.tx([{ op: 'update', table: 'messages', id: m.id, set: { why: { memoryChip: next } } }]);
    if (r.ok) this.d.changed(next.factIds, chipView(m.text, next));
  }

  private async post(chatId: string, id: string, text: string, c: ChipData): Promise<string | null> {
    const r = await this.d.tx([
      {
        op: 'insert',
        table: 'messages',
        row: {
          id,
          chat_id: chatId,
          author_kind: 'system',
          kind: 'marker',
          marker_kind: 'memory_chip',
          text,
          status: 'complete',
          why: { memoryChip: c },
          created_at: this.d.now(),
        },
      },
    ]);
    if (!r.ok) return null;
    this.d.changed(c.factIds, chipView(text, c));
    return id;
  }
}

export const isChipToken = (token: string) => token.startsWith(CHIP_TOKEN);
