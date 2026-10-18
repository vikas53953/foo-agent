// Spec: 04-2 §21.2 (one 36px round button, hit 40, `composer-send` with data-state = RoundButtonState; icons Mic, Send,
// Checkmark, Stop at 20px; the fill changes in --m-fast and the icon cross-fades in --m-normal; tooltip per state), §22.1 (press
// and hold ≥ 150 ms on Mic → hold mode, a shorter click → locked mode; Space or Enter on the focused mic → locked mode; "Hold
// to record" shows for 2 s after a too-short note), §23.3 (disabled: aria-disabled, tooltip still shown), §23.7 (Narrator reads
// the state's tooltip; a change is announced only while it has focus — the accessible name changes in place).
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
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
}

export function MorphButton({ state, disabledIcon, tooltip, tooShort, onActivate, onMicDown, onMicKey }: MorphButtonProps) {
  const icon = state === 'disabled' ? disabledIcon : ICON[state];
  // §21.2 "the fill changes in --m-fast": the old fill lies over the new one and fades out (opacity runs on the compositor).
  // A background-color transition needs a main-thread frame on every tick; on the first keystroke (mic → send) that held
  // the keystroke's paint back by up to 300 ms on a 4x slower CPU (PERF-02).
  const [shown, setShown] = useState(state);
  const [from, setFrom] = useState<RoundButtonState | null>(null);
  if (shown !== state) {
    setShown(state);
    setFrom(shown);
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
          {from && (
            <span key={`${from}>${state}`} className={styles.fillFrom} data-from={from} aria-hidden onAnimationEnd={() => setFrom(null)} />
          )}
          <span key={icon} className={styles.icon}>
            <Icon name={icon} size={20} />
          </span>
        </button>
      </Tooltip>
      {tooShort && (
        <span className={styles.hint} role="status">
          {t('composer.recording.too_short')}
        </span>
      )}
    </span>
  );
}
