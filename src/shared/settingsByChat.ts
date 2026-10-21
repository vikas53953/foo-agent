// Spec: CR-0043 (X-201), 08-4 §25.6 as amended (settings by words), 08-0 §A.3 (the allow-list), 08-1 §4.4.2 (settings:set,
// settings:undo), 06-2 row labels (§6.2 Appearance, §6.3 Notifications, §6.6 Privacy). One place says which paths the AI may
// change by chat in this build, how the "Changed: {row} → {value}." line names them, and which Settings page a refusal opens.
import { t } from './copy/t';
import { formatTime, formatWeekday } from './format';
import type { SettingsPage } from './types';

/** 08-0 §A.3 paths that exist in today's settings and can change by chat. `notifications.quiet` takes { on?, from?, to? }. */
export const CHAT_SETTING_PATHS = [
  'appearance.theme',
  'appearance.useWindowsAccent',
  'zoom',
  'notifications.quiet',
  'notifications.quiet.on',
  'notifications.quiet.from',
  'notifications.quiet.to',
  'notifications.quiet.days',
  'notifications.unpromptedPerDay',
  'privacy.learnFromChats',
  'privacy.askBeforeRemembering',
  'privacy.screenshotDays',
] as const;
export type ChatSettingPath = (typeof CHAT_SETTING_PATHS)[number];

/** On the 08-0 §A.3 list, but the setting is not in this build yet (CR-0043): foo says it can't change it yet. */
export function chatSettingNotBuilt(path: string): boolean {
  return (
    path === 'chat.voiceReplies' ||
    path.startsWith('notifications.kinds.') ||
    path.startsWith('notifications.mutedChats') ||
    path === 'brief' ||
    path.startsWith('brief.')
  );
}

export const isChatSettingPath = (path: string): path is ChatSettingPath => (CHAT_SETTING_PATHS as readonly string[]).includes(path);

/** What the chat line and the marker row carry (`messages.why.settingLine`). */
export interface SettingLineData {
  kind: 'changed' | 'refused' | 'not_built';
  changeId?: string;
  path?: string;
  /** After [ Undo ]: undone, or too_late when the value changed again since (08-1 §4.4.2 step 4). */
  state?: 'undone' | 'too_late';
  page?: SettingsPage;
}

const ROW: Record<ChatSettingPath, () => string> = {
  'appearance.theme': () => t('settings.appearance.theme.label'),
  'appearance.useWindowsAccent': () => t('settings.appearance.accent.label'),
  zoom: () => t('settings.appearance.zoom.label'),
  'notifications.quiet': () => t('thread.setting.row.quiet'),
  'notifications.quiet.on': () => t('thread.setting.row.quiet'),
  'notifications.quiet.from': () => t('thread.setting.row.quiet_from'),
  'notifications.quiet.to': () => t('thread.setting.row.quiet_to'),
  'notifications.quiet.days': () => t('thread.setting.row.quiet_days'),
  'notifications.unpromptedPerDay': () => t('thread.setting.row.unprompted'),
  'privacy.learnFromChats': () => t('thread.setting.row.learn'),
  'privacy.askBeforeRemembering': () => t('thread.setting.row.ask'),
  'privacy.screenshotDays': () => t('thread.setting.row.screenshots'),
};

/** "22:00" → "10:00 PM" (F19.3 `h:mm a`). */
export function clock12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return formatTime(Date.UTC(2000, 0, 2, h, m), { timeZone: 'UTC' });
}

/** 0 = Sunday → "Sun" (Sun 2 Jan 2000 is day 0). */
const dayName = (d: number) => formatWeekday(Date.UTC(2000, 0, 2 + d, 12), 'UTC');
const onOff = (v: unknown) => (v ? t('thread.setting.value.on') : t('thread.setting.value.off'));

/** The value as the line shows it ("Dark", "110%", "10:00 PM to 7:00 AM", "Don't keep"). */
export function settingValueLabel(path: ChatSettingPath, value: unknown): string {
  switch (path) {
    case 'appearance.theme':
      return t(`settings.appearance.theme.${value as 'system' | 'light' | 'dark'}`);
    case 'zoom':
      return t('settings.appearance.zoom.value', { n: String(value) });
    case 'notifications.quiet': {
      const q = value as { on: boolean; from: string; to: string };
      return q.on ? t('thread.setting.value.quiet_range', { from: clock12(q.from), to: clock12(q.to) }) : onOff(false);
    }
    case 'notifications.quiet.from':
    case 'notifications.quiet.to':
      return clock12(String(value));
    case 'notifications.quiet.days':
      return (value as number[])
        .slice()
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map(dayName)
        .join(', ');
    case 'notifications.unpromptedPerDay':
      return t('thread.setting.value.per_day', { n: String(value) });
    case 'privacy.screenshotDays':
      return value === 0
        ? t('thread.setting.value.dont_keep')
        : value === 1
          ? t('thread.setting.value.one_day')
          : t('thread.setting.value.days', { n: String(value) });
    default:
      return onOff(value);
  }
}

export const settingRowLabel = (path: ChatSettingPath): string => ROW[path]();

/** The Settings page a refusal's [ Open Settings ] opens: the page the path's first part names, else Account. */
export function settingsPageFor(path: string): SettingsPage {
  const head = path.split('.')[0]!.toLowerCase();
  if (head.startsWith('permission') || head === 'rules') return 'permissions';
  if (/cap|money|spend|pay|budget/.test(path.toLowerCase())) return 'money';
  const pages: Record<string, SettingsPage> = {
    appearance: 'appearance',
    zoom: 'appearance',
    notifications: 'notifications',
    privacy: 'privacy',
    connections: 'connections',
    chat: 'chat',
    routines: 'routines-settings',
  };
  return pages[head] ?? 'account';
}
