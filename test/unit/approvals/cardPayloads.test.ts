// M6 T9 · card payload guards (08-1 §4.5): main reads approval, draft and secret payloads through these, never a cast.
import { describe, expect, it } from 'vitest';
import { approvalPayloadOf, draftPayloadOf, secretPayloadOf } from '../../../src/main/approvals/cardPayloads';
import type { CardRow } from '../../../src/shared/types';

const row = (type: CardRow['type'], payload: Record<string, unknown>): CardRow => ({
  id: 'k_1',
  chatId: 'c_1',
  messageId: 'm_1',
  jobId: null,
  type,
  state: 'pending',
  payload,
  answer: null,
  nonce: 'n',
  expiresAt: null,
  resolvedBy: null,
  resolvedAt: null,
  supersedesId: null,
  rev: 0,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
});

const approval = { approvalId: 'ap_1', verb: 'book', title: 'Book this table?', fields: { verb: 'book', irreversible: false } };
const draft = { approvalId: 'ap_2', channel: 'email', body: 'Hello from example.com', edited: false, sendAllowed: true };
const secret = { secretKind: 'otp', name: 'One-time code', why: '', fields: [], requestId: 'rq_1' };

describe('card payload guards', () => {
  it('return the payload of a card of their own type and shape', () => {
    expect(approvalPayloadOf(row('approval', approval))).toEqual(approval);
    expect(draftPayloadOf(row('draft', draft))).toEqual(draft);
    expect(secretPayloadOf(row('secret', secret))).toEqual(secret);
  });

  it('refuse a card of another type, even with a matching payload', () => {
    expect(approvalPayloadOf(row('draft', approval))).toBeNull();
    expect(draftPayloadOf(row('approval', draft))).toBeNull();
    expect(secretPayloadOf(row('choice', secret))).toBeNull();
  });

  it('refuse a payload missing what main reads', () => {
    expect(approvalPayloadOf(row('approval', { ...approval, fields: 'x' }))).toBeNull();
    expect(draftPayloadOf(row('draft', { approvalId: 'ap_2', channel: 'email' }))).toBeNull();
    expect(secretPayloadOf(row('secret', { secretKind: 'otp', name: 'One-time code' }))).toBeNull();
  });
});
