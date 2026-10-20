// Spec: 04 §13.5 (kit `Compare`: options side by side), CR-0022 AT-343 (2–3 columns; the highlighted column is outlined
// with its one-line why), 05-1 §0.2 (a framed group), X-180. R1 T4.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { cx } from '../ui/cx';
import styles from './NumbersForms.module.css';

export interface CompareColumn {
  title: string;
  rows: { label: string; value: string }[];
}

export function Compare({ columns, highlight, why }: { columns: CompareColumn[]; highlight?: number; why?: string }) {
  const best = highlight !== undefined && highlight < columns.length ? highlight : null;
  return (
    <div className={styles.compare} data-testid={TID.kitCompare} data-columns={columns.length}>
      {columns.map((col, i) => (
        <section
          key={i}
          className={cx(styles.column, i === best && styles.best)}
          aria-label={col.title}
          data-best={i === best || undefined}
        >
          {i === best && <span className={styles.badge}>{t('kit.compare.best')}</span>}
          <h4 className={styles.title} data-copy="ai">
            {col.title}
          </h4>
          <dl className={styles.rows}>
            {col.rows.map((r, j) => (
              <div key={j}>
                <dt data-copy="ai">{r.label}</dt>
                <dd data-copy="ai">{r.value}</dd>
              </div>
            ))}
          </dl>
          {i === best && why && (
            <p className={styles.caption} data-copy="ai">
              {why}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
