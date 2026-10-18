// Spec: 04-2 §23.5 (drafts per chat: saved 500 ms after the last change and at once on chat switch and window close; edit
// mode and recordings are never drafts; not saved while a paste catch is unresolved — the last saved draft stays; restored
// from chat:open `draft` when the chat opens and after a restart, caret at the end; cleared on Send or when everything is
// emptied), 08-1 §3.2 composer:saveDraft (main redacts and upserts; empty deletes). The session cache keeps a chat's composer
// as it was (chips included) between chat switches; main's `drafts` row is the copy that survives a restart.
import type { Attachment } from '../../shared/types';
import { invoke } from '../ipc/client';
import type { Segment } from './fieldModel';

export const DRAFT_DEBOUNCE_MS = 500;

export interface DraftState {
  segs: Segment[];
  /** Chips already copied into foo's data folder. */
  attachments: Attachment[];
  replyToId: string | null;
  linkPreviewRemoved: boolean;
}

export interface DraftPayload {
  chatId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string;
  linkPreviewRemoved: boolean;
}

const cache = new Map<string, DraftState>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const lastSent = new Map<string, string>();

export const cachedDraft = (chatId: string) => cache.get(chatId);
export function cacheDraft(chatId: string, d: DraftState | null): void {
  if (d) cache.set(chatId, d);
  else cache.delete(chatId);
}

function send(p: DraftPayload): void {
  const key = JSON.stringify(p);
  if (lastSent.get(p.chatId) === key) return;
  lastSent.set(p.chatId, key);
  invoke('composer:saveDraft', p).catch((e: unknown) => {
    lastSent.delete(p.chatId);
    console.warn('composer:saveDraft', e);
  });
}

/** Saves 500 ms after the last change (a newer call replaces the waiting one). */
export function saveDraftSoon(p: DraftPayload): void {
  saveDraftLater(p.chatId, () => p);
}

/**
 * The same, building the payload only when the 500 ms are up (PERF-02: serialising and secret-checking the whole text on
 * every keystroke was the typing tail); `build` returns null when nothing may be written then.
 */
export function saveDraftLater(chatId: string, build: () => DraftPayload | null): void {
  clearTimeout(timers.get(chatId));
  timers.set(
    chatId,
    setTimeout(() => {
      timers.delete(chatId);
      const p = build();
      if (p) send(p);
    }, DRAFT_DEBOUNCE_MS),
  );
}

/** Saves now (chat switch, window close). */
export function saveDraftNow(p: DraftPayload): void {
  clearTimeout(timers.get(p.chatId));
  timers.delete(p.chatId);
  send(p);
}

/** Drops a waiting save (Send clears the draft in main itself). */
export function cancelDraftSave(chatId: string, cleared = true): void {
  clearTimeout(timers.get(chatId));
  timers.delete(chatId);
  if (cleared) lastSent.set(chatId, JSON.stringify({ chatId, text: '', attachmentIds: [], linkPreviewRemoved: false }));
}

/** Tests: forget everything. */
export function resetDrafts(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  cache.clear();
  lastSent.clear();
}
