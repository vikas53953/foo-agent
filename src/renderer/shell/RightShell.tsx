// Spec: 03-shell-2 §3.7.1 (frame: --panel-w, --bg-app, 1px --line left edge; L pushes, M/S overlay with --shadow-28 and no
// scrim, XS full page; slide 340 at --m-slow --ease-in / --m-normal --ease-out, instant with reduced motion; closed by the
// toggle, Ctrl+Shift+D, Esc inside it, an outside click in overlay modes, its Dismiss; <aside aria-label="Details for {name}">),
// §3.7.2 (header), §3.7.3 (sections), §3.7.4 (per-chat differences: group shows "In this group" and no spend). R1 T7
// (CR-0022 pick 9): the chat's kept items close the panel.
import { useEffect, useRef } from 'react';
import { t } from '../../shared/copy/t';
import type { FeatureId } from '../../shared/features';
import { TID } from '../../shared/testids';
import type { ChatRow } from '../../shared/types';
import { registerFocusTarget } from '../a11y/focusTargets';
import { KeptList } from '../keep/KeptList';
import { useKeptList } from '../keep/kept';
import { useStore } from '../store/index';
import { IconButton } from '../ui/IconButton';
import { DoingNow } from './DoingNow';
import { GroupMembers } from './GroupMembers';
import { KnowList } from './KnowList';
import styles from './RightShell.module.css';
import { SpentMeters } from './SpentMeters';
import { UsingChips } from './UsingChips';
import { useRightShell } from './useRightShell';

/**
 * CR-0061 (X-218 item 9): whether the chat's details panel has a section in this build (the same gates as the body below,
 * CR-0054). With none, the panel stays shut and the header has no Details button, so batch 1 never shows a panel that
 * holds only its title. Kept items count once there are any.
 */
export function usePanelHasContent(chat: ChatRow | null): boolean {
  const features = useStore((s) => s.live.features);
  const on = (id: FeatureId) => features === null || features.includes(id);
  const sections = !!chat && (on('jobs') || on('connections') || on('pages') || chat.kind === 'group' || on('memory') || on('spend'));
  const kept = useKeptList(chat && !sections ? chat.id : null);
  return sections || (kept?.length ?? 0) > 0;
}

export function RightShell({ chat }: { chat: ChatRow }) {
  const panel = useRightShell();
  // CR-0054: a section whose feature this build left off is not shown.
  const features = useStore((s) => s.live.features);
  const on = (id: FeatureId) => features === null || features.includes(id);
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

  // F6 lands on the panel title (03-shell-2 §3.9.2).
  useEffect(
    () =>
      registerFocusTarget('panel', () => {
        const el = ref.current?.querySelector<HTMLElement>('[data-panel-title]');
        if (!el) return false;
        el.focus();
        return true;
      }),
    [],
  );

  const name = chat.kind === 'foo' && chat.private ? t('chat_header.private.title') : chat.title;
  const group = chat.kind === 'group';

  return (
    <aside
      ref={ref}
      className={styles.panel}
      aria-label={t('app.panel.label', { name })}
      data-testid={TID.appPanel}
      data-mode={panel.mode}
      data-state="open"
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
        {on('jobs') && <DoingNow chat={chat} />}
        {on('connections') && <UsingChips chat={chat} />}
        {group ? <GroupMembers chat={chat} /> : on('memory') && <KnowList chat={chat} />}
        {!group && on('spend') && <SpentMeters />}
        <KeptList chat={chat} />
      </div>
    </aside>
  );
}
