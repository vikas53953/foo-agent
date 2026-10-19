// Spec: 05-3 §5.17 (memory chip: 0.3 Chip, `--bg-sunken`, `--fg-2`, `--t-caption`, `Brain` 16; the fact ellipsised at 48
// characters with the full text in the tooltip and for Narrator; "Undo" / "✕" separate 40px-hit buttons at the pill's right
// end; the six kinds and their copy; Undo for 24 h, then "See in memory" (opens 06 §7 at the fact); undone / forgotten states;
// hover text `--fg-1`; Narrator "Memory: I'll remember, {fact}. Button: Undo."; test ids `thread-marker` `data-state="memory"`,
// `thread-memory-undo`, `thread-memory-forget`, `thread-memory-see`), 08-5 §3.6 `MemoryChip`, 08-3 §12.5 (✕ → forget),
// CR-0010 G-M6-05 (`data-state="memory"`), G-M6-04 (an intake forget: "Forgot it…" with a 5 s Undo).
// The chip's fields are the marker row's `why.memoryChip` (engine memory/chips.ts); the clock is main's (clockNow).
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import type { MessageRow } from '../../shared/types';
import { invoke } from '../ipc/client';
import { clockNow } from '../store/apply';
import { navigate } from '../store/index';
import { Icon } from '../ui/Icon';
import styles from './MemoryChip.module.css';

/** 05-3 §5.17.1: the fact shows at most 48 characters. */
export const FACT_MAX = 48;

type Kind = 'saved' | 'guessed' | 'updated' | 'used' | 'not_saving';
export interface ChipFields {
  kind: Kind;
  messageId: string;
  factIds: string[];
  was?: string;
  undoToken?: string;
  undoUntil?: number;
  state?: 'undone' | 'forgotten' | 'restored';
}

/** The chip fields of a memory-chip marker row, or null. */
export function chipFields(m: Pick<MessageRow, 'why'>): ChipFields | null {
  const c = m.why?.memoryChip as ChipFields | undefined;
  return c && typeof c.kind === 'string' && Array.isArray(c.factIds) ? c : null;
}

/** 48 characters (code points), then "…". */
export function ellipsis(text: string, max = FACT_MAX): string {
  const cps = Array.from(text);
  return cps.length <= max ? text : `${cps.slice(0, max - 1).join('')}…`;
}

export interface ChipLine {
  /** The words before the action buttons. */
  text: string;
  /** Muted (`--fg-3`): undone and forgotten. */
  muted: boolean;
  action: 'undo' | 'forget' | 'see' | null;
  icon: 'Brain' | 'LockClosed';
}

/** What the chip says at `now` (05-3 §5.17.1 table and states). */
export function chipLine(c: ChipFields, fact: string, now: number, max = FACT_MAX): ChipLine {
  const short = ellipsis(fact, max);
  const canUndo = !!c.undoToken && c.undoUntil !== undefined && now < c.undoUntil;
  if (c.kind === 'not_saving') return { text: t('memory_chip.line.not_saving'), muted: false, action: null, icon: 'LockClosed' };
  if (c.state === 'undone') return { text: t('memory_chip.line.undone'), muted: true, action: null, icon: 'Brain' };
  if (c.state === 'forgotten')
    return { text: t('memory_chip.line.forgotten'), muted: true, action: canUndo ? 'undo' : null, icon: 'Brain' };
  if (c.state === 'restored') return { text: t('memory_chip.line.saved', { fact: short }), muted: false, action: null, icon: 'Brain' };
  if (c.kind === 'used') return { text: t('memory_chip.line.used', { fact: short }), muted: false, action: 'forget', icon: 'Brain' };
  const text =
    c.kind === 'guessed'
      ? t('memory_chip.line.guessed', { fact: short })
      : c.kind === 'updated'
        ? t('memory_chip.line.updated', { fact: short, old: ellipsis(c.was ?? '', max) })
        : t('memory_chip.line.saved', { fact: short });
  // After 24 h the chip reads "I'll remember: {fact}" + "See in memory" (05-3 §5.17.1).
  if (canUndo) return { text, muted: false, action: 'undo', icon: 'Brain' };
  return { text: t('memory_chip.line.saved', { fact: short }), muted: false, action: 'see', icon: 'Brain' };
}

export function MemoryChip({ m }: { m: MessageRow }) {
  const c = chipFields(m);
  const [now, setNow] = useState(clockNow);
  const [busy, setBusy] = useState(false);
  const until = c?.undoUntil;
  // The Undo goes when its window ends (5 s after an intake forget; 24 h after a save).
  useEffect(() => {
    if (until === undefined) return;
    const left = until - clockNow();
    if (left <= 0) return;
    const id = setTimeout(() => setNow(clockNow()), Math.min(left + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [until]);
  if (!c) return null;
  const at = Math.max(now, clockNow());
  const line = chipLine(c, m.text, at);
  const factId = c.factIds[0];
  const undo = () => {
    if (busy || !c.undoToken) return;
    setBusy(true);
    void invoke('memory:undo', { undoToken: c.undoToken }).finally(() => setBusy(false));
  };
  const forget = () => {
    if (busy || !factId) return;
    setBusy(true);
    void invoke('memory:forget', { factId, chipId: m.id }).finally(() => setBusy(false));
  };
  // Narrator hears the whole fact (05-3 §5.17.1).
  const label =
    line.action === 'undo' && !c.state && c.kind === 'saved'
      ? t('memory_chip.accessible.saved', { fact: m.text })
      : chipLine(c, m.text, at, Infinity).text;
  const chip = (
    <span
      className={styles.chip}
      data-testid={TID.threadMarker}
      data-state="memory"
      data-kind={c.kind}
      data-chip-state={c.state ?? 'rest'}
      data-muted={line.muted || undefined}
      role="group"
      aria-label={label}
      title={m.text || undefined}
    >
      <Icon name={line.icon} size={16} />
      <span className={styles.text} data-copy="ai">
        {line.text}
      </span>
      {line.action === 'undo' && (
        <button type="button" className={styles.link} data-testid={TID.threadMemoryUndo} onClick={undo} disabled={busy}>
          {t('memory_chip.button.undo')}
        </button>
      )}
      {line.action === 'forget' && (
        <button
          type="button"
          className={styles.icon}
          data-testid={TID.threadMemoryForget}
          aria-label={t('memory_chip.button.forget')}
          onClick={forget}
          disabled={busy}
        >
          <Icon name="Dismiss" size={16} />
        </button>
      )}
      {line.action === 'see' && factId && (
        <button
          type="button"
          className={styles.link}
          data-testid={TID.threadMemorySee}
          onClick={() => navigate({ kind: 'screen', id: 'memory', params: { factId } })}
        >
          {t('memory_chip.button.see')}
        </button>
      )}
    </span>
  );
  return <div className={styles.row}>{chip}</div>;
}
