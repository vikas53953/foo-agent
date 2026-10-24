// Spec: 03-shell-1 §3.4.2 left shell header (60 high, padding 0 16, no bottom border; "foo" wordmark in `--t-wordmark`,
// never `{agentName}`, not a button, a drag region; "+ New helper" outline pill 32 with Add 16, disabled with the tooltip
// "Finish setting up first" until setup is done, tooltip "New helper (Ctrl+N)"; More options MoreHorizontal 20 in a 36
// icon button, 8 after the button; the More options menu items in order with their shortcuts and test ids). CR-0054: items
// and the New helper button of a feature this build left off are not shown.
import { useCallback, useRef, useState } from 'react';
import { t } from '../../shared/copy/t';
import type { FeatureId } from '../../shared/features';
import { TID } from '../../shared/testids';
import { invoke } from '../ipc/client';
import { KEY_HINT } from '../shell/keys';
import { navigate, openDialog, setMenu, useStore } from '../store/index';
import { selectSetupComplete } from '../store/settings';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Menu, type MenuEntry } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import styles from './ChatListHeader.module.css';

export const MORE_MENU_ID = 'sidebar-more';

/** Quit foo (09 §9.8.4 via 08-1 §2.3): main quits at once when nothing runs, else the renderer asks first. */
async function quit(): Promise<void> {
  try {
    const r = await invoke('app:quit', { confirm: false });
    if (r.ok && !r.value.quitting) openDialog('c-quit');
  } catch (e) {
    console.warn('app:quit', e);
  }
}

/** CR-0054: the feature each item belongs to; an item whose feature is off is not in the menu. */
const ITEM_FEATURE: Partial<Record<string, FeatureId>> = {
  'new-helper': 'helpers',
  'new-group': 'groups',
  memory: 'memory',
  routines: 'routines',
  ideas: 'ideas',
  activity: 'data',
};

function moreEntries(setup: boolean, on: (id: FeatureId) => boolean): MenuEntry[] {
  const all: MenuEntry[] = [
    {
      kind: 'item',
      id: 'new-helper',
      label: t('sidebar.menu.new_helper'),
      tid: 'sidebarMenuNewHelper',
      shortcut: KEY_HINT.newHelper,
      disabled: !setup,
      onSelect: () => openDialog('new-helper'),
    },
    {
      kind: 'item',
      id: 'new-group',
      label: t('sidebar.menu.new_group'),
      tid: 'sidebarMenuNewGroup',
      shortcut: KEY_HINT.newGroup,
      disabled: !setup,
      onSelect: () => openDialog('new-group'),
    },
    { kind: 'separator', id: 's1' },
    {
      kind: 'item',
      id: 'memory',
      label: t('sidebar.menu.memory'),
      tid: 'sidebarMenuMemory',
      onSelect: () => navigate({ kind: 'screen', id: 'memory' }),
    },
    {
      kind: 'item',
      id: 'routines',
      label: t('sidebar.menu.routines'),
      tid: 'sidebarMenuRoutines',
      onSelect: () => navigate({ kind: 'screen', id: 'routines' }),
    },
    {
      kind: 'item',
      id: 'ideas',
      label: t('sidebar.menu.ideas'),
      tid: 'sidebarMenuIdeas',
      onSelect: () => navigate({ kind: 'screen', id: 'ideas' }),
    },
    {
      kind: 'item',
      id: 'activity',
      label: t('sidebar.menu.activity'),
      tid: 'sidebarMenuActivity',
      onSelect: () => navigate({ kind: 'screen', id: 'activity' }),
    },
    {
      kind: 'item',
      id: 'settings',
      label: t('sidebar.menu.settings'),
      tid: 'sidebarMenuSettings',
      shortcut: KEY_HINT.settings,
      onSelect: () => navigate({ kind: 'settings', page: 'account' }),
    },
    {
      kind: 'item',
      id: 'shortcuts',
      label: t('sidebar.menu.shortcuts'),
      tid: 'sidebarMenuShortcuts',
      shortcut: KEY_HINT.shortcuts,
      onSelect: () => openDialog('shortcuts'),
    },
    { kind: 'separator', id: 's2' },
    { kind: 'item', id: 'quit', label: t('sidebar.menu.quit'), tid: 'sidebarMenuQuit', onSelect: () => void quit() },
  ];
  const kept = all.filter((e) => {
    const f = ITEM_FEATURE[e.id];
    return !f || on(f);
  });
  // No separator first or two in a row once items are gone.
  return kept.filter((e, i) => e.kind !== 'separator' || (i > 0 && kept[i - 1]?.kind !== 'separator'));
}

export function ChatListHeader() {
  const setup = useStore(selectSetupComplete);
  const features = useStore((s) => s.live.features);
  const on = (id: FeatureId) => features === null || features.includes(id);
  const menuOpen = useStore((s) => s.ui.menu === MORE_MENU_ID);
  const more = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // The menu closes itself on any outside pointerdown, so a click on the opener must not reopen it.
  const wasOpen = useRef(false);

  const close = useCallback((chose: boolean) => {
    setMenu(null);
    setAnchor(null);
    if (!chose) more.current?.focus();
  }, []);

  return (
    <div className={styles.header}>
      <span className={styles.wordmark}>{t('sidebar.header.wordmark')}</span>
      {on('helpers') && (
        <Tooltip text={setup ? t('sidebar.new_helper.tooltip') : t('sidebar.new_helper.tooltip.disabled')}>
          <Button
            variant="outline"
            size="sm"
            icon="Add"
            disabled={!setup}
            data-testid={TID.sidebarNewHelper}
            onClick={() => openDialog('new-helper')}
          >
            {t('sidebar.new_helper.label')}
          </Button>
        </Tooltip>
      )}
      <IconButton
        ref={more}
        icon="MoreHorizontal"
        label={t('sidebar.more.label')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid={TID.sidebarMore}
        onPointerDown={() => {
          wasOpen.current = menuOpen;
        }}
        onClick={(e) => {
          if (menuOpen || wasOpen.current) {
            wasOpen.current = false;
            if (menuOpen) close(false);
            return;
          }
          setAnchor(e.currentTarget);
          setMenu(MORE_MENU_ID);
        }}
      />
      {menuOpen && anchor && (
        <Menu entries={moreEntries(setup, on)} anchor={{ el: anchor, align: 'end' }} label={t('sidebar.more.label')} onClose={close} />
      )}
    </div>
  );
}
