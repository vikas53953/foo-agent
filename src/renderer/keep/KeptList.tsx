// Spec: CR-0022 pick 9 (a kept item is a `kept_items` row shown in the chat's Files tab; "Open" always reopens a kept page in
// the sealed box, never with `shell.openPath`; "Show in folder" is allowed), 06-1 §4.1 "Files {Helper} made" (the file row:
// 32px type icon, name `--t-body` with ellipsis, "{date}" `--t-small` `--fg-2`, [ Open ] [ Show ]), 03-shell-2 §3.7.3
// (panel section frame), 08-1 §3.2 `keep:list` / `keep:open` / `keep:showInFolder`, AT-369, X-180. R1 T7.
// The chat's Files tab is not built yet (06-1 §4 profile pages), so the list is the last section of the chat's details
// panel until it is (R1.tsv, lead).
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { ChatRow, KeptItem } from '../../shared/types';
import section from '../shell/PanelSection.module.css';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectFeatureOn, selectNow } from '../store/live';
import { selectTimeZone } from '../store/settings';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useKeptList } from './kept';
import { KeptView } from '../pages/lazyKit';
import styles from './KeptList.module.css';

export function KeptList({ chat }: { chat: ChatRow }) {
  const items = useKeptList(chat.id);
  const timeZone = useStore(selectTimeZone);
  const now = useStore(selectNow);
  const [open, setOpen] = useState<KeptItem | null>(null);
  // CR-0061 (X-218 item 7): while mini pages are off (CR-0054) nothing in the build makes a kept page, so an empty list is not
  // shown at all; anything kept still shows.
  const pagesOn = useStore(selectFeatureOn('pages'));
  if (items === null || (!items.length && !pagesOn)) return null;
  return (
    <section
      className={section.section}
      data-testid={TID.appPanelKept}
      data-empty={!items.length || undefined}
      aria-labelledby="app-panel-kept-title"
    >
      <h2 className={section.label} id="app-panel-kept-title">
        {t('app.panel.kept.label')}
      </h2>
      {items.length === 0 ? (
        <p className={section.empty}>{t('app.panel.kept.empty')}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((k) => (
            <li key={k.id} className={styles.row} data-testid={TID.filesKeptItem} data-row-id={k.id} data-kind={k.kind}>
              <span className={styles.icon} aria-hidden="true">
                <Icon name={k.kind === 'kit' ? 'Image' : 'Document'} size={20} />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{k.title}</span>
                <span className={styles.meta}>{formatDate(k.createdAt, 'date', { timeZone, now })}</span>
              </span>
              <span className={styles.actions}>
                <Button variant="subtle" data-action="open" onClick={() => setOpen(k)}>
                  {t('kit.keep.open')}
                </Button>
                <Button variant="subtle" data-action="show" onClick={() => void invoke('keep:showInFolder', { id: k.id })}>
                  {t('kit.keep.show_in_folder')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && <KeptView item={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
