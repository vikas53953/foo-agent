// Spec: 04-2 §22.9 (keyboard in the composer: Enter sends — or saves the edit, or sends the locked voice note — never during
// an IME composition (isComposing or keyCode 229) and never on key-repeat; Shift+Enter new line; Ctrl+Enter sends; ↑ in an
// empty field edits the last message; Esc does the first of: close menu/popover → dismiss the paste catch → cancel recording →
// cancel edit or reply strip → stop the streaming reply, and never clears typed text or stops a job; Backspace in an empty
// field with chips focuses the last chip, then removes it; Ctrl+U picker; Ctrl+B / Ctrl+I / Ctrl+Shift+X wrap in * _ ~;
// Tab never inserts a tab except to accept a mention), §22.8 (mention keys ↑/↓, Enter or Tab inserts, Esc closes, Space with
// no match closes), §22.1 (typing while recording is ignored except Esc, Enter, Space-release), §22.4 (Enter does not send
// while the catch is open). Pure; unit-tested.

export type KeyAction =
  | 'send'
  | 'newline'
  | 'edit_last'
  | 'close_menu'
  | 'dismiss_catch'
  | 'cancel_recording'
  | 'cancel_strip'
  | 'stop_reply'
  | 'focus_last_chip'
  | 'pick_files'
  | 'wrap_bold'
  | 'wrap_italic'
  | 'wrap_strike'
  | 'mention_prev'
  | 'mention_next'
  | 'mention_pick'
  | 'mention_close'
  /** The key does nothing here (its default is prevented). */
  | 'block';

export interface KeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
}

export interface KeyFacts {
  fieldEmpty: boolean;
  /** The caret is on the first line (↑ moves the caret otherwise). */
  canEditLast: boolean;
  menuOpen: boolean;
  mentionOpen: boolean;
  mentionHasMatch: boolean;
  catchOpen: boolean;
  recording: 'hold' | 'locked' | null;
  strip: 'reply' | 'side' | 'edit' | null; // R1 T6: 'side' is the side-question strip (04 §17.5)
  streaming: boolean;
  chips: number;
}

export function composerKeyAction(e: KeyLike, f: KeyFacts): KeyAction | null {
  const composing = e.isComposing || e.keyCode === 229;
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
  if (e.key === 'Escape' && plain && !e.shiftKey) {
    if (f.mentionOpen) return 'mention_close';
    if (f.menuOpen) return 'close_menu';
    if (f.catchOpen) return 'dismiss_catch';
    if (f.recording) return 'cancel_recording';
    if (f.strip) return 'cancel_strip';
    if (f.streaming) return 'stop_reply';
    return null;
  }
  if (f.recording) {
    if (e.key === 'Enter' && f.recording === 'locked' && !e.repeat && !composing) return 'send';
    return e.key === ' ' || e.key === 'Tab' ? null : 'block';
  }
  if (f.mentionOpen && plain) {
    if (e.key === 'ArrowUp') return 'mention_prev';
    if (e.key === 'ArrowDown') return 'mention_next';
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && f.mentionHasMatch) return 'mention_pick';
    if (e.key === ' ' && !f.mentionHasMatch) return 'mention_close';
  }
  if (e.key === 'Enter') {
    if (composing) return null;
    if (e.shiftKey && plain) return 'newline';
    if (e.repeat) return 'block';
    if (f.catchOpen) return 'block';
    if ((plain && !e.shiftKey) || (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey)) return 'send';
    return 'block';
  }
  if (e.key === 'ArrowUp' && plain && !e.shiftKey && f.fieldEmpty && f.canEditLast) return 'edit_last';
  if (e.key === 'Backspace' && plain && f.fieldEmpty && f.chips > 0) return 'focus_last_chip';
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    const k = e.key.toLowerCase();
    if (k === 'u' && !e.shiftKey) return 'pick_files';
    if (k === 'b' && !e.shiftKey) return 'wrap_bold';
    if (k === 'i' && !e.shiftKey) return 'wrap_italic';
    if (k === 'x' && e.shiftKey) return 'wrap_strike';
  }
  return null;
}

/** Ctrl+B / Ctrl+I / Ctrl+Shift+X: the WhatsApp markers (04 §10.10). */
export const WRAP: Record<'wrap_bold' | 'wrap_italic' | 'wrap_strike', string> = { wrap_bold: '*', wrap_italic: '_', wrap_strike: '~' };

/** §22.9: a printable key typed while the message list has focus moves to the field. */
export function isPrintable(e: Pick<KeyLike, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): boolean {
  return [...e.key].length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey;
}
