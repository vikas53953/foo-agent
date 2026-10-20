// Spec: 06-1 §2.2 ("Pick another" turns the block into a 05 Choice card "Which one should I use?"; "nothing found" asks "I couldn't
// find an AI on this PC yet. Which one do you use?" with ChatGPT as Best fit; "Which key is it?"; the local-AI question,
// `purpose: setup`), 05-1 §5.3.1 (option rows: number badge, label, Best fit tag and accent border; ↑/↓ between rows). The
// question lives inside the finder card (CR-0020 (b) pick 4: its answer has no engine meaning, so no card row is written).
import { useRef, type KeyboardEvent } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { Spinner } from '../../ui/Spinner';
import { cx } from '../../ui/cx';
import cs from '../Choice.module.css';
import styles from './AiFinder.module.css';

export interface FinderOption {
  id: string;
  label: string;
  bestFit?: boolean;
}

export function FinderChoice({
  question,
  options,
  busy,
  onPick,
}: {
  question: string;
  options: FinderOption[];
  /** The option whose action is in flight. */
  busy: string | null;
  onPick: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = Array.from(ref.current?.querySelectorAll<HTMLElement>(`[data-testid="${TID.cardChoiceOption}"]`) ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = list[e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  return (
    <div className={styles.choice} data-testid={TID.cardChoice} data-purpose="setup" onKeyDown={keys}>
      <p className={styles.question}>{question}</p>
      <div ref={ref} className={cs.rows} role="radiogroup" aria-label={question}>
        {options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={false}
            aria-disabled={busy !== null || undefined}
            className={cx(cs.row, o.bestFit && cs.best)}
            data-testid={TID.cardChoiceOption}
            data-index={i + 1}
            data-option={o.id}
            onClick={busy !== null ? undefined : () => onPick(o.id)}
          >
            <span className={cs.badge} aria-hidden="true">
              {busy === o.id ? <Spinner size={16} /> : i + 1}
            </span>
            <span className={cs.text}>
              <span className={cs.labelLine}>
                <span className={cs.label}>{o.label}</span>
                {o.bestFit && <span className={cs.tag}>{t('cards.choice.tag')}</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
