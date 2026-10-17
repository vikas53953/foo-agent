// Spec: 04-2 §22.6 drag-drop overlay (`thread-drop`): files dragged over the window while a chat is open; covers the main shell
// below the chat header, inset 16; 1.5px dashed --accent, --r-lg, --accent-soft, fade --m-normal; Attach 24 --accent, "Drop to
// add to your message" --t-title --accent, "Photos and files, up to 25 MB each" --t-small --fg-2; some files not allowed →
// "Some of these can’t be added. I’ll add the rest."; none allowed → --bad / --bad-soft, "{agentName} can’t take these
// files" and the matching limits line; composer disabled → "Connect your AI first" in the Bad style, drops nothing.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import styles from './Composer.module.css';

export type DropLook = { kind: 'ok' } | { kind: 'some' } | { kind: 'none'; subline: string } | { kind: 'disabled' };

export function DropOverlay({ look, agentName }: { look: DropLook; agentName: string }) {
  const bad = look.kind === 'none' || look.kind === 'disabled';
  const title =
    look.kind === 'disabled'
      ? t('composer.placeholder.not_set_up')
      : look.kind === 'none'
        ? t('composer.drop.none_title', { agentName })
        : t('composer.drop.title');
  const sub = look.kind === 'some' ? t('composer.drop.some_blocked') : look.kind === 'none' ? look.subline : t('composer.drop.subline');
  return (
    <div className={styles.drop} data-testid={TID.threadDrop} data-state={look.kind} data-bad={bad || undefined} aria-hidden>
      <span className={styles.dropIcon}>
        <Icon name="Attach" size={24} />
      </span>
      <span className={styles.dropTitle}>{title}</span>
      {look.kind !== 'disabled' && <span className={styles.dropSub}>{sub}</span>}
    </div>
  );
}
