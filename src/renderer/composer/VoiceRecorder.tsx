// Spec: 04-2 §22.1 recording bar (replaces the "+" button and the pill; `composer-recording`): Cancel 36 in the "+" slot with
// Dismiss 20 --bad, "Cancel (Esc)", `composer-recording-cancel`; static 8px --bad dot; timer "0:03" tabular, --warn from 4:30,
// "5:00 max" at the limit (`composer-recording-timer`); live level bars (2px, 2px gaps, 4–24 tall, newest at the right,
// --fg-2; they keep updating under reduced motion); hint per mode ("Release to send · slide left to cancel", "Release to
// send · Esc to cancel", "Press Enter to send · Esc to cancel"; "Let go to cancel" in --bad with the dot --fg-3 while armed).
// 02 §F7.1 "Composer" (P1 T6): when it ends (Esc included) the bar shrinks back into the mic (`<Presence>` sets data-exit).
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import { Tooltip } from '../ui/Tooltip';
import { barHeight, MAX_VOICE_MS, timerText, WARN_AT_MS } from './voice';
import styles from './Composer.module.css';

export interface RecordingView {
  mode: 'hold' | 'locked';
  source: 'mouse' | 'keyboard';
  elapsedMs: number;
  levels: number[];
  cancelArmed: boolean;
}

export function RecordCancel({ onCancel }: { onCancel: () => void }) {
  return (
    <Tooltip text={t('composer.recording.cancel')} side="top">
      <button
        type="button"
        className={`${styles.round} ${styles.cancelRec}`}
        aria-label={t('composer.recording.cancel')}
        data-testid={TID.composerRecordingCancel}
        onClick={onCancel}
      >
        <Icon name="Dismiss" size={20} />
      </button>
    </Tooltip>
  );
}

export function VoiceRecorder({ rec, 'data-exit': exit }: { rec: RecordingView; 'data-exit'?: '' }) {
  const hint = rec.cancelArmed
    ? t('composer.recording.hint_let_go')
    : rec.mode === 'locked'
      ? t('composer.recording.hint_locked')
      : rec.source === 'keyboard'
        ? t('composer.recording.hint_keyboard')
        : t('composer.recording.hint_mouse');
  const atMax = rec.elapsedMs >= MAX_VOICE_MS;
  return (
    <div className={`${styles.pill} ${styles.recPill}`} data-testid={TID.composerRecording} data-state={rec.mode} data-exit={exit}>
      <span className={styles.dot} data-cancel={rec.cancelArmed || undefined} />
      <span className={styles.timer} data-testid={TID.composerRecordingTimer} data-warn={rec.elapsedMs >= WARN_AT_MS || undefined}>
        {atMax ? t('composer.recording.max', { time: timerText(MAX_VOICE_MS) }) : timerText(rec.elapsedMs)}
      </span>
      <span className={styles.levels} aria-hidden>
        {rec.levels.map((l, i) => (
          <span key={i} className={styles.level} style={{ height: `${barHeight(l)}px` }} />
        ))}
      </span>
      <span className={styles.recHint} data-cancel={rec.cancelArmed || undefined}>
        {hint}
      </span>
    </div>
  );
}
