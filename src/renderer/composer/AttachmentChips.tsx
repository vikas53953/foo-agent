// Spec: 04-2 §21.4 (chips row inside the pill: 8 gaps, horizontal scroll with a 24px edge fade; image tile 72 `composer-chip`
// data-state="image"; file chip 56×240 with a 40 icon tile, name over "{TYPE} · {size}"; "Pasted text" chip "{n} characters";
// remove button 24 on the top-right corner, "Remove {file name}", `composer-chip-remove`; preparing scrim + spinner 20; failed
// --bad edge + ErrorCircle 16 with the reason as tooltip; one Tab stop, ←/→ between chips, Delete or Backspace removes the
// focused chip; Narrator "Photo, {name}" / "File, {name}, {type}, {size}"), §22.9 (Backspace in an empty field focuses the
// last chip, a second press removes it). Enter's attachment viewer (06 §13) arrives with that screen. 02 §F7.1 "Composer"
// (P1 T6): a new chip flies in from the drop point; a long paste folds into its chip.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatBytes } from '../../shared/format';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import { Spinner } from '../ui/Spinner';
import { Tooltip } from '../ui/Tooltip';
import { typeLabel, type Chip } from './chips';
import styles from './Composer.module.css';

export interface ChipsHandle {
  focusLast(): void;
}

export const AttachmentChips = forwardRef<ChipsHandle, { chips: Chip[]; onRemove: (key: string) => void; onExit: () => void }>(
  function AttachmentChips({ chips, onRemove, onExit }, ref) {
    const [focused, setFocused] = useState<number | null>(null);
    const row = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({
      focusLast: () => {
        setFocused(chips.length - 1);
        row.current?.focus();
      },
    }));
    const label = (c: Chip) =>
      c.kind === 'image'
        ? t('composer.chip.accessible_photo', { name: c.name })
        : t('composer.chip.accessible_file', {
            name: c.kind === 'pasted' ? t('composer.chip.pasted_name') : c.name,
            type: c.kind === 'pasted' ? 'TXT' : typeLabel(c.name),
            size: formatBytes(c.bytes),
          });
    const current = focused !== null ? Math.min(focused, chips.length - 1) : null;
    return (
      <div
        ref={row}
        className={styles.chips}
        role="list"
        tabIndex={0}
        aria-activedescendant={current !== null ? `composer-chip-${chips[current]?.key}` : undefined}
        onFocus={() => setFocused((f) => f ?? chips.length - 1)}
        onBlur={() => setFocused(null)}
        onKeyDown={(e) => {
          if (current === null) return;
          if (e.key === 'ArrowLeft') setFocused(Math.max(0, current - 1));
          else if (e.key === 'ArrowRight') setFocused(Math.min(chips.length - 1, current + 1));
          else if (e.key === 'Delete' || e.key === 'Backspace') {
            onRemove(chips[current]!.key);
            if (chips.length <= 1) onExit();
            else setFocused(Math.max(0, current - 1));
          } else if (e.key === 'Escape' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey)) {
            onExit();
            return;
          } else return;
          e.preventDefault();
        }}
      >
        {chips.map((c, i) => (
          <div
            key={c.key}
            id={`composer-chip-${c.key}`}
            className={styles.chip}
            role="listitem"
            aria-label={label(c)}
            data-testid={TID.composerChip}
            data-state={c.kind}
            data-index={i}
            data-focused={current === i || undefined}
            data-failed={c.state === 'failed' || undefined}
            data-enter={c.enter}
            ref={c.from ? (el) => flyFrom(el, c.from!) : undefined}
          >
            {c.kind === 'image' ? (
              <img className={styles.imageChip} src={c.url} alt="" />
            ) : (
              <div className={styles.fileChip}>
                <span className={styles.fileIcon}>
                  <Icon name="Document" size={20} />
                </span>
                <span className={styles.fileText}>
                  <span className={styles.fileName}>{c.kind === 'pasted' ? t('composer.chip.pasted_name') : c.name}</span>
                  <span className={styles.fileMeta}>
                    {c.kind === 'pasted'
                      ? t('composer.chip.pasted_meta', { n: (c.text ?? '').length.toLocaleString('en-IN') })
                      : t('bubble.file.meta', { type: typeLabel(c.name), size: formatBytes(c.bytes) })}
                  </span>
                </span>
              </div>
            )}
            {c.state === 'preparing' && (
              <span className={styles.preparing}>
                <Spinner size={20} />
              </span>
            )}
            {c.state === 'failed' && (
              <Tooltip text={problemText(c)} className={styles.failedIcon}>
                <Icon name="ErrorCircle" size={16} />
              </Tooltip>
            )}
            <button
              type="button"
              tabIndex={-1}
              className={styles.chipRemove}
              aria-label={t('composer.chip.remove', { name: c.kind === 'pasted' ? t('composer.chip.pasted_name') : c.name })}
              title={t('composer.chip.remove', { name: c.kind === 'pasted' ? t('composer.chip.pasted_name') : c.name })}
              data-testid={TID.composerChipRemove}
              data-index={i}
              onClick={() => onRemove(c.key)}
            >
              <Icon name="Dismiss" size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  },
);

/** The drop point relative to the chip's centre, for the fly-in keyframe (`--fly-x`, `--fly-y`). */
function flyFrom(el: HTMLDivElement | null, from: { x: number; y: number }): void {
  if (!el || el.style.getPropertyValue('--fly-x')) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--fly-x', `${Math.round(from.x - (r.left + r.width / 2))}px`);
  el.style.setProperty('--fly-y', `${Math.round(from.y - (r.top + r.height / 2))}px`);
}

function problemText(c: Chip): string {
  switch (c.problem) {
    case 'too_big':
      return t('composer.notice.too_big', { name: c.name });
    default:
      return t('composer.notice.unreadable', { name: c.name });
  }
}
