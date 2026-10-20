// Spec: 03-shell-1 §3.4.4 filter chips (All · Needs you · Working · Done; exactly one selected, "All" on launch and not
// persisted; counts on Needs you and Working when ≥ 1, tabular; `role="radiogroup"` "Show chats", each chip `role="radio"`
// named "{label}, {n} chats"; one Tab stop, ← / → move, Space or Enter selects), 02 F5 / U-5 (40 hit area around the 32
// chip, inside the 44 row). Test ids `chatlist-filters`, `chatlist-filter-*`. 02 §F7.1 "Chat list" [X-179]: the filter
// highlight slides between chips (one fill measured from the selected chip; Basic and Off keep each chip's own fill).
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { ChatFilter } from '../../shared/types';
import { setChatFilter, useStore } from '../store/index';
import { selectChipCounts } from '../store/chats';
import { selectChatFilter } from '../store/ui';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import styles from './FilterChips.module.css';

const CHIPS: { id: ChatFilter; tid: keyof typeof TID; label: () => string; counted: boolean }[] = [
  { id: 'all', tid: 'chatlistFilterAll', label: () => t('chatlist.filter.all'), counted: false },
  { id: 'needs_you', tid: 'chatlistFilterNeedsYou', label: () => t('chatlist.filter.needs_you'), counted: true },
  { id: 'working', tid: 'chatlistFilterWorking', label: () => t('chatlist.filter.working'), counted: true },
  { id: 'done', tid: 'chatlistFilterDone', label: () => t('chatlist.filter.done'), counted: false },
];

export function FilterChips() {
  const selected = useStore(selectChatFilter);
  const counts = useStore(useShallow(selectChipCounts));
  const ref = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);

  // Place the sliding fill on the selected chip; the first placement does not slide (data-ready comes after it).
  useLayoutEffect(() => {
    const row = ref.current;
    const fill = highlight.current;
    const chip = row?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    if (!row || !fill || !chip) return;
    const place = () => {
      fill.style.setProperty('--hl-x', `${chip.offsetLeft}px`);
      fill.style.setProperty('--hl-y', `${chip.offsetTop}px`);
      fill.style.setProperty('--hl-w', `${chip.offsetWidth}px`);
    };
    place();
    const raf = requestAnimationFrame(() => {
      fill.dataset.ready = '';
    });
    const sizes = new ResizeObserver(place);
    sizes.observe(row);
    sizes.observe(chip);
    return () => {
      cancelAnimationFrame(raf);
      sizes.disconnect();
    };
  }, [selected, counts.needs_you, counts.working]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const chips = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const i = chips.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? chips.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + chips.length) % chips.length;
    e.preventDefault();
    chips[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className={styles.row}
      role="radiogroup"
      aria-label={t('chatlist.filter.group_label')}
      data-testid={TID.chatlistFilters}
      onKeyDown={onKeyDown}
    >
      <span ref={highlight} className={styles.highlight} aria-hidden="true" />
      {CHIPS.map((c) => {
        const on = selected === c.id;
        const n = c.id === 'needs_you' ? counts.needs_you : c.id === 'working' ? counts.working : 0;
        const label = c.label();
        const showCount = c.counted && n >= 1;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={cx(styles.chip, on && styles.on)}
            data-testid={TID[c.tid]}
            data-state={on ? 'on' : 'off'}
            {...(showCount ? { 'aria-label': t('chatlist.filter.name', { label, count: n }) } : {})}
            onClick={() => setChatFilter(c.id)}
          >
            {on && <Icon name="Checkmark" size={16} className={styles.hcCheck} />}
            <span>{label}</span>
            {showCount && <span className={styles.count}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
