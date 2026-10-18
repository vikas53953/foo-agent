// Spec: 08-2 §9.2 (action classes), CR-0008 G-M4-05 (M4 ships a `GateLogic.decide` stub: read and prepare → EXECUTE, every
// other class → REFUSE; M5 replaces it with the approval gate of 08-2 §9), 05 §5.5 (no acting tool runs without its card).
export type ActionClass =
  'read' | 'prepare' | 'calendar_write' | 'send' | 'book' | 'buy' | 'pay' | 'post' | 'delete' | 'share_personal' | 'switch';

export type GateDecision = 'EXECUTE' | 'REFUSE';

export interface GateLogic {
  decide(actionClass: ActionClass): GateDecision;
}

/** TODO(M5): the real gate (permissions, rules, second look, approval cards). */
export const stubGate: GateLogic = {
  decide: (cls) => (cls === 'read' || cls === 'prepare' ? 'EXECUTE' : 'REFUSE'),
};
