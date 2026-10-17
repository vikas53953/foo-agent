// Spec: 05-3 §5.23.1 File card (56 high, `--card-w`; 40px tile `--bg-sunken` with Document / Image 24 `--fg-2`; name
// `--t-body-strong` with a middle ellipsis; "PDF · 240 KB" `--t-caption` `--fg-3`; the whole card is a button: click opens
// the file in its default app; context menu "Open", "Show in folder" ("Save as…" has no channel in M2: implementation-notes
// GAP); hover `--shadow-4`; missing: "I can't find this file. It was moved or deleted." + Link "Show folder"; Narrator
// "File: {name}, {type}, {size}"; generating: spinner 16 in the tile + "Making {name}…"; deleted: "File removed" grey; both
// do nothing on click), 08-5 §4.1 FilePayload, 08-1 §3.2 files:open / files:showInFolder.
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { formatBytes } from '../../shared/format';
import { TID } from '../../shared/testids';
import type { CardRow, FilePayload } from '../../shared/types';
import { invoke } from '../ipc/client';
import { Icon } from '../ui/Icon';
import { Menu } from '../ui/Menu';
import { Spinner } from '../ui/Spinner';
import { cx } from '../ui/cx';
import { MiddleName, typeLabel } from '../messages/BubbleParts';
import { CardTimeLabel, type CardTime } from './CardFrame';
import styles from './Card.module.css';

export function FileCard({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as FilePayload;
  const [missing, setMissing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const type = typeLabel(p.name, p.mime);
  const size = formatBytes(p.bytes);
  const open = () =>
    void invoke('files:open', { path: p.path }).then((r) => {
      if (!r.ok) setMissing(true);
    });
  const show = () => void invoke('files:showInFolder', { path: p.path });
  const generating = card.state === 'generating';
  const removed = card.state === 'deleted';
  const inert = generating || removed;
  const meta = generating
    ? t('cards.file.generating', { name: p.name })
    : removed
      ? t('cards.file.deleted')
      : missing
        ? t('cards.file.missing')
        : t('bubble.file.meta', { type, size });
  return (
    <>
      <button
        type="button"
        className={cx(styles.card, styles.surface, styles.file, removed && styles.removed)}
        aria-disabled={inert || undefined}
        data-testid={TID.cardFile}
        data-card-state={card.state}
        data-state={missing ? 'missing' : card.state}
        aria-label={t('cards.file.accessible_name', { name: p.name, type, size })}
        onClick={() => !inert && open()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!inert) setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <span className={styles.fileTile}>
          {generating ? <Spinner size={16} /> : <Icon name={p.mime?.startsWith('image/') ? 'Image' : 'Document'} size={24} />}
        </span>
        <span className={styles.fileText}>
          <MiddleName name={p.name} className={styles.fileName} />
          <span className={styles.fileMeta}>{meta}</span>
        </span>
        <CardTimeLabel {...time} />
      </button>
      {missing && !inert && (
        <button type="button" className={styles.link} data-testid={TID.cardFileShowFolder} onClick={show}>
          {t('cards.file.show_folder')}
        </button>
      )}
      {menu && (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          entries={[
            { kind: 'item', id: 'open', label: t('cards.file.menu.open'), tid: 'cardFileMenuOpen', onSelect: open },
            { kind: 'item', id: 'show', label: t('cards.file.menu.show'), tid: 'cardFileMenuShow', onSelect: show },
          ]}
        />
      )}
    </>
  );
}
