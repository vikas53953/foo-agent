// Spec: 04-2 §21.2 (one 36px round button, hit 40, `composer-send` with data-state = RoundButtonState; icons Mic, Send,
// Checkmark, Stop at 20px; the fill changes in --m-fast and the icon cross-fades in --m-normal; tooltip per state), §22.1 (press
// and hold ≥ 150 ms on Mic → hold mode, a shorter click → locked mode; Space or Enter on the focused mic → locked mode; "Hold
// to record" shows for 2 s after a too-short note), §23.3 (disabled: aria-disabled, tooltip still shown), §23.7 (Narrator reads
// the state's tooltip; a change is announced only while it has focus — the accessible name changes in place). CR-0021 pick 11
// and 02 §F7.1 "Composer" (P1 T6): ✓ for --dur-confirm after delivery (the Mic look keeps its name), holding the mic floods
// the button dark (--bubble-me) outward, a live level ring circles it while recording, send ↔ mic swap with a small turn.
import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { RoundButtonState } from '../../shared/types';
import { Icon, type IconName } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import styles from './Composer.module.css';

const ICON: Record<RoundButtonState, IconName> = {
  disabled: 'Mic',
  save_edit: 'Checkmark',
  send_voice: 'Send',
  recording: 'Mic',
  send: 'Send',
  stop: 'Stop',
  mic: 'Mic',
};

export interface MorphButtonProps {
  state: RoundButtonState;
  /** The icon the disabled look keeps ("per state", §21.2). */
  disabledIcon: IconName;
  tooltip: string;
  tooShort: boolean;
  onActivate: () => void;
  onMicDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicKey: () => void;
  // P1 T6
  /** Main has the message just sent: the Mic look shows ✓ for --dur-confirm. */
  confirmed?: boolean;
  /** The microphone's latest level (0–1) while recording, for the live ring. */
  level?: number;
}

export function MorphButton({
  state,
  disabledIcon,
  tooltip,
  tooShort,
  onActivate,
  onMicDown,
  onMicKey,
  confirmed = false,
  level = 0,
}: MorphButtonProps) {
  const done = confirmed && state === 'mic';
  const icon = done ? 'Checkmark' : state === 'disabled' ? disabledIcon : ICON[state];
  const live = state === 'recording' || state === 'send_voice';
  // §21.2 "the fill changes in --m-fast": the old fill lies over the new one and fades out (opacity runs on the compositor).
  // A background-color transition needs a main-thread frame on every tick; on the first keystroke (mic → send) that held
  // the keystroke's paint back by up to 300 ms on a 4x slower CPU (PERF-02).
  const [shown, setShown] = useState(state);
  const [from, setFrom] = useState<RoundButtonState | null>(null);
  if (shown !== state) {
    setShown(state);
    setFrom(shown);
  }
  // P1 T6: only the Send ↔ Mic swap turns; the flag stays with the icon until the next swap.
  const [shownIcon, setShownIcon] = useState(icon);
  const [turn, setTurn] = useState(false);
  if (shownIcon !== icon) {
    setShownIcon(icon);
    setTurn((shownIcon === 'Send' && icon === 'Mic') || (shownIcon === 'Mic' && icon === 'Send'));
  }
  return (
    <span className={styles.morphWrap}>
      <Tooltip text={tooltip} side="top">
        <button
          type="button"
          className={`${styles.round} ${styles.morph}`}
          data-testid={TID.composerSend}
          data-state={state}
          data-fading={from ?? undefined}
          data-confirmed={done || undefined}
          aria-label={tooltip}
          aria-disabled={state === 'disabled' || undefined}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            if (state === 'mic') onMicDown(e);
          }}
          onKeyDown={(e) => {
            if (state === 'mic' && (e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              onMicKey();
            }
          }}
          onClick={(e) => {
            // Mic is driven by pointer / key handlers (hold vs click); every other state acts on click.
            if (state === 'mic' || state === 'recording' || state === 'disabled') return;
            e.preventDefault();
            onActivate();
          }}
        >
          {state === 'recording' && <span className={styles.flood} aria-hidden />}
          {from && (
            <span key={`${from}>${state}`} className={styles.fillFrom} data-from={from} aria-hidden onAnimationEnd={() => setFrom(null)} />
          )}
          <span key={icon} className={styles.icon} data-turn={turn || undefined}>
            <Icon name={icon} size={20} />
          </span>
        </button>
      </Tooltip>
      {live && <span className={styles.levelRing} style={{ '--level': Math.min(1, Math.max(0, level)) } as CSSProperties} aria-hidden />}
      {tooShort && (
        <span className={styles.hint} role="status">
          {t('composer.recording.too_short')}
        </span>
      )}
    </span>
  );
}
