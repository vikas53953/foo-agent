// Spec: 04 §13.5 (kit ListPick: the pick goes renderer → main `kit:action` → engine `kit.action`), 05-1 §5.3.4 (the
// answer counts like a Choice card answer: a tap or Enter on a row, 1–9 on the keyboard, or a keycap reaction on foo's
// message), §5.3.5 (keyboard and Narrator: a radiogroup, ↑/↓ move, Enter picks; "You chose …" once answered), CR-0022
// §(c) (rows ≤ 10 {title, sub}), AT-349, X-180. R1 T3.
import { useMemo, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { keycapRow, reactionListPick } from '../../shared/kit/pick';
import { foldFence, kitMessagesOf } from '../../shared/kit/surface';
import { TID } from '../../shared/testids';
import { useStore } from '../store/index';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import styles from './ListPick.module.css';

// ---- what was picked, kept per piece so a row mounted again (the virtual list) still shows it ----

const picks = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The choice picked in this piece (`key` = surface key + component id + scope), and the setter once main took it. */
export function usePicked(key: string): [string | null, (choice: string) => void] {
  const picked = useSyncExternalStore(subscribe, () => picks.get(key) ?? null);
  return [
    picked,
    (choice) => {
      picks.set(key, choice);
      listeners.forEach((fn) => fn());
    },
  ];
}

/** For unit tests. */
export function resetPicks(): void {
  picks.clear();
  listeners.forEach((fn) => fn());
}

/**
 * The row the user's keycap reaction on the host message picked (1-based), when this ListPick is the one a reaction
 * answers (main's `kitReaction` takes the same first ListPick of the message); null otherwise.
 */
export function useReactionRow(host: { chatId: string; messageId?: string }, componentId: string): number | null {
  const m = useStore((s) => (host.messageId ? s.messages.byChat[host.chatId]?.byId[host.messageId] : undefined));
  const text = m?.text;
  const target = useMemo(() => (text ? reactionListPick(foldFence([kitMessagesOf(text).messages], 0).surfaces) : null), [text]);
  if (!m || target?.pick.id !== componentId) return null;
  const mine = m.reactions.find((r) => r.by === 'me');
  return mine ? keycapRow(mine.emoji) : null;
}

/** ↑/↓ (and ←/→) move between options, Home and End jump; the focused option is picked with Enter or Space. */
export function moveFocus(e: KeyboardEvent<HTMLElement>, selector: string): void {
  const keys: Record<string, (i: number, n: number) => number> = {
    ArrowDown: (i, n) => (i + 1) % n,
    ArrowRight: (i, n) => (i + 1) % n,
    ArrowUp: (i, n) => (i - 1 + n) % n,
    ArrowLeft: (i, n) => (i - 1 + n) % n,
    Home: () => 0,
    End: (_, n) => n - 1,
  };
  const move = keys[e.key];
  if (!move) return;
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>(selector)];
  const at = all.indexOf(document.activeElement as HTMLElement);
  e.preventDefault();
  all[move(Math.max(at, 0), all.length)]?.focus();
}

export function ListPick({
  rows,
  pickKey,
  reactionRow,
  onPick,
}: {
  rows: { title: string; sub?: string | undefined }[];
  pickKey: string;
  reactionRow: number | null;
  /** Sends the pick; resolves true once main took it. */
  onPick: (row: number) => Promise<boolean>;
}) {
  const [tapped, setTapped] = usePicked(pickKey);
  const [busy, setBusy] = useState(false);
  const fromReaction = reactionRow !== null ? rows[reactionRow - 1]?.title : undefined;
  const picked = tapped ?? fromReaction ?? null;
  const pick = (i: number) => {
    if (picked !== null || busy || !rows[i]) return;
    setBusy(true);
    void onPick(i + 1).then((ok) => {
      setBusy(false);
      if (ok) setTapped(rows[i]!.title);
    });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= Math.min(rows.length, 9)) {
      e.preventDefault();
      pick(n - 1);
      return;
    }
    moveFocus(e, '[role="radio"]');
  };
  return (
    <div className={styles.pick} data-testid={TID.kitListPick} data-state={picked === null ? 'asking' : 'answered'}>
      <div role="radiogroup" className={styles.rows} onKeyDown={onKey} aria-disabled={picked !== null || undefined}>
        {rows.map((r, i) => {
          const on = r.title === picked;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={(picked === null ? i === 0 : on) ? 0 : -1}
              className={cx(styles.row, on && styles.on)}
              disabled={picked !== null && !on}
              onClick={() => pick(i)}
            >
              <span className={styles.num} aria-hidden="true">
                {on ? <Icon name="Checkmark" size={16} /> : i + 1}
              </span>
              <span className={styles.words}>
                <span className={styles.title} data-copy="ai">
                  {r.title}
                </span>
                {r.sub && (
                  <span className={styles.sub} data-copy="ai">
                    {r.sub}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className={styles.chosen} role="status">
          {t('kit.pick.chosen', { choice: picked })}
        </p>
      )}
    </div>
  );
}
