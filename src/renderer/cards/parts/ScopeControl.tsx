// Spec: 05-2 §5.5.1 / §5.5.3 (scope: 06 §0.4 segmented control, full inner width, 3 equal segments, default "Just this
// once", shown only when the card offers it; "Always" adds the line "I won't ask again for {verb phrase}. Change this in
// Settings → Permissions."), §5.5.5 (group label "How long this yes lasts"; ←/→ inside), 08-1 §3.2 ApprovalScope.
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import type { ApprovalScope } from '../../../shared/types';
import { Segmented } from '../../ui/Segmented';
import styles from '../Approval.module.css';

const LABEL: Record<ApprovalScope, () => string> = {
  once: () => t('cards.approval.scope.once'),
  chat: () => t('cards.approval.scope.chat'),
  always: () => t('cards.approval.scope.always'),
};

export function ScopeControl({
  scopes,
  value,
  onChange,
  verbPhrase,
}: {
  scopes: ApprovalScope[];
  value: ApprovalScope;
  onChange: (s: ApprovalScope) => void;
  verbPhrase: string;
}) {
  return (
    <div className={styles.scope}>
      <Segmented
        tid="cardApprovalScope"
        label={t('cards.approval.scope_label')}
        value={value}
        options={scopes.map((s) => ({ value: s, label: LABEL[s]() }))}
        onChange={onChange}
      />
      {value === 'always' && (
        <div className={styles.alwaysLine} data-testid={TID.cardApprovalAlwaysLine}>
          {t('cards.approval.always_line', { verbPhrase })}
        </div>
      )}
    </div>
  );
}
