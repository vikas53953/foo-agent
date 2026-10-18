// Spec: 04 §16.1 (auto-link menus need the chat for "puts … in the composer" and {agentName}), §10.5 / §13.1 / §13.2
// (expanded parts are kept per message), §10.1 / §13.3 (media under {DATA} reach the page through the app://media host).
import { createContext, useContext } from 'react';

export interface BubbleInfo {
  messageId: string;
  chatId: string;
  side: 'me' | 'foo';
  agentName: string;
  isGroup: boolean;
}

export const BubbleCtx = createContext<BubbleInfo>({ messageId: '', chatId: '', side: 'foo', agentName: '', isGroup: false });
export const useBubble = () => useContext(BubbleCtx);

/**
 * 04 §9.2: whether the row has been hovered or focused. The hover toolbar shows only then, so it is mounted only then: a
 * row mounted while flinging carries no toolbar buttons, tooltips or icons (PERF-04). Outside a list row: always.
 */
export const RowHotCtx = createContext(true);

/** A file under {DATA} (relative or absolute) as the URL the CSP allows (img-src app:). Web images are not loaded. */
// GAP: GAPS.md 2026-10-17 "no media URL for files under {DATA}"
export function mediaUrl(path: string): string | null {
  if (!path || /^(https?:|data:|blob:|javascript:)/i.test(path)) return null;
  return `app://media/?p=${encodeURIComponent(path)}`;
}
