// Spec: 06-2 §6.8 X row ("Drafts only", no Connect: X has no account connection, 08-3 §16.3, X-34; note "Posting isn't in
// this version. I'll draft posts and you post them in X.").
import { t } from '../../../../shared/copy/t';
import { TID } from '../../../../shared/testids';
import { RowGroup } from '../../shared/RowGroup';
import styles from '../ConnectionsPage.module.css';

export function XRow() {
  return (
    <RowGroup>
      <li className={styles.group} data-testid={TID.settingsRowConnectionsX}>
        <div className={styles.header}>
          <div className={styles.text}>
            <span className={styles.name}>{t('settings.connections.app.x')}</span>
            <span className={styles.status}>{t('settings.connections.x.status')}</span>
          </div>
        </div>
        <p className={styles.note}>{t('settings.connections.x.note')}</p>
      </li>
    </RowGroup>
  );
}
