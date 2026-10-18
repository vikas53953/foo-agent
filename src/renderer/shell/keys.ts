// Spec: 09 §9.17 shell shortcuts, 03-shell-1 §3.4.2 / §3.4.9 (the hints menus and tooltips show).
/** Key names as Windows prints them (09 §9.17); not translated copy. */
export const KEY_HINT = {
  newHelper: 'Ctrl+N',
  newGroup: 'Ctrl+Shift+N',
  settings: 'Ctrl+,',
  shortcuts: 'Ctrl+/',
  pin: 'Ctrl+Shift+P',
  unread: 'Ctrl+Shift+U',
  mute: 'Ctrl+Shift+M',
  // M13 (06 §0.10, 06-3 §19)
  search: 'Ctrl+K',
  activity: 'Ctrl+H',
  profile: 'Ctrl+I',
} as const;
