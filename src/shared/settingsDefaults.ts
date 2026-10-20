// Spec: 08-0 §A.1. Defaults live only here. `locale.timeZone` defaults to the PC's zone (08-1 §0.5).
import type { Settings } from './settings';

function pcTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

export const settingsDefaults: Settings = {
  schemaVersion: 2,
  setup: { complete: false, step: 0 },
  identity: { agentName: 'foo' },
  user: {},
  locale: { timeZone: pcTimeZone(), region: 'IN', currency: 'INR' },
  app: { closeToTray: true, hardwareAcceleration: true, closeDialogShown: false },
  zoom: 100,
  appearance: { theme: 'system', useWindowsAccent: false, animations: 'full', sounds: false, mica: true, faceMotion: true },
  window: { maximized: false, sidebarWidth: 340, rightShellOpen: true },
  ai: { primary: null, backup: null, providers: {}, plainChatFallback: true },
  permissions: {
    actions: {
      read: 'always',
      drafts: 'always',
      calendar: 'ask',
      send: 'ask',
      book: 'ask',
      pay: 'ask',
      post: 'never',
      delete: 'ask',
      share: 'ask',
    },
    apps: { gmail: 'always', calendar: 'always', contacts: 'always', whatsapp: 'ask', browser: 'always', outlook: 'never' },
    folders: [],
  },
  rules: [],
  money: { purchaseCapPaise: 2_500_000, aiCapPaise: 100_000, warnAt80: true, bigPaymentPaise: 1_000_000 },
  notifications: { quiet: { on: true, from: '22:00', to: '07:00', days: [0, 1, 2, 3, 4, 5, 6] }, mutedChats: {}, unpromptedPerDay: 3 },
  privacy: { rememberOn: true, learnFromChats: true, askBeforeRemembering: false, screenshotDays: 7, readCodesFromGmail: [] },
  connections: {
    google: { calendarOn: true, contactsOn: true },
    whatsapp: { read: true, draft: true, hiddenJids: [] },
    web: {
      search: 'this_pc',
      read: 'this_pc',
      cloudBrowser: false,
      refused: { exa: false, tavily: false, firecrawl: false, browseruse: false },
    },
  },
  flags: { screenHands: false, hub: false, outlook: false, multiAccount: false },
};
