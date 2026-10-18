// Spec: 05-3 §5.16 "Not checked live" chip (0.3 Chip: `--warn-soft`, `--warn`, `--t-caption-strong`, Warning 16; "Not checked
// live"; right of it a Link button "Check for real"; chip click → popover "I couldn't check this on the live site, so it may
// be out of date."; "Check for real" starts a new job linked to the old one and the chip reads spinner + "Checking…"; two Tab
// stops; Narrator "Not checked live. Button: Check for real."; test ids `thread-not-live-chip`, `thread-check-for-real`).
// The new linked job goes through `job:retry` (G-M4-01 linked job; main allocates its id, the runner names it "Checking
// {title} live" — implementation-notes "M4 T5").
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { TERMINAL } from '../../shared/jobMachine';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/Popover';
import { Spinner } from '../ui/Spinner';
import styles from './Proof.module.css';

/** How long "Checking…" waits for the runner to write the linked job before the chip offers Check for real again. */
const ROW_WAIT_MS = 30_000;

export function NotLiveChip({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState<HTMLButtonElement | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const job = useStore((s) => (linked ? s.jobs.byId[linked] : undefined));
  // "Checking…" follows the linked job the runner writes (05-3 §5.16); until its row arrives, a short wait covers the gap.
  const checking = job ? !TERMINAL.has(job.state) : waiting;
  useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => setWaiting(false), ROW_WAIT_MS);
    return () => clearTimeout(id);
  }, [waiting]);
  const check = () => {
    if (checking) return;
    setWaiting(true);
    void invoke('job:retry', { jobId })
      .then((r) => {
        if (r.ok) setLinked(r.value.newJobId);
        else setWaiting(false);
      })
      .catch(() => setWaiting(false));
  };
  return (
    <span className={styles.notLiveRow}>
      <button type="button" className={styles.notLive} data-testid={TID.threadNotLiveChip} onClick={(e) => setOpen(e.currentTarget)}>
        {checking ? <Spinner size={16} /> : <Icon name="Warning" size={16} />}
        <span className={styles.chipText}>{checking ? t('cards.not_live_chip.checking.text') : t('cards.not_live_chip.chip.text')}</span>
      </button>
      {!checking && (
        <button type="button" className={styles.link} data-testid={TID.threadCheckForReal} onClick={check}>
          {t('cards.not_live_chip.check_for_real.button')}
        </button>
      )}
      {open && (
        <Popover anchor={open} label={t('cards.not_live_chip.chip.text')} onClose={() => setOpen(null)} size="md" side="above">
          <span className={styles.popText}>{t('cards.not_live_chip.popover.text')}</span>
        </Popover>
      )}
    </span>
  );
}
