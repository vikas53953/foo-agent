// Spec: 06-2 §6.0 Settings frame: page header 60 ([←] "Settings"; back arrow / Esc → the chat it came from), nav
// `--settings-nav-w` 240 (11 items, 40 tall, padding 0 12px, `--r-sm`, 4px gap, Fluent icon 20 + label `--t-body`; selected
// `--bg-selected`, weight 600, Filled icon `--fg-1`, `aria-current="page"`; hover `--bg-hover`; one Tab stop, ↑/↓ move,
// Enter opens; `role="navigation"` "Settings pages"; test ids `settings-nav-{page}`), content max 760 centred, pad 24, page
// title `--t-title` heading level 2, 48 bottom. 06 §0 page root `screen-settings`. CR-0020 (b): this step builds the frame
// and the AI rows of Account & your AI (06-2 §6.1); "Search settings", the narrow (< 720px) drill-in layout and the other
// pages' rows arrive with the Settings milestone (M13), so those pages show their title only. P1 T9 (CR-0021 pick 22):
// Appearance (06-2 §6.2) is built whole.
import { useRef, type KeyboardEvent } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import type { SettingsPage as PageId } from '../../../shared/types';
import { back, update } from '../../store/index';
import { Icon, type IconName } from '../../ui/Icon';
import { cx } from '../../ui/cx';
import { PageHeader } from '../shared/PageHeader';
import { AccountAi } from './AccountAi';
import { AppearancePage } from './AppearancePage';
// M8 T2: Connections (06-2 §6.8; Google + X rows, the rest per CR-0012 G-M8-05)
import { ConnectionsPage } from './ConnectionsPage';
import styles from './SettingsPage.module.css';

interface NavItem {
  id: PageId;
  icon: IconName;
  tid: keyof typeof TID;
  label: () => string;
}

const NAV: NavItem[] = [
  { id: 'account', icon: 'PersonCircle', tid: 'settingsNavAccount', label: () => t('settings.nav.account') },
  { id: 'appearance', icon: 'PaintBrush', tid: 'settingsNavAppearance', label: () => t('settings.nav.appearance') },
  { id: 'notifications', icon: 'Alert', tid: 'settingsNavNotifications', label: () => t('settings.nav.notifications') },
  { id: 'permissions', icon: 'ShieldCheckmark', tid: 'settingsNavPermissions', label: () => t('settings.nav.permissions') },
  { id: 'money', icon: 'Money', tid: 'settingsNavMoney', label: () => t('settings.nav.money') },
  { id: 'privacy', icon: 'LockClosed', tid: 'settingsNavPrivacy', label: () => t('settings.nav.privacy') },
  {
    id: 'routines-settings',
    icon: 'ArrowRepeatAll',
    tid: 'settingsNavRoutinesSettings',
    label: () => t('settings.nav.routines_settings'),
  },
  { id: 'connections', icon: 'PlugConnected', tid: 'settingsNavConnections', label: () => t('settings.nav.connections') },
  { id: 'chat', icon: 'Mic', tid: 'settingsNavChat', label: () => t('settings.nav.chat') },
  { id: 'shortcuts', icon: 'Keyboard', tid: 'settingsNavShortcuts', label: () => t('settings.nav.shortcuts') },
  { id: 'about', icon: 'Info', tid: 'settingsNavAbout', label: () => t('settings.nav.about') },
];

/** Moving between pages replaces the view, so back / Esc still returns to the chat Settings was opened from. */
const openPage = (page: PageId) =>
  update((s) => {
    s.ui.view = { kind: 'settings', page };
  });

export function SettingsPage({ page }: { page: PageId }) {
  const nav = useRef<HTMLElement>(null);
  const current = NAV.find((n) => n.id === page) ?? NAV[0]!;

  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = Array.from(nav.current?.querySelectorAll<HTMLElement>('a, button') ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = list[e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className={styles.page} data-testid={TID.screenSettings} data-page={page} tabIndex={-1}>
      <PageHeader title={t('settings.page.title')} backLabel={t('settings.page.back')} onBack={back} />
      <div className={styles.body}>
        <nav ref={nav} className={styles.nav} aria-label={t('settings.page.nav_label')} onKeyDown={keys}>
          {NAV.map((n) => {
            const selected = n.id === current.id;
            return (
              <button
                key={n.id}
                type="button"
                className={cx(styles.navItem, selected && styles.navSelected)}
                data-testid={TID[n.tid]}
                aria-current={selected ? 'page' : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => openPage(n.id)}
              >
                <Icon name={n.icon} size={20} filled={selected} className={styles.navIcon} />
                {n.label()}
              </button>
            );
          })}
        </nav>
        <main className={styles.content}>
          <div className={styles.column}>
            <h2 className={styles.pageTitle}>{current.label()}</h2>
            {current.id === 'account' && <AccountAi />}
            {current.id === 'appearance' && <AppearancePage />}
            {current.id === 'connections' && <ConnectionsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
