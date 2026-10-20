// Spec: 04 §13.5 (kit ListPick: the pick goes renderer → main `kit:action` → engine `kit.action`), 05-1 §5.3.4 (the
// answer counts like a Choice card answer: a tap or Enter on a row, 1–9 on the keyboard, or a keycap reaction on foo's
// message), §5.3.5 (keyboard and Narrator: a radiogroup, ↑/↓ move, Enter picks; "You chose …" once answered), CR-0022
// §(c) (rows ≤ 10 {title, sub}), AT-349, X-180. R1 T3.
import { useMemo, useState, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { answeredChoice } from '../../shared/kit/pick';
import { TID } from '../../shared/testids';
import { useStore } from '../store/index';
import { cx } from '../ui/cx';
import { Icon } from '../ui/Icon';
import styles from './ListPick.module.css';

// ---- the answer: a later user message in the chat whose kitPick names this piece (05-1 §5.3.5: it stays answered) ----

/**
 * The choice already given for this piece, read from the chat in the store (main derives each user message's kitPick), so
 * the answer survives a restart and an un-react; null while it is unanswered.
 */
export function useAnswered(host: { chatId: string; messageId?: string; cardId?: string }, surfaceId: string, componentId: string) {
  const chat = useStore((s) => s.messages.byChat[host.chatId]);
  return useMemo(() => {
    if (!chat) return null;
    const at = chat.ids.findIndex((id) => (host.messageId ? id === host.messageId : chat.byId[id]?.cardId === host.cardId));
    if (at < 0) return null;
    const after = chat.ids.slice(at + 1).flatMap((id) => {
      const m = chat.byId[id];
      return m && m.deletedAt === null ? [{ authorKind: m.authorKind, text: m.text, kitPick: m.kitPick }] : [];
    });
    return answeredChoice(after, surfaceId, componentId);
  }, [chat, host.messageId, host.cardId, surfaceId, componentId]);
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
  answered,
  onPick,
}: {
  rows: { title: string; sub?: string | undefined }[];
  /** The choice the chat already holds for this piece (`useAnswered`). */
  answered: string | null;
  /** Sends the pick; resolves true once main took it. */
  onPick: (row: number) => Promise<boolean>;
}) {
  // Between main taking the pick and the user's message reaching the store, the tapped row shows as picked.
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const picked = answered ?? sent;
  const pick = (i: number) => {
    if (picked !== null || busy || !rows[i]) return;
    setBusy(true);
    void onPick(i + 1).then((ok) => {
      setBusy(false);
      if (ok) setSent(rows[i]!.title);
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
