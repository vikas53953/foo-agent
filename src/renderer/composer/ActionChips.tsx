// Spec: 04-2 §21.7 "Action chips" (X-180, CR-0022: beside the reply chips, after the same reply, at most 3, each a Fluent
// icon + label in `--accent` (Call, Open map, Add to calendar, Open link), `bubble-action-chips` / `bubble-action-chip`; an
// action chip that acts for the user goes through the normal gates, Article 6; never after an Approval or Payment card),
// 04 §13.6 / 06-3 §14 C-26 ("This opens {domain}. Open it?" before anything opens outside foo), 02 §F7.1 (chips rise as the
// reply chips do), AT-367. R1 T7.
// Call, map and link open outside foo only after C-26, and main opens the URL it builds from the stored chip. A calendar
// chip adds something for the user, so it is sent to foo as the user's words and meets the calendar gate like typing it.
import { useState, type CSSProperties } from 'react';
import { chipDomain } from '../../shared/kit/actionChips';
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { ActionChip } from '../../shared/types';
import { invoke } from '../ipc/client';
import { clockNow } from '../store/apply';
import { useStore } from '../store/index';
import { selectAgentName, selectTimeZone } from '../store/settings';
import { Chip } from '../ui/Chip';
import { Dialog } from '../ui/Dialog';
import { Icon, type IconName } from '../ui/Icon';
import { newClientId, sendOutgoing } from './send';
import type { ActionView } from './suggestions';
import styles from './Composer.module.css';

const ICON: Record<ActionChip['kind'], IconName> = { call: 'Phone', map: 'Location', calendar: 'Calendar', link: 'Globe' };
/** The chip's kind in words, ahead of its own label for Narrator ("Call: Call Toit"). */
const KIND = {
  call: () => t('bubble.actions.call'),
  map: () => t('bubble.actions.map'),
  calendar: () => t('bubble.actions.calendar'),
  link: () => t('bubble.actions.link'),
} as const;

export function ActionChips({ chatId, view }: { chatId: string; view: ActionView }) {
  const timeZone = useStore(selectTimeZone);
  const agentName = useStore(selectAgentName);
  const [asking, setAsking] = useState<{ messageId: string; index: number; chip: ActionChip } | null>(null);
  if (!view) return null;
  const tap = (chip: ActionChip, index: number) => {
    if (chip.kind !== 'calendar') return setAsking({ messageId: view.messageId, index, chip });
    // A date-time with no zone is the user's own wall time: read it as UTC and show it in UTC, so it never shifts.
    const zoned = /(Z|[+-]\d{2}:\d{2})$/.test(chip.value);
    const at = Date.parse(zoned ? chip.value : `${chip.value}${chip.value.includes('T') ? '' : 'T00:00'}Z`);
    const when = Number.isNaN(at) ? chip.value : formatDate(at, 'full', { timeZone: zoned ? timeZone : 'UTC', now: clockNow() });
    void sendOutgoing({ chatId, clientId: newClientId(), text: `${chip.label}, ${when}`, attachments: [], ready: Promise.resolve([]) });
  };
  return (
    <div
      className={styles.suggestions}
      role="group"
      aria-label={t('bubble.actions.label', { agentName })}
      data-testid={TID.bubbleActionChips}
    >
      {view.items.map((chip, i) => (
        <Chip
          key={`${view.messageId}-${i}`}
          className={styles.actionChip}
          style={{ '--i': i } as CSSProperties}
          data-testid={TID.bubbleActionChip}
          data-kind={chip.kind}
          aria-label={`${KIND[chip.kind]()}: ${chip.label}`}
          onClick={() => tap(chip, i)}
        >
          <Icon name={ICON[chip.kind]} size={16} />
          <span data-copy="ai">{chip.label}</span>
        </Chip>
      ))}
      {asking && (
        <Dialog
          tid="aiPageOpenLink"
          title={t('page.open_link.title', { domain: chipDomain(asking.chip) })}
          primary={t('page.open_link.open')}
          secondary={t('page.open_link.cancel')}
          onClose={() => setAsking(null)}
          onPrimary={() => {
            const { messageId, index } = asking;
            setAsking(null);
            void invoke('app:openExternal', { target: 'action_chip', messageId, index });
          }}
        />
      )}
    </div>
  );
}
