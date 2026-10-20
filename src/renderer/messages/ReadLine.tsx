// Spec: 04 §6.5 ("foo read:" line `bubble-read-line`: under the last user bubble only, 4px below it, aligned with the
// bubble's right edge; "{agentName} read:" then the items joined by " · ", `--t-caption` `--fg-3`, one line with ellipsis;
// a tooltip shows the full list; Narrator "{agentName} understood: {items}"; hidden when nothing was found, in groups and
// in WhatsApp mirrors; not part of the bubble and not copied), CR-0022 (X-180), AT-363. R1 T6.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Tooltip } from '../ui/Tooltip';
import styles from './ReadLine.module.css';

export const READ_JOIN = ' · ';

/** Whether a user bubble shows the line (04 §6.5). */
export function showsReadLine(o: {
  understood: readonly string[] | null;
  isLatestUser: boolean;
  chatKind: string;
  deleted: boolean;
}): boolean {
  return !!o.understood?.length && o.isLatestUser && !o.deleted && o.chatKind !== 'group' && o.chatKind !== 'wa_mirror';
}

export function ReadLine({ items, agentName }: { items: readonly string[]; agentName: string }) {
  const list = items.join(READ_JOIN);
  return (
    <div className={styles.line}>
      <Tooltip text={list} side="top" className={styles.tip}>
        <span
          className={styles.text}
          data-testid={TID.bubbleReadLine}
          role="note"
          tabIndex={0}
          aria-label={t('bubble.read.accessible_name', { agentName, items: list })}
        >
          {t('bubble.read.label', { agentName })} {list}
        </span>
      </Tooltip>
    </div>
  );
}
