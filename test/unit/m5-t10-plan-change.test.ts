// Spec: 05-3 §5.12.2 ("Change plan": composer focused with placeholder "Tell me what to change"; the old card becomes
// Superseded), 04-2 §20.4 (banner states win over the chat's placeholder). M5 T10, CR-0008 (j) row 3.
import { describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import type { CardRow, MessageRow } from '../../src/shared/types';
import { planChangePending, placeholderText, type PlaceholderFacts } from '../../src/renderer/composer/placeholder';

const msg = (id: string, authorKind: MessageRow['authorKind'], cardId: string | null = null) =>
  ({ id, authorKind, cardId, kind: cardId ? 'card' : 'text' }) as MessageRow;
const card = (id: string, type: string, state: string) => ({ id, type, state }) as CardRow;

describe('planChangePending', () => {
  const cards = { k1: card('k1', 'plan', 'changed'), k2: card('k2', 'plan', 'pending'), k3: card('k3', 'checklist', 'running') };
  const byId = {
    m1: msg('m1', 'user'),
    m2: msg('m2', 'foo', 'k1'),
    m3: msg('m3', 'foo'),
    m4: msg('m4', 'user'),
    m5: msg('m5', 'foo', 'k2'),
  };

  it('true while the newest Plan card is changed and the user has not written since', () => {
    expect(planChangePending(['m1', 'm2'], byId, cards)).toBe(true);
    expect(planChangePending(['m1', 'm2', 'm3'], byId, cards)).toBe(true);
  });
  it('false once the user wrote, or a newer Plan card arrived', () => {
    expect(planChangePending(['m1', 'm2', 'm4'], byId, cards)).toBe(false);
    expect(planChangePending(['m1', 'm2', 'm5'], byId, cards)).toBe(false);
    expect(planChangePending([], byId, cards)).toBe(false);
  });
});

describe('placeholder after Change plan', () => {
  const base: PlaceholderFacts = {
    notSetUp: false,
    banner: null,
    aiName: 'Claude',
    hasAttachments: false,
    hasText: false,
    narrow: false,
    kind: 'foo',
    private: false,
    title: 'foo',
    agentName: 'foo',
    talkKey: 'Ctrl+Space',
  };
  it('reads "Tell me what to change"; an app-wide state still wins', () => {
    expect(placeholderText({ ...base, planChange: true })).toBe(t('cards.plan.change_placeholder'));
    expect(t('cards.plan.change_placeholder')).toBe('Tell me what to change');
    expect(placeholderText({ ...base, planChange: true, banner: 'offline' })).toBe(t('composer.placeholder.offline'));
    expect(placeholderText(base)).not.toBe(t('cards.plan.change_placeholder'));
  });
});
