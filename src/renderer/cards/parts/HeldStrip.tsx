// Spec: 05-1 §0.5 Held strip (`--warn-soft` strip, Warning 16 and the word "Check"; assertive for Narrator, 05-2 §5.5.5),
// 05-2 §5.5.4 HELD ("Before I do this, one check: you asked for {X}, this is {Y}. Which one?"; the buttons are replaced by
// two Secondary buttons, one per value, `card-approval-held-option` data-index 0–1), 08-4 §28.3–§28.4 (cannot_check,
// no_user_words lines), SM-A4, G-M5-03.
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import styles from '../Approval.module.css';

export function HeldStrip({ word, children }: { word: string; children: ReactNode }) {
  return (
    <div className={styles.held} role="alert">
      <Icon name="Warning" size={16} className={styles.heldIcon} />
      <span className={styles.heldWord}>{word}</span>
      <span>{children}</span>
    </div>
  );
}
