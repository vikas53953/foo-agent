// Spec: 03-shell-1 §3.2: an empty drag strip; Windows draws the caption buttons (titleBarOverlay).
import { TID } from '../../shared/testids';
import styles from './TitleBar.module.css';

export function TitleBar() {
  return <div className={styles.strip} data-testid={TID.titlebarStrip} aria-hidden="true" />;
}
