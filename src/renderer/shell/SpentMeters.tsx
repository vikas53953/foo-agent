// Spec: 03-shell-2 §3.7.3.4 (Spent this month: "AI" and "Purchases" rows, "{spent} of {cap}" with a 4px meter; 80–99 % --warn;
// ≥ 100 % --bad and "Cap reached · {cap}"; plan-based AI shows "Uses your {AI} plan" and no meter, plus "{AI} plan: {p}% used"
// when the AI reports usage; "Change caps" → Settings → Money (X-07); role="meter" with aria-valuenow/-max and its name),
// Article 13 (both caps always visible, except in groups, §3.7.4 — RightShell leaves this section out there).
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { TID } from '../../shared/testids';
import { navigate, useStore } from '../store/index';
import { selectAi } from '../store/live';
import { selectSpend } from '../store/spend';
import { Meter } from '../ui/Meter';
import section from './PanelSection.module.css';
import styles from './SpentMeters.module.css';
import { meterState } from './spentMeterState';

export function SpentMeters() {
  const spend = useStore(selectSpend);
  const ai = useStore(selectAi);
  if (!spend) return null;
  const aiName = ai?.displayName ?? '';
  const plan = spend.aiBilling === 'plan';
  const planPct = spend.planUsedPct ?? ai?.planUsedPct ?? null;

  return (
    <section className={section.section} data-testid={TID.appPanelSpent} aria-labelledby="app-panel-spent-title">
      <h2 className={section.label} id="app-panel-spent-title">
        <button type="button" className={section.labelLink} onClick={() => navigate({ kind: 'screen', id: 'spend' })}>
          {t('app.panel.spent.title')}
        </button>
      </h2>
      {plan ? (
        <div className={styles.row} data-testid={TID.appPanelSpentAi} data-state="plan">
          <span className={styles.head}>
            <span className={styles.label}>{t('app.panel.spent.ai')}</span>
            <span className={styles.amount}>{t('app.panel.spent.plan', { ai: aiName })}</span>
          </span>
          {planPct !== null && (
            <span className={styles.sub}>{t('app.panel.spent.plan_usage', { ai: aiName, pct: Math.round(planPct) })}</span>
          )}
        </div>
      ) : (
        <MeterRow
          tid="appPanelSpentAi"
          label={t('app.panel.spent.ai')}
          spent={spend.aiSpentPaise ?? 0}
          cap={spend.aiCapPaise}
          name={(s, c) => t('app.panel.spent.meter.ai', { spent: s, cap: c })}
        />
      )}
      <MeterRow
        tid="appPanelSpentBuy"
        label={t('app.panel.spent.buy')}
        spent={spend.purchasesPaise}
        cap={spend.purchaseCapPaise}
        name={(s, c) => t('app.panel.spent.meter.buy', { spent: s, cap: c })}
      />
      <button
        type="button"
        className={section.link}
        data-testid={TID.appPanelSpentChange}
        onClick={() => navigate({ kind: 'settings', page: 'money' })}
      >
        {t('app.panel.spent.change')}
      </button>
    </section>
  );
}

function MeterRow(props: {
  tid: 'appPanelSpentAi' | 'appPanelSpentBuy';
  label: string;
  spent: number;
  cap: number;
  name: (spent: string, cap: string) => string;
}) {
  const m = meterState(props.spent, props.cap);
  const spent = formatInr(props.spent);
  const cap = formatInr(props.cap);
  return (
    <div
      className={styles.row}
      role="meter"
      aria-valuemin={0}
      aria-valuenow={Math.round(props.spent / 100)}
      aria-valuemax={Math.round(props.cap / 100)}
      aria-valuetext={t('app.panel.spent.amount', { spent, cap })}
      aria-label={props.name(spent, cap)}
      data-testid={TID[props.tid]}
      data-state={m.tone}
    >
      <span className={styles.head}>
        <span className={styles.label}>{props.label}</span>
        <span className={styles.amount} data-tone={m.tone}>
          {m.capReached ? t('app.panel.spent.cap_reached', { cap }) : t('app.panel.spent.amount', { spent, cap })}
        </span>
      </span>
      <Meter value={props.spent} max={props.cap} tone={m.tone} />
    </div>
  );
}
