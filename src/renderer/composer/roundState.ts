// Spec: 04-2 §21.2 (one morphing round button; its state is checked in this order: Disabled, Save edit, Send voice note,
// Recording (hold), Send, Stop, Mic; Stop only when the field is empty and foo is showing a status line, typing bubble or
// streaming bubble for a reply in this chat), §22.4 (while a catch is open the button is disabled: "Choose an option above
// first"), §23.6 (over 10,000 characters: disabled, "Too long to send…"), §23.3, §20.4 `{talkKey}`, 08-0 §B.2
// `RoundButtonState` (D-4). Pure; unit-tested (test/unit/m2b-composer.test.ts).
import { t } from '../../shared/copy/t';
import type { RoundButtonState } from '../../shared/types';

export interface RoundFacts {
  /** §23.3: your AI is not set up. */
  notSetUp: boolean;
  editing: boolean;
  recording: 'hold' | 'locked' | null;
  /** Any non-space text in the field or ≥ 1 attachment chip. */
  hasContent: boolean;
  /** foo is replying in this chat (status line, typing or streaming bubble). */
  replying: boolean;
  /** §22.4 panel open. */
  catchOpen: boolean;
  /** §23.6 over the limit. */
  tooLong: boolean;
  /** CR-0054: this build left voice off, so an empty field shows Send (which does nothing) instead of the mic. */
  noVoice?: boolean;
}

export function roundButtonState(f: RoundFacts): RoundButtonState {
  if (f.notSetUp || f.catchOpen || (f.tooLong && !f.recording)) return 'disabled';
  if (f.editing) return 'save_edit';
  if (f.recording === 'locked') return 'send_voice';
  if (f.recording === 'hold') return 'recording';
  if (f.hasContent) return 'send';
  if (f.replying) return 'stop';
  return f.noVoice ? 'send' : 'mic';
}

/** The tooltip and accessible name of each state (04-2 §21.2, §22.4, §23.6, §23.7). */
export function roundTooltip(state: RoundButtonState, f: Pick<RoundFacts, 'notSetUp' | 'catchOpen' | 'tooLong'>, talkKey: string): string {
  switch (state) {
    case 'disabled':
      if (f.notSetUp) return t('composer.send.tooltip.disabled');
      if (f.catchOpen) return t('composer.send.tooltip.choose_first');
      return t('composer.send.tooltip.too_long');
    case 'save_edit':
      return t('composer.send.tooltip.save_edit');
    case 'send_voice':
      return t('composer.send.tooltip.send_voice');
    case 'recording':
      return t('composer.send.tooltip.recording');
    case 'send':
      return t('composer.send.tooltip.send');
    case 'stop':
      return t('composer.send.tooltip.stop');
    case 'mic':
      return t('composer.send.tooltip.mic', { talkKey });
  }
}

/** §20.4 `{talkKey}`: Ctrl+Space, or Ctrl+Shift+Space when a Chinese, Japanese or Korean layout is in use (09-windows). */
// GAP: GAPS.md 2026-10-17 "keyboard layouts are not visible to the renderer"
export function talkKeyLabel(languages: readonly string[]): string {
  return languages.some((l) => /^(zh|ja|ko)\b/i.test(l)) ? 'Ctrl+Shift+Space' : 'Ctrl+Space';
}

/** Whether a keyboard event is the talk key's chord (Space with Ctrl, plus Shift for the CJK variant). */
export function isTalkChord(
  e: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  label: string,
): boolean {
  const space = e.code === 'Space' || e.key === ' ';
  return space && e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey === (label === 'Ctrl+Shift+Space');
}
