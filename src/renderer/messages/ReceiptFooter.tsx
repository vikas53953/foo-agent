// Spec: 05-3 §5.15 receipt footer under the chips (`--t-caption` `--fg-3`): "Done in {m} min · {n} steps · used about ₹{x} of
// your AI"; plan-based AI "… · used about {p}% of your {Claude} plan" only when the adapter reports plan usage, else the AI
// part is left out (08-2 §5.8; keys `cards.checklist.footer.base|key|plan`); test id `thread-receipt-footer`. The result
// row (`ResultProof`) puts the Proof chip (§5.15) or the "Not checked live" chip (§5.16) and this footer under the result
// message of a finished job: DONE has a verified proof, DONE unverified the warning chip (Art. 11, SM-A12).
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { JobRow } from '../../shared/types';
import { asProof, wholeMinutes } from '../cards/jobCards';
import { useStore } from '../store/index';
import { selectAi } from '../store/live';
import { NotLiveChip } from './NotLiveChip';
import { ProofChip } from './ProofChip';
import styles from './Proof.module.css';

export function ReceiptFooter({ job }: { job: JobRow }) {
  const ai = useStore(selectAi);
  const m = wholeMinutes(job.startedAt ?? job.createdAt, job.finishedAt ?? job.lastProgressAt ?? job.createdAt);
  let text = t('cards.checklist.footer.base', { m, n: job.stepCount });
  if (ai?.billing === 'key') text += t('cards.checklist.footer.key', { x: formatInr(job.spentCostPaise) });
  else if (ai?.billing === 'plan' && typeof ai.planUsedPct === 'number')
    text += t('cards.checklist.footer.plan', { p: ai.planUsedPct, AI: ai.displayName });
  return (
    <div className={styles.footer} data-testid={TID.threadReceiptFooter}>
      {text}
    </div>
  );
}

/** Chips and receipt under a finished job's result message. */
export function ResultProof({ job }: { job: JobRow }) {
  if (job.state !== 'done' && job.state !== 'done_unverified') return null;
  const proof = job.state === 'done' ? asProof(job.proof) : null;
  return (
    <div className={styles.result}>
      <div className={styles.chips}>{proof ? <ProofChip proof={proof} /> : <NotLiveChip jobId={job.id} />}</div>
      <ReceiptFooter job={job} />
    </div>
  );
}
