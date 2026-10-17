// Spec: 03-shell-2 §3.7.4 (group chat: "What I know" is replaced by "In this group": one row per member, 26 avatar + name, "You"
// first, then the line "Private things stay in your own chats." — Article 14).
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Avatar, selectHelpers, selectSettings, useStore, type ChatRow } from '../_m1b-stubs';
import styles from './GroupMembers.module.css';
import section from './PanelSection.module.css';

export function GroupMembers({ chat }: { chat: ChatRow }) {
  const helpers = useStore(selectHelpers);
  const settings = useStore(selectSettings);
  const you = t('app.panel.members.you');
  const members = (chat.memberIds ?? []).flatMap((id) => {
    const h = helpers[id];
    return h ? [h] : [];
  });
  return (
    <section className={section.section} data-testid={TID.appPanelMembers} aria-labelledby="app-panel-members-title">
      <h2 className={section.label} id="app-panel-members-title">
        {t('app.panel.members.title')}
      </h2>
      <ul className={styles.list}>
        <li className={styles.row} data-row-id="you">
          <Avatar
            faceRef={`letter:${(settings.user.firstName ?? you)[0]?.toUpperCase() ?? ''}`}
            name={settings.user.firstName ?? you}
            size={26}
          />
          <span className={styles.name}>{you}</span>
        </li>
        {members.map((h) => (
          <li key={h.id} className={styles.row} data-row-id={h.id}>
            <Avatar faceRef={h.faceRef} name={h.name} size={26} color={h.colorToken} />
            <span className={styles.name}>{h.name}</span>
          </li>
        ))}
      </ul>
      <p className={section.empty}>{t('app.panel.members.private_note')}</p>
    </section>
  );
}
