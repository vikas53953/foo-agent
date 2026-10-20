// Spec: 05-3 §5.12 Plan card (`--card-w`; TaskListLtr 20 + "My plan · {title}"; numbered steps (number --t-body-strong
// --fg-2 in a 20px column, step --t-body, gap 4); beyond 6 steps the first 5 + "…and {n} more · Show" expanding in place
// (X-131); estimate --t-small --fg-2 "About {n} minutes · uses about ₹{x} of your AI" or the plan-based form, " · This is a
// big one." in --warn; [ Go ] [ Change plan ]; Change plan focuses the composer; states pending / go "Started · {time}" /
// changed (Superseded look) "Plan changed. See the new one below." / withdrawn "I didn't start {title} because I didn't hear
// back." + "Start again"; Offline → Go disabled + the offline line; cap reached → Go disabled + "You've reached this month's AI
// cap." + "Raise cap" (C-21)). §5.12.3: Ctrl+Enter = Go; label "Plan: {title}, {n} steps, about {n} minutes, about ₹{x}"; steps
// an ordered list. 05-1 §0.2 data rule: the words come from the runner's fields, never AI free text. `costLine` is the cost
// value the runner formatted (a ₹ amount); plan billing or no estimate drops the AI part — implementation-notes "M4 T5".
import { useState, type CSSProperties } from 'react';
import { t } from '../../shared/copy/t';
import { formatTime } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { CardRow, PlanPayload } from '../../shared/types';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectAi, selectConnection } from '../store/live';
import { selectSpend } from '../store/spend';
import { Icon } from '../ui/Icon';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { planRows, planWithdrawn } from './jobCards';
import { RaiseCapDialog } from './RaiseCapDialog';
import { ctrlEnter, useCardAction } from './useCardAction';
import styles from './JobCards.module.css';

export function Plan({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as PlanPayload;
  const ai = useStore(selectAi);
  const offline = useStore(selectConnection) === 'offline';
  const spend = useStore(selectSpend);
  const [showAll, setShowAll] = useState(false);
  const [capDialog, setCapDialog] = useState(false);
  const { busy, run } = useCardAction<'go' | 'change' | 'again'>();
  // `costLine` is the runner's rupee estimate (formatInr); with plan billing, or no estimate, the AI part is left out (08-2 §5.8).
  const cost = ai?.billing !== 'plan' && p.costLine ? p.costLine : null;
  const estimate = cost ? t('cards.plan.estimate.key', { n: p.minutes, x: cost }) : t('cards.plan.estimate.base', { n: p.minutes });
  const label = cost
    ? t('cards.plan.label', { title: p.title, n: p.steps.length, minutes: p.minutes, x: cost })
    : t('cards.plan.label_base', { title: p.title, n: p.steps.length, minutes: p.minutes });
  const capReached = !!spend && spend.aiBilling === 'key' && (spend.aiSpentPaise ?? 0) >= spend.aiCapPaise;
  const canGo = !offline && !capReached && busy === null;
  const answer = { cardId: card.id, nonce: card.nonce };
  const go = () => run('go', () => invoke('plan:go', { ...answer, resolvedBy: 'tap' }));

  if (card.state === 'go')
    return (
      <CardFrame tid="cardPlan" card={card} state={card.state} label={label}>
        <div className={styles.summary}>
          <Icon name="CheckmarkCircle" size={16} className={styles.ok} />
          <span className={styles.summaryText}>
            {t('cards.plan.summary.go', { time: formatTime(card.resolvedAt ?? card.updatedAt, { timeZone: time.timeZone }) })}
          </span>
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
      </CardFrame>
    );
  if (card.state === 'changed' || card.state === 'withdrawn') {
    const gone = card.state === 'withdrawn' ? planWithdrawn(p.title, card.resolvedBy) : null;
    return (
      <CardFrame tid="cardPlan" card={card} state={card.state} label={label} muted>
        <div className={styles.summary}>
          <Icon name={gone ? 'Clock' : 'Dismiss'} size={16} className={styles.dim} />
          <span className={styles.summaryText}>{gone ? gone.text : t('cards.plan.summary.changed')}</span>
          {gone?.startAgain && card.jobId && (
            <CardButton
              tid="cardPlanStartAgain"
              kind="link"
              busy={busy === 'again'}
              onClick={() => run('again', () => invoke('job:retry', { jobId: card.jobId! }))}
            >
              {t('cards.plan.start_again')}
            </CardButton>
          )}
          <span className={styles.spacer} />
          <CardTimeLabel {...time} />
        </div>
      </CardFrame>
    );
  }

  const { shown, more } = planRows(p.steps, showAll);
  return (
    <CardFrame tid="cardPlan" card={card} state={card.state} label={label} busy={busy !== null} onKeyDown={ctrlEnter(canGo ? go : null)}>
      <div className={styles.head}>
        <Icon name="TaskListLtr" size={20} className={styles.headIcon} />
        <span className={styles.title}>{t('cards.plan.title', { title: p.title })}</span>
      </div>
      <ol className={styles.planSteps}>
        {shown.map((s, i) => (
          // 02 §F7.1 Cards: a new plan's steps reveal one by one (`--i` sets the step's delay).
          <li key={i} className={styles.planStep} data-testid={TID.cardPlanStep} data-index={i} style={{ '--i': i } as CSSProperties}>
            <span className={styles.planNum}>{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {more > 0 && (
        <CardButton tid="cardPlanShowAll" kind="link" onClick={() => setShowAll(true)}>
          {t('cards.plan.show_all', { n: more })}
        </CardButton>
      )}
      <div className={styles.small} data-testid={TID.cardPlanEstimate}>
        {estimate}
        {p.big && <span className={styles.warn}>{t('cards.plan.big')}</span>}
      </div>
      {offline && (
        <div className={styles.reason}>
          <Icon name="Globe" size={16} className={styles.dim} />
          {t('cards.common.offline_line')}
        </div>
      )}
      {capReached && (
        <div className={styles.reason}>
          {t('cards.plan.cap_line')}
          <CardButton tid="cardPlanRaiseCap" kind="link" onClick={() => setCapDialog(true)}>
            {t('cards.plan.raise_cap')}
          </CardButton>
        </div>
      )}
      <div className={styles.foot}>
        <div className={styles.buttons}>
          <CardButton tid="cardPlanGo" kind="primary" busy={busy === 'go'} disabled={!canGo} onClick={go}>
            {t('cards.plan.go')}
          </CardButton>
          <CardButton
            tid="cardPlanChange"
            kind="secondary"
            busy={busy === 'change'}
            disabled={busy !== null}
            onClick={() =>
              run('change', () => {
                document.querySelector<HTMLElement>(`[data-testid="${TID.composerField}"]`)?.focus();
                return invoke('plan:change', { ...answer, resolvedBy: 'tap' });
              })
            }
          >
            {t('cards.plan.change')}
          </CardButton>
        </div>
        <span className={styles.spacer} />
        <CardTimeLabel {...time} />
      </div>
      {capDialog && spend && <RaiseCapDialog capPaise={spend.aiCapPaise} onClose={() => setCapDialog(false)} />}
    </CardFrame>
  );
}
