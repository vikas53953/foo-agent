// Spec: CR-0021 pick 15 (X-179; 02 §F1 money row): weight 700 (`--weight-money`) with tabular digits is used only for money
// amounts on money cards (Approval, Payment, Spend); every other word stays 400/600. Amounts are the 02 §F19.2 forms
// `formatInr` / `formatInrWords` write ("₹14,600", "₹1,179.50", "₹55 lakh"), found in the card's own text.
import type { ReactNode } from 'react';
import styles from '../Card.module.css';

const AMOUNT = /-?₹(?:\d[\d,]*(?:\.\d+)?)(?: (?:lakh|crore))?/g;

/** The text with each money amount in the money weight; the rest unchanged. */
export function Money({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(AMOUNT)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className={styles.money} data-money="">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
