// Spec: 06-3 §19 keyboard shortcuts sheet (groups and rows in this order; values from 09 §9.17, 06 §0.10, 04 §22.2; the cards
// line), 06-2 §6.10 (the same list as Settings page rows), CR-0060 (X-217): a row shows only when the feature it opens is on in
// this build (CR-0054), so the list never offers a key that does nothing. Key names are Windows key names, not copy.
import { t } from '../../shared/copy/t';
import type { FeatureId } from '../../shared/features';

export interface ShortcutRow {
  /** §19 action id: `dialog-shortcuts-row` data-row-id, `settings-row-shortcuts-{id}`. */
  id: string;
  label: () => string;
  /** Key caps, one group per alternative ("Ctrl+= / Ctrl+- / Ctrl+0"). */
  keys: string[][];
  /** "(hold)" after the caps. */
  hold?: boolean;
  feature: FeatureId;
  /** A Playwright key the bug-finder sweep presses to prove the row does something (QA-B1-083); absent = not pressable alone. */
  press?: string;
}

export interface ShortcutGroup {
  id: string;
  label: () => string;
  rows: ShortcutRow[];
}

const k = (...caps: string[]) => caps;

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'getting_around',
    label: () => t('shortcuts.group.getting_around'),
    rows: [
      { id: 'search', label: () => t('shortcuts.row.search'), keys: [k('Ctrl', 'K')], feature: 'search', press: 'Control+k' },
      {
        id: 'search_chats',
        label: () => t('shortcuts.row.search_chats'),
        keys: [k('Ctrl', 'Shift', 'F')],
        feature: 'chat',
        press: 'Control+Shift+f',
      },
      { id: 'find', label: () => t('shortcuts.row.find'), keys: [k('Ctrl', 'F')], feature: 'chat', press: 'Control+f' },
      { id: 'areas', label: () => t('shortcuts.row.areas'), keys: [k('F6'), k('Shift', 'F6')], feature: 'chat' },
      {
        id: 'details',
        label: () => t('shortcuts.row.details'),
        keys: [k('Ctrl', 'Shift', 'D')],
        feature: 'chat',
        press: 'Control+Shift+d',
      },
      { id: 'needs_you', label: () => t('shortcuts.row.needs_you'), keys: [k('Ctrl', 'J')], feature: 'jobs', press: 'Control+j' },
      { id: 'back', label: () => t('shortcuts.row.back'), keys: [k('Esc')], feature: 'chat' },
      {
        id: 'zoom',
        label: () => t('shortcuts.row.zoom'),
        keys: [k('Ctrl', '='), k('Ctrl', '-'), k('Ctrl', '0')],
        feature: 'settings',
        press: 'Control+=',
      },
      { id: 'close_window', label: () => t('shortcuts.row.close_window'), keys: [k('Ctrl', 'W')], feature: 'install' },
    ],
  },
  {
    id: 'chats',
    label: () => t('shortcuts.group.chats'),
    rows: [
      {
        id: 'next_chat',
        label: () => t('shortcuts.row.next_chat'),
        keys: [k('Ctrl', 'Tab'), k('Ctrl', 'Shift', 'Tab')],
        feature: 'helpers',
      },
      { id: 'next_needs_you', label: () => t('shortcuts.row.next_needs_you'), keys: [k('Alt', 'Shift', '↓')], feature: 'jobs' },
      { id: 'open_chat', label: () => t('shortcuts.row.open_chat'), keys: [k('Ctrl', '1…9')], feature: 'helpers' },
      { id: 'pin', label: () => t('shortcuts.row.pin'), keys: [k('Ctrl', 'Shift', 'P')], feature: 'helpers' },
      { id: 'mute', label: () => t('shortcuts.row.mute'), keys: [k('Ctrl', 'Shift', 'M')], feature: 'chat', press: 'Control+Shift+m' },
      { id: 'unread', label: () => t('shortcuts.row.unread'), keys: [k('Ctrl', 'Shift', 'U')], feature: 'chat', press: 'Control+Shift+u' },
      { id: 'profile', label: () => t('shortcuts.row.profile'), keys: [k('Ctrl', 'I')], feature: 'name', press: 'Control+i' },
    ],
  },
  {
    id: 'make_open',
    label: () => t('shortcuts.group.make_open'),
    rows: [
      { id: 'new_helper', label: () => t('shortcuts.row.new_helper'), keys: [k('Ctrl', 'N')], feature: 'helpers', press: 'Control+n' },
      {
        id: 'new_group',
        label: () => t('shortcuts.row.new_group'),
        keys: [k('Ctrl', 'Shift', 'N')],
        feature: 'groups',
        press: 'Control+Shift+n',
      },
      { id: 'settings', label: () => t('shortcuts.row.settings'), keys: [k('Ctrl', ',')], feature: 'settings', press: 'Control+,' },
      { id: 'memory', label: () => t('shortcuts.row.memory'), keys: [k('Ctrl', 'M')], feature: 'memory', press: 'Control+m' },
      { id: 'routines', label: () => t('shortcuts.row.routines'), keys: [k('Ctrl', 'R')], feature: 'routines', press: 'Control+r' },
      { id: 'activity', label: () => t('shortcuts.row.activity'), keys: [k('Ctrl', 'H')], feature: 'jobs', press: 'Control+h' },
      { id: 'this_list', label: () => t('shortcuts.row.this_list'), keys: [k('Ctrl', '/')], feature: 'settings' },
    ],
  },
  {
    id: 'talking',
    label: () => t('shortcuts.group.talking'),
    rows: [
      { id: 'hold_to_talk', label: () => t('shortcuts.row.hold_to_talk'), keys: [k('Ctrl', 'Space')], hold: true, feature: 'voice' },
      { id: 'dictate', label: () => t('shortcuts.row.dictate'), keys: [k('Win', 'H')], feature: 'voice' },
      { id: 'send', label: () => t('shortcuts.row.send'), keys: [k('Enter')], feature: 'chat' },
      { id: 'new_line', label: () => t('shortcuts.row.new_line'), keys: [k('Shift', 'Enter')], feature: 'chat' },
      { id: 'watch_live', label: () => t('shortcuts.row.watch_live'), keys: [k('Ctrl', 'Shift', 'L')], feature: 'live' },
    ],
  },
];

/** The §19 cards line shows with the cards it is about (approvals and payments come with jobs). */
export const CARDS_LINE_FEATURE: FeatureId = 'jobs';

/** The groups with only the rows whose feature is on (`features` null = every feature, as CR-0054's FOO_TEST runs). */
export function shortcutGroups(features: readonly FeatureId[] | null, query = ''): ShortcutGroup[] {
  const q = query.trim().toLocaleLowerCase('en-IN');
  return SHORTCUT_GROUPS.map((g) => ({
    ...g,
    rows: g.rows.filter(
      (r) =>
        (features === null || features.includes(r.feature)) &&
        (!q || r.label().toLocaleLowerCase('en-IN').includes(q) || r.keys.flat().join(' ').toLocaleLowerCase('en-IN').includes(q)),
    ),
  })).filter((g) => g.rows.length > 0);
}
