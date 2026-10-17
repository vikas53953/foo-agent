// Spec: 03-shell-2 §3.7.1 (frame: --panel-w, --bg-app, 1px --line left edge; L pushes, M/S overlay with --shadow-28 and no
// scrim, XS full page; slide 340 at --m-slow --ease-in / --m-normal --ease-out, instant with reduced motion; closed by the
// toggle, Ctrl+Shift+D, Esc inside it, an outside click in overlay modes, its Dismiss; <aside aria-label="Details for {name}">),
// §3.7.2 (header), §3.7.3 (sections), §3.7.4 (per-chat differences: group shows "In this group" and no spend).
import { useEffect, useRef } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { IconButton, type ChatRow } from '../_m1b-stubs';
import { DoingNow } from './DoingNow';
import { GroupMembers } from './GroupMembers';
import { KnowList } from './KnowList';
import styles from './RightShell.module.css';
import { SpentMeters } from './SpentMeters';
import { UsingChips } from './UsingChips';
import { useRightShell } from './useRightShell';

export function RightShell({ chat }: { chat: ChatRow }) {
  const panel = useRightShell();
  const ref = useRef<HTMLElement>(null);
  const overlay = panel.mode !== 'push';

  // Overlay modes: a click outside closes it (the Panel toggle handles its own click).
  useEffect(() => {
    if (!overlay || !panel.open) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el || ref.current?.contains(el) || el.closest(`[data-testid="${TID.chatHeaderPanel}"]`)) return;
      panel.close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [overlay, panel]);

  if (panel.mode === 'push' && !panel.open) return null;
  const name = chat.kind === 'foo' && chat.private ? t('chat_header.private.title') : chat.title;
  const group = chat.kind === 'group';

  return (
    <aside
      ref={ref}
      className={styles.panel}
      aria-label={t('app.panel.label', { name })}
      data-testid={TID.appPanel}
      data-mode={panel.mode}
      data-state={panel.open ? 'open' : 'closed'}
      aria-hidden={!panel.open || undefined}
      inert={!panel.open || undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && !(e.target as Element).closest('[role="menu"]')) {
          e.stopPropagation();
          panel.close(true);
        }
      }}
    >
      <header className={styles.header}>
        {panel.mode === 'page' && (
          <IconButton icon="ArrowLeft" label={t('app.panel.back')} data-testid={TID.appPanelBack} onClick={() => panel.close(true)} />
        )}
        <h2 className={styles.title} tabIndex={-1} data-panel-title>
          {t('app.panel.title')}
        </h2>
        {panel.mode !== 'page' && (
          <IconButton
            icon="Dismiss"
            label={t('app.panel.close')}
            data-testid={TID.appPanelClose}
            onClick={(e) => panel.close(e.detail === 0)}
          />
        )}
      </header>
      <div className={styles.body}>
        <DoingNow chat={chat} />
        <UsingChips chat={chat} />
        {group ? <GroupMembers chat={chat} /> : <KnowList chat={chat} />}
        {!group && <SpentMeters />}
      </div>
    </aside>
  );
}
