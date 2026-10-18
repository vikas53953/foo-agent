// Spec: 06-2 §6.0 "Search settings" (live, local, no AI; matches row labels, second lines and the synonyms below; results
// "{Row label} · {Page}"), §6.1–§6.11 row ids and final labels, X-07 (page names), 06-3 §12.3 (Search's Settings group,
// G-M13-16). One static entry per row that has a label; rows with no label (meters, the theme preview, per-folder rows) are
// not searchable. Shared so main's search:query (T5) and the renderer's Settings search read the same list (CR-0017).
import { t } from './copy/t';
import type { SettingsPage } from './types';

export interface IndexCtx {
  agentName: string;
}

export interface SettingsIndexEntry {
  page: SettingsPage;
  row: string;
  label: (ctx: IndexCtx) => string;
  second?: () => string;
}

/** The 11 pages in nav order (06-2 §6.0, X-07). */
export const SETTINGS_PAGES: readonly SettingsPage[] = [
  'account',
  'appearance',
  'notifications',
  'permissions',
  'money',
  'privacy',
  'routines-settings',
  'connections',
  'chat',
  'shortcuts',
  'about',
];

export function pageLabel(page: SettingsPage): string {
  switch (page) {
    case 'account':
      return t('settings.nav.account');
    case 'appearance':
      return t('settings.nav.appearance');
    case 'notifications':
      return t('settings.nav.notifications');
    case 'permissions':
      return t('settings.nav.permissions');
    case 'money':
      return t('settings.nav.money');
    case 'privacy':
      return t('settings.nav.privacy');
    case 'routines-settings':
      return t('settings.nav.routines_settings');
    case 'connections':
      return t('settings.nav.connections');
    case 'chat':
      return t('settings.nav.chat');
    case 'shortcuts':
      return t('settings.nav.shortcuts');
    case 'about':
      return t('settings.nav.about');
  }
}

export const SETTINGS_INDEX: readonly SettingsIndexEntry[] = [
  { page: 'account', row: 'you-name', label: () => t('settings.account.row.you_name.label') },
  {
    page: 'account',
    row: 'start-login',
    label: () => t('settings.account.row.start_login.label'),
    second: () => t('settings.account.row.start_login.second'),
  },
  { page: 'account', row: 'close-choice', label: () => t('settings.account.row.close_choice.label') },
  { page: 'account', row: 'graphics', label: () => t('settings.account.row.graphics.label') },
  { page: 'account', row: 'ai-using', label: () => t('settings.account.row.ai_using.label') },
  { page: 'account', row: 'ai-backup', label: () => t('settings.account.row.ai_backup.label') },
  { page: 'account', row: 'ai-paid', label: () => t('settings.account.row.ai_paid.label') },
  { page: 'account', row: 'ai-add', label: () => t('settings.account.row.ai_add.label') },
  {
    page: 'account',
    row: 'setup-again',
    label: () => t('settings.account.row.setup_again.label'),
    second: () => t('settings.account.row.setup_again.second'),
  },
  { page: 'account', row: 'foo-profile', label: ({ agentName }) => t('settings.account.row.foo_profile.label', { agentName }) },
  { page: 'appearance', row: 'theme', label: () => t('settings.appearance.row.theme.label') },
  { page: 'appearance', row: 'accent', label: () => t('settings.appearance.row.accent.label') },
  {
    page: 'appearance',
    row: 'zoom',
    label: () => t('settings.appearance.row.zoom.label'),
    second: () => t('settings.appearance.row.zoom.second'),
  },
  { page: 'appearance', row: 'animations', label: () => t('settings.appearance.row.animations.label') },
  {
    page: 'notifications',
    row: 'n-needs-you',
    label: () => t('settings.notifications.row.n_needs_you.label'),
    second: () => t('settings.notifications.row.n_needs_you.second'),
  },
  { page: 'notifications', row: 'n-done', label: () => t('settings.notifications.row.n_done.label') },
  {
    page: 'notifications',
    row: 'n-routine',
    label: () => t('settings.notifications.row.n_routine.label'),
    second: () => t('settings.notifications.row.n_routine.second'),
  },
  { page: 'notifications', row: 'n-brief', label: () => t('settings.notifications.row.n_brief.label') },
  { page: 'notifications', row: 'n-helper', label: () => t('settings.notifications.row.n_helper.label') },
  {
    page: 'notifications',
    row: 'n-problem',
    label: () => t('settings.notifications.row.n_problem.label'),
    second: () => t('settings.notifications.row.n_problem.second'),
  },
  { page: 'notifications', row: 'n-sound', label: () => t('settings.notifications.row.n_sound.label') },
  {
    page: 'notifications',
    row: 'quiet-on',
    label: () => t('settings.notifications.row.quiet_on.label'),
    second: () => t('settings.notifications.row.quiet_on.second'),
  },
  { page: 'notifications', row: 'quiet-from', label: () => t('settings.notifications.row.quiet_from.label') },
  { page: 'notifications', row: 'quiet-to', label: () => t('settings.notifications.row.quiet_to.label') },
  { page: 'notifications', row: 'quiet-days', label: () => t('settings.notifications.row.quiet_days.label') },
  {
    page: 'notifications',
    row: 'quiet-urgent',
    label: () => t('settings.notifications.row.quiet_urgent.label'),
    second: () => t('settings.notifications.row.quiet_urgent.second'),
  },
  { page: 'notifications', row: 'unprompted', label: () => t('settings.notifications.row.unprompted.label') },
  {
    page: 'notifications',
    row: 'brief-time',
    label: () => t('settings.notifications.row.brief_time.label'),
    second: () => t('settings.notifications.row.brief_time.second'),
  },
  { page: 'notifications', row: 'mute-note', label: () => t('settings.notifications.row.mute_note.label') },
  { page: 'permissions', row: 'p-read', label: () => t('settings.permissions.row.p_read.label') },
  { page: 'permissions', row: 'p-drafts', label: () => t('settings.permissions.row.p_drafts.label') },
  { page: 'permissions', row: 'p-calendar', label: () => t('settings.permissions.row.p_calendar.label') },
  { page: 'permissions', row: 'p-send', label: () => t('settings.permissions.row.p_send.label') },
  { page: 'permissions', row: 'p-book', label: () => t('settings.permissions.row.p_book.label') },
  { page: 'permissions', row: 'p-pay', label: () => t('settings.permissions.row.p_pay.label') },
  { page: 'permissions', row: 'p-post', label: () => t('settings.permissions.row.p_post.label') },
  { page: 'permissions', row: 'p-delete', label: () => t('settings.permissions.row.p_delete.label') },
  { page: 'permissions', row: 'p-share', label: () => t('settings.permissions.row.p_share.label') },
  { page: 'permissions', row: 'a-gmail', label: () => t('settings.permissions.row.a_gmail.label') },
  { page: 'permissions', row: 'a-calendar', label: () => t('settings.permissions.row.a_calendar.label') },
  {
    page: 'permissions',
    row: 'a-contacts',
    label: () => t('settings.permissions.row.a_contacts.label'),
    second: () => t('settings.permissions.row.a_contacts.second'),
  },
  { page: 'permissions', row: 'a-whatsapp', label: () => t('settings.permissions.row.a_whatsapp.label') },
  {
    page: 'permissions',
    row: 'a-browser',
    label: () => t('settings.permissions.row.a_browser.label'),
    second: () => t('settings.permissions.row.a_browser.second'),
  },
  { page: 'permissions', row: 'f-save', label: () => t('settings.permissions.row.f_save.label') },
  { page: 'permissions', row: 'f-add', label: () => t('settings.permissions.row.f_add.label') },
  { page: 'permissions', row: 'f-delete-note', label: () => t('settings.permissions.row.f_delete_note.label') },
  {
    page: 'money',
    row: 'cap-buy',
    label: () => t('settings.money.row.cap_buy.label'),
    second: () => t('settings.money.row.cap_buy.second'),
  },
  { page: 'money', row: 'cap-ai', label: () => t('settings.money.row.cap_ai.label') },
  { page: 'money', row: 'cap-warn', label: () => t('settings.money.row.cap_warn.label') },
  { page: 'money', row: 'spend', label: () => t('settings.money.row.spend.label') },
  { page: 'money', row: 'hello', label: () => t('settings.money.row.hello.label'), second: () => t('settings.money.row.hello.second') },
  { page: 'money', row: 'methods', label: () => t('settings.money.row.methods.label') },
  { page: 'money', row: 'add-card', label: () => t('settings.money.row.add_card.label') },
  { page: 'money', row: 'add-upi', label: () => t('settings.money.row.add_upi.label') },
  { page: 'money', row: 'paid-month', label: () => t('settings.money.row.paid_month.label') },
  { page: 'privacy', row: 'mem-on', label: () => t('settings.privacy.row.mem_on.label') },
  { page: 'privacy', row: 'mem-learn', label: () => t('settings.privacy.row.mem_learn.label') },
  {
    page: 'privacy',
    row: 'mem-ask',
    label: () => t('settings.privacy.row.mem_ask.label'),
    second: () => t('settings.privacy.row.mem_ask.second'),
  },
  { page: 'privacy', row: 'mem-page', label: () => t('settings.privacy.row.mem_page.label') },
  { page: 'privacy', row: 'dismissed', label: () => t('settings.privacy.row.dismissed.label') },
  {
    page: 'privacy',
    row: 'keep-shots',
    label: () => t('settings.privacy.row.keep_shots.label'),
    second: () => t('settings.privacy.row.keep_shots.second'),
  },
  { page: 'privacy', row: 'keep-voice', label: () => t('settings.privacy.row.keep_voice.label') },
  { page: 'privacy', row: 'sites', label: () => t('settings.privacy.row.sites.label') },
  { page: 'privacy', row: 'leaves', label: () => t('settings.privacy.row.leaves.label') },
  { page: 'privacy', row: 'leaves-manage', label: () => t('settings.privacy.row.leaves_manage.label') },
  {
    page: 'privacy',
    row: 'activity',
    label: () => t('settings.privacy.row.activity.label'),
    second: () => t('settings.privacy.row.activity.second'),
  },
  {
    page: 'privacy',
    row: 'export',
    label: () => t('settings.privacy.row.export.label'),
    second: () => t('settings.privacy.row.export.second'),
  },
  { page: 'privacy', row: 'old-chats', label: () => t('settings.privacy.row.old_chats.label') },
  {
    page: 'privacy',
    row: 'forget-all',
    label: () => t('settings.privacy.row.forget_all.label'),
    second: () => t('settings.privacy.row.forget_all.second'),
  },
  {
    page: 'privacy',
    row: 'delete-all',
    label: () => t('settings.privacy.row.delete_all.label'),
    second: () => t('settings.privacy.row.delete_all.second'),
  },
  { page: 'routines-settings', row: 'r-page', label: () => t('settings.routines_settings.row.r_page.label') },
  {
    page: 'routines-settings',
    row: 'r-hours',
    label: () => t('settings.routines_settings.row.r_hours.label'),
    second: () => t('settings.routines_settings.row.r_hours.second'),
  },
  {
    page: 'routines-settings',
    row: 'r-away',
    label: () => t('settings.routines_settings.row.r_away.label'),
    second: () => t('settings.routines_settings.row.r_away.second'),
  },
  {
    page: 'routines-settings',
    row: 'r-catch-up',
    label: () => t('settings.routines_settings.row.r_catch_up.label'),
    second: () => t('settings.routines_settings.row.r_catch_up.second'),
  },
  {
    page: 'routines-settings',
    row: 'r-awake',
    label: () => t('settings.routines_settings.row.r_awake.label'),
    second: () => t('settings.routines_settings.row.r_awake.second'),
  },
  { page: 'routines-settings', row: 'r-housekeeping', label: () => t('settings.routines_settings.row.r_housekeeping.label') },
  { page: 'routines-settings', row: 'r-habits', label: () => t('settings.routines_settings.row.r_habits.label') },
  { page: 'routines-settings', row: 'r-pause-all', label: () => t('settings.routines_settings.row.r_pause_all.label') },
  {
    page: 'chat',
    row: 'voice-replies',
    label: () => t('settings.chat.row.voice_replies.label'),
    second: () => t('settings.chat.row.voice_replies.second'),
  },
  { page: 'chat', row: 'talk-key', label: () => t('settings.chat.row.talk_key.label') },
  { page: 'chat', row: 'vibe', label: () => t('settings.chat.row.vibe.label') },
  { page: 'chat', row: 'status-emoji', label: () => t('settings.chat.row.status_emoji.label') },
  { page: 'chat', row: 'voice-text', label: () => t('settings.chat.row.voice_text.label') },
  { page: 'chat', row: 'voice-key', label: () => t('settings.chat.row.voice_key.label') },
  { page: 'chat', row: 'voice-pack', label: () => t('settings.chat.row.voice_pack.label') },
  { page: 'about', row: 'update', label: () => t('settings.about.row.update.label') },
  { page: 'about', row: 'whats-new', label: () => t('settings.about.row.whats_new.label') },
  { page: 'about', row: 'report', label: () => t('settings.about.row.report.label') },
  { page: 'about', row: 'repair', label: () => t('settings.about.row.repair.label'), second: () => t('settings.about.row.repair.second') },
  { page: 'about', row: 'leaves', label: () => t('settings.about.row.leaves.label') },
  { page: 'about', row: 'licences', label: () => t('settings.about.row.licences.label') },
  { page: 'connections', row: 'browser', label: () => t('settings.connections.row.browser.label') },
  { page: 'connections', row: 'ai', label: () => t('settings.connections.row.ai.label') },
  {
    page: 'connections',
    row: 'internet',
    label: () => t('settings.connections.row.internet.label'),
    second: () => t('settings.connections.row.internet.second'),
  },
  { page: 'connections', row: 'web-search', label: () => t('settings.connections.row.web_search.label') },
  { page: 'connections', row: 'web-read', label: () => t('settings.connections.row.web_read.label') },
  { page: 'connections', row: 'cloud-browser', label: () => t('settings.connections.row.cloud_browser.label') },
];

/** 06-2 §6.0 synonyms: a search word → the rows (or, with no row, the page) it finds. */
export const SETTINGS_SYNONYMS: Readonly<Record<string, readonly { page: SettingsPage; row?: string }[]>> = {
  dark: [{ page: 'appearance', row: 'theme' }],
  font: [{ page: 'appearance', row: 'zoom' }],
  bigger: [{ page: 'appearance', row: 'zoom' }],
  'text size': [{ page: 'appearance', row: 'zoom' }],
  'do not disturb': [{ page: 'notifications', row: 'quiet-on' }],
  night: [{ page: 'notifications', row: 'quiet-on' }],
  card: [{ page: 'money', row: 'methods' }],
  upi: [{ page: 'money', row: 'methods' }],
  limit: [
    { page: 'money', row: 'cap-buy' },
    { page: 'money', row: 'cap-ai' },
  ],
  key: [{ page: 'account', row: 'ai-using' }],
  gmail: [{ page: 'connections' }],
  whatsapp: [{ page: 'connections' }],
  x: [{ page: 'connections' }],
  delete: [
    { page: 'privacy', row: 'old-chats' },
    { page: 'privacy', row: 'delete-all' },
  ],
  export: [{ page: 'privacy', row: 'export' }],
};

export interface SettingsHit {
  page: SettingsPage;
  /** Absent for a page-level hit (a synonym that names a page). */
  row?: string;
  label: string;
  pageLabel: string;
}

function norm(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[’']/g, "'").toLowerCase().trim();
}

/** Live settings search (06-2 §6.0): case- and accent-insensitive substring match on label and second line, plus synonyms. */
export function searchSettings(q: string, ctx: IndexCtx): SettingsHit[] {
  const needle = norm(q);
  if (!needle) return [];
  const hits: SettingsHit[] = [];
  const seen = new Set<string>();
  const add = (page: SettingsPage, row: string | undefined, label: string) => {
    const k = `${page}/${row ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    hits.push({ page, row, label, pageLabel: pageLabel(page) });
  };
  for (const e of SETTINGS_INDEX) {
    const label = e.label(ctx);
    if (norm(label).includes(needle) || (e.second && norm(e.second()).includes(needle))) add(e.page, e.row, label);
  }
  for (const [word, targets] of Object.entries(SETTINGS_SYNONYMS)) {
    if (word !== needle && !(needle.length >= 3 && word.startsWith(needle))) continue;
    for (const target of targets) {
      const entry = target.row ? SETTINGS_INDEX.find((e) => e.page === target.page && e.row === target.row) : undefined;
      add(target.page, target.row, entry ? entry.label(ctx) : pageLabel(target.page));
    }
  }
  return hits;
}
