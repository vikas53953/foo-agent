// Spec: CR-0008 (j) row 12 and CR-0009 G-M5-22 (proposed): with no reset time the plan-limit lines read "{AI} limit reached"
// (sidebar footer, 03-shell-1 §3.4.11) and "Paused · {ai} limit reached" (chat header row 6, 03-shell-1 §3.5), never
// "limit until" with nothing after; with a reset time they keep "until {time}". M5 T10.
import { describe, expect, it } from 'vitest';
import { aiText, footerAi } from '../../src/renderer/chatlist/footer';
import { statusLine, type StatusInput } from '../../src/renderer/shell/statusLine';
import type { AiStatus, ChatRow, JobRow } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 16, 3, 30); // Fri 16 Oct 2026, 9:00 AM IST
const TZ = 'Asia/Kolkata';
const limit = (resetAt?: number): AiStatus =>
  ({
    primary: 'claude-cli',
    backup: null,
    displayName: 'Claude',
    billing: 'plan',
    state: 'limit',
    usingBackup: false,
    ...(resetAt ? { resetAt } : {}),
  }) as AiStatus;

const header = (ai: StatusInput['ai']): StatusInput => ({
  chat: { id: 'c_foo', kind: 'foo', helperId: null, title: 'foo', private: false } as ChatRow,
  jobs: [{ id: 'j1', chatId: 'c_foo', state: 'waiting', waitingReason: 'ai_limit', title: 'Goa stay' } as JobRow],
  cards: {},
  setup: { complete: true, step: 5 },
  connection: 'online',
  ai,
  takenOverJobIds: [],
  typing: false,
  quiet: null,
  now: NOW,
  timeZone: TZ,
  agentName: 'foo',
  helper: undefined,
  memberNames: [],
});

describe('plan limit with no reset time', () => {
  it('sidebar footer: "Claude limit reached"; with a reset time it keeps the time', () => {
    const none = limit();
    expect(aiText(footerAi(none, { setupComplete: true, offline: false, now: NOW }), none, NOW, TZ)).toBe('Claude limit reached');
    const at = limit(NOW + 2 * 3_600_000);
    const text = aiText(footerAi(at, { setupComplete: true, offline: false, now: NOW }), at, NOW, TZ);
    expect(text.startsWith('Claude limit until ')).toBe(true);
    expect(text.length).toBeGreaterThan('Claude limit until '.length);
  });

  it('chat header row 6: "Paused · Claude limit reached"; with a reset time "until 11:00 AM"', () => {
    expect(statusLine(header({ displayName: 'Claude', state: 'limit' }))).toMatchObject({ row: 6, text: 'Paused · Claude limit reached' });
    expect(statusLine(header({ displayName: 'Claude', state: 'limit', resetAt: NOW + 2 * 3_600_000 }))).toMatchObject({
      row: 6,
      text: 'Paused · Claude limit until 11:00 AM',
    });
  });
});
