// 11-fidelity §11.5 FID-16 (table test), approval half: every (state × event) pair of the approval machine (07-journeys-2
// §5 with SM-A4…A9, 08-2 §9.1 "only main's ApprovalGate writes approvals.state; anything else is APPROVAL_BAD_TRANSITION",
// CR-0009 G-M5-03, -04, -18, -19) is checked against spec/state-machines.json (scripts/extract-sm.ts) and the
// shared table src/shared/approvalMachine.ts. Expected values come from the spec: the 07-2 §5 diagram edges are written out
// here, not read from the code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMachines, checkApprovalAgainstSpec, serialise, SM_PATH, type StateMachines } from '../../../scripts/extract-sm';
import {
  APPROVAL_EVENTS,
  APPROVAL_STATES,
  APPROVAL_TERMINAL,
  canApprovalTransition,
  expiryMinutes,
  nextApproval,
  type ApprovalEvent,
} from '../../../src/shared/approvalMachine';
import type { ApprovalState, ApprovalVerb } from '../../../src/shared/types';

const sm = JSON.parse(readFileSync(SM_PATH, 'utf8')) as StateMachines;
const machine = sm.machines.approval;

/** 07-2 §5 diagram + state table, read by hand (from → to); G-M5-03/-04 and 08-2 §9.4.2 / §5.9 add the starred rows. */
const SPEC_EDGES: [ApprovalState, ApprovalState][] = [
  ['PENDING', 'APPROVED'], // Approve tap
  ['PENDING', 'WITHDRAWN'], // job cancelled elsewhere
  ['PENDING', 'SUPERSEDED'], // terms changed before Approve (and steer, 08-4 §26.5)
  ['PENDING', 'DECLINED'], // No / Not now
  ['PENDING', 'EXPIRED'], // timer ends
  ['APPROVED', 'HELD'], // second look fails
  ['HELD', 'APPROVED'], // user picks the action's value
  ['HELD', 'DECLINED'], // user picks their own value (G-M5-03)
  ['HELD', 'EXPIRED'], // * G-M5-04 (08-2 §5.9 step 2)
  ['APPROVED', 'RUNNING'], // second look pass, write-ahead
  ['APPROVED', 'SUPERSEDED'], // * 08-2 §9.4.2 fresh terms before executing (X-125 order)
  ['RUNNING', 'SUPERSEDED'], // checkout total ≠ approved total
  ['RUNNING', 'COMPLETED'], // proof ok
  ['RUNNING', 'FAILED'], // declined by bank / site error
  ['RUNNING', 'CHECKING'], // result unknown
  ['CHECKING', 'COMPLETED'],
  ['CHECKING', 'FAILED'],
  ['HELD', 'WITHDRAWN'], // * G-M5-18 job stopped while the card waits on the user
  ['APPROVED', 'WITHDRAWN'], // * 08-2 §5.7 step 3 job stopped before submit (undo window, second look, fresh terms)
  ['APPROVED', 'PENDING'], // * G-M5-19 Draft Undo inside the 5 s (05-2 §5.7 "a fresh PENDING approval"; one row per card)
];

/** Moves the spec forbids outright (journeys §5 rules, Art. 3/6/7): the test names each one. */
const FORBIDDEN: [ApprovalState, ApprovalState, string][] = [
  ['DECLINED', 'PENDING', 'EXPIRED and DECLINED never auto-retry (Ask me again builds a fresh card)'],
  ['EXPIRED', 'PENDING', 'EXPIRED never auto-retries'],
  ['EXPIRED', 'APPROVED', 'an expired card cannot be approved (CARD_EXPIRED)'],
  ['RUNNING', 'PENDING', 'once submitted, nothing is undone'],
  ['PENDING', 'RUNNING', 'nothing runs without an approve event (FID-17: no approval leaves PENDING without a tap)'],
  ['PENDING', 'COMPLETED', 'nothing completes without running'],
  ['HELD', 'RUNNING', 'a held approval goes back through APPROVED and the second look'],
  ['CHECKING', 'RUNNING', 'a CHECKING card never re-submits'],
  ['COMPLETED', 'RUNNING', 'single use'],
  ['FAILED', 'RUNNING', 'single use'],
  ['SUPERSEDED', 'PENDING', 'a superseded card stays superseded; the new card is a new row'],
];

describe('FID-16 approval state machine', () => {
  it('FID-16 (approval) state-machines.json is fresh and carries every 07-2 §5 state and diagram edge', () => {
    expect(readFileSync(SM_PATH, 'utf8')).toBe(serialise(buildMachines()));
    expect(checkApprovalAgainstSpec(readFileSync('spec/constitution/07-journeys-2.md', 'utf8'), sm)).toEqual([]);
    expect([...machine.states].sort()).toEqual(
      [
        'PENDING',
        'APPROVED',
        'RUNNING',
        'COMPLETED',
        'HELD',
        'CHECKING',
        'DECLINED',
        'EXPIRED',
        'SUPERSEDED',
        'WITHDRAWN',
        'FAILED',
      ].sort(),
    );
    expect(machine.initial).toBe('PENDING');
  });

  it('FID-16 (approval) the app table has the same states, final states and events as the spec file', () => {
    expect([...APPROVAL_STATES]).toEqual(machine.states);
    expect([...APPROVAL_TERMINAL].sort()).toEqual([...machine.terminal].sort());
    expect(Object.keys(APPROVAL_EVENTS).sort()).toEqual([...machine.events].sort());
  });

  it('FID-16 (approval) every state × event pair: allowed → the spec next state, otherwise refused', () => {
    let cells = 0;
    for (const from of machine.states)
      for (const event of machine.events) {
        const row = machine.transitions.find((t) => t.from === from && t.event === event);
        expect(nextApproval(from, event as ApprovalEvent), `${from} × ${event}`).toBe(row ? row.to : undefined);
        cells++;
      }
    expect(cells).toBe(machine.states.length * machine.events.length);
  });

  it('FID-16 (approval) every (from, to) pair: allowed exactly when the spec draws it', () => {
    const allowed = new Set(SPEC_EDGES.map(([f, t]) => `${f}>${t}`));
    for (const from of APPROVAL_STATES)
      for (const to of APPROVAL_STATES) expect(canApprovalTransition(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
    const forbidden = new Set(machine.forbidden.map((f) => `${f.from}>${f.to}`));
    for (const from of APPROVAL_STATES)
      for (const to of APPROVAL_STATES) expect(forbidden.has(`${from}>${to}`)).toBe(!allowed.has(`${from}>${to}`));
  });

  it('FID-16 (approval) forbidden moves are refused, and nothing leaves a final state', () => {
    for (const [from, to, why] of FORBIDDEN) expect(canApprovalTransition(from, to), why).toBe(false);
    for (const from of APPROVAL_TERMINAL) for (const to of APPROVAL_STATES) expect(canApprovalTransition(from, to)).toBe(false);
    // An unknown state string (a stale row, a typo) is never a legal source or target.
    expect(canApprovalTransition('pending', 'APPROVED')).toBe(false);
    expect(canApprovalTransition('PENDING', 'approved')).toBe(false);
  });

  it('FID-16 (approval) named moves: approve, decline, expiry, held picks, steer and checkout change', () => {
    expect(nextApproval('PENDING', 'approve')).toBe('APPROVED');
    expect(nextApproval('PENDING', 'decline')).toBe('DECLINED');
    expect(nextApproval('PENDING', 'expire')).toBe('EXPIRED');
    expect(nextApproval('HELD', 'expire')).toBe('EXPIRED'); // G-M5-04
    expect(nextApproval('HELD', 'held_pick_action')).toBe('APPROVED');
    expect(nextApproval('HELD', 'held_pick_own')).toBe('DECLINED'); // G-M5-03
    expect(nextApproval('PENDING', 'steer')).toBe('SUPERSEDED');
    expect(nextApproval('RUNNING', 'checkout_changed')).toBe('SUPERSEDED');
    expect(nextApproval('APPROVED', 'draft_undo')).toBe('PENDING'); // G-M5-19
    expect(nextApproval('HELD', 'withdraw')).toBe('WITHDRAWN'); // G-M5-18
    expect(nextApproval('APPROVED', 'withdraw')).toBe('WITHDRAWN'); // 08-2 §5.7 step 3
    expect(nextApproval('RUNNING', 'withdraw')).toBeUndefined(); // a submitted action is never withdrawn
    // Approve is a tap on PENDING only: approving twice, or approving a held, expired or declined card, is refused.
    for (const s of ['APPROVED', 'HELD', 'EXPIRED', 'DECLINED', 'RUNNING'] as const) expect(nextApproval(s, 'approve')).toBeUndefined();
    // Not now never reaches a card past PENDING (Esc never declines; toasts decline only a PENDING card).
    for (const s of ['APPROVED', 'RUNNING', 'CHECKING'] as const) expect(nextApproval(s, 'decline')).toBeUndefined();
  });

  it('FID-16 (approval) expiry per verb: pay/buy 10 min, book 15 min, every other verb 60 min (08-2 §9.1, G-M5-15)', () => {
    const want: Record<ApprovalVerb, number> = {
      pay: 10,
      buy: 10,
      book: 15,
      send: 60,
      post: 60,
      delete: 60,
      share: 60,
      switch: 60,
      use_app: 60,
      calendar_write: 60,
    };
    for (const [verb, min] of Object.entries(want)) expect(expiryMinutes(verb as ApprovalVerb), verb).toBe(min);
    expect(machine.expiryMinutes).toEqual(want);
  });

  it('FID-16 (approval) side effects: every transition names its card copy key and its job effect', () => {
    for (const t of machine.transitions) {
      expect(t.effects.length, `${t.from} × ${t.event}`).toBeGreaterThan(0);
      expect(t.source, `${t.from} × ${t.event}`).not.toBe('');
    }
    const expire = machine.transitions.find((t) => t.from === 'PENDING' && t.event === 'expire')!;
    expect(expire.effects.join(' ')).toContain('approval_expired');
    const decline = machine.transitions.find((t) => t.from === 'PENDING' && t.event === 'decline')!;
    expect(decline.effects.join(' ')).toContain('approval_declined');
  });
});
