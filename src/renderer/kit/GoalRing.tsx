// Spec: 02-2 §F19.9 (goal ring: track `--bg-sunken`, arc `--accent`, the value and target written in the middle
// "{value} of {target}", `role="meter"`; forced colours), §F19.1 (en-IN numbers), 04 §13.5, CR-0022 AT-348 (arc
// proportional to value / target), X-180. R1 T4.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { formatValue } from './LineChart';
import styles from './NumbersForms.module.css';

/** The ring in viewBox units: radius and stroke; the circumference is what the arc's dash is measured in. */
export const RING = { size: 120, r: 52, stroke: 10 } as const;
export const RING_LENGTH = 2 * Math.PI * RING.r;

/** How much of the ring the arc covers, 0–1 (a value past the target fills it; below zero shows none). */
export const goalShare = (value: number, target: number): number => Math.min(1, Math.max(0, value / target));

export function GoalRing({ value, target, label }: { value: number; target: number; label: string }) {
  const middle = t('kit.goal.of', { value: formatValue(value), target: formatValue(target) });
  const share = goalShare(value, target);
  const c = RING.size / 2;
  return (
    <div className={styles.goal} data-testid={TID.kitGoalRing} data-share={share.toFixed(3)}>
      <div
        className={styles.ring}
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuetext={middle}
      >
        <svg viewBox={`0 0 ${RING.size} ${RING.size}`} aria-hidden="true">
          <circle className={styles.track} cx={c} cy={c} r={RING.r} strokeWidth={RING.stroke} />
          {share > 0 && (
            <circle
              className={styles.arc}
              cx={c}
              cy={c}
              r={RING.r}
              strokeWidth={RING.stroke}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - share)}
            />
          )}
        </svg>
        <span className={styles.middle}>{middle}</span>
      </div>
      <span className={styles.label} data-copy="ai">
        {label}
      </span>
    </div>
  );
}
