// Spec: 05-3 §5.22 Table card (`--card-w-wide`; title + "{n} options" right label; header cells uppercase on
// `--bg-sunken`; body `--t-small`, first column 600; rules between rows only; right-aligned numeric columns tabular; max 6
// columns; 10 rows visible then "Show all {n} rows" expands in place; "Copy table" copies tab-separated text and reads
// "Copied" for 2 s; `role="table"`; Narrator "Table: {title}, {rows} rows, {cols} columns"; ids card-table,
// card-table-show-all, card-table-copy, card-table-row), 08-5 §4.1 TablePayload (`bestRowIndex` is highlighted).
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import type { CardRow, TablePayload } from '../../shared/types';
import { useStore } from '../store/index';
import { expand, selectExpanded } from '../store/messages';
import { cx } from '../ui/cx';
import { copyText } from '../messages/linkActions';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { TABLE_CARD_COLS, TABLE_CARD_ROWS, tableTsv, cellText } from './tableText';
import styles from './Card.module.css';

export function TableCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as TablePayload;
  const expanded = useStore(selectExpanded(card.messageId, 'card'));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [copied]);
  const cols = (p.columns ?? []).slice(0, TABLE_CARD_COLS);
  const all = p.rows ?? [];
  const rows = expanded ? all : all.slice(0, TABLE_CARD_ROWS);
  const o = { timeZone: time.timeZone, now: time.now };
  return (
    <CardFrame
      tid="cardTable"
      wide
      state={card.state}
      label={t('cards.table.accessible_name', { title: p.title, rows: all.length, cols: cols.length })}
    >
      <div className={styles.head}>
        <span className={styles.title} data-copy="ai">
          {p.title}
        </span>
        <span className={styles.right}>{t('cards.table.right_label', { count: all.length })}</span>
      </div>
      <div className={styles.tableBox}>
        <table className={styles.table}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={cx(c.align === 'right' && styles.num)} data-copy="ai">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={cx(i === p.bestRowIndex && styles.best)} data-testid={TID.cardTableRow} data-index={i}>
                {cols.map((c) => (
                  <td key={c.key} className={cx(c.align === 'right' && styles.num)} data-copy="ai">
                    {cellText(r[c.key], c, o)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.sourceLine && (
        <div className={styles.small} data-copy="ai">
          {p.sourceLine}
        </div>
      )}
      <div className={styles.foot}>
        {all.length > TABLE_CARD_ROWS && !expanded && (
          <button type="button" className={styles.link} data-testid={TID.cardTableShowAll} onClick={() => expand(card.messageId, 'card')}>
            {t('cards.table.show_all', { n: all.length })}
          </button>
        )}
        <button
          type="button"
          className={styles.link}
          data-testid={TID.cardTableCopy}
          onClick={() => void copyText(tableTsv(p, o)).then((ok) => ok && setCopied(true))}
        >
          {copied ? t('cards.table.copied') : t('cards.table.copy')}
        </button>
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
    </CardFrame>
  );
}
