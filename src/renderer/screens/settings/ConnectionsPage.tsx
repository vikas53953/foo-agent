// Spec: 06-2 §6.8 Connections page (`connections`): the Gmail, Calendar, Contacts and X rows (Outlook not rendered while
// flags.outlook is false, X-41; WhatsApp rows arrive with T3; Browser / Your AI / Internet rows are M9 / M13, CR-0012
// G-M8-05), C-10 for "Disconnect Google"; 08-1 §3.3 rows follow connection:upsert through the connections slice.
import { t } from '../../../shared/copy/t';
import { useGoogleInfo } from '../../cards/connect/useGoogleInfo';
import { C10DisconnectGoogle } from '../confirms/C10DisconnectGoogle';
import { GoogleRows } from './connections/GoogleRows';
import { XRow } from './connections/XRow';
import styles from './ConnectionsPage.module.css';

export function ConnectionsPage() {
  const info = useGoogleInfo();
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('settings.connections.page.title')}</h1>
      <GoogleRows available={info?.available ?? true} />
      <XRow />
      <C10DisconnectGoogle />
    </div>
  );
}
