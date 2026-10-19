// Spec: 08-2 §9.4 (gate algorithm, engine `GateLogic.decide`, runs for every tool call and every verified ApprovalDraft;
// permission row read FIRST, X-125), §9.2 (action classes, rows, app rows, hard limits), §9.4.1 (always · ask · never),
// §9.5 (rules apply only to use_app, calendar_write, mail_organise; never to hard limits), 08-4 §28.2 (calendar after a
// booking), 08-0 §A.2 (send, book, pay, delete, share can never be `always`; post is `never` in v1), Art. 3 (read-only jobs
// only offer), Art. 14 (group chats: cards go to the owner helper's 1:1 chat), 08-3 §17 (helper allowedApps AND permissions).
// M5 T7 replaces the M4 stub (CR-0008 G-M4-05) under the same interface name (M5 map, monitor pass 1 (e)).
// M5 T8: `GateCall.content` feeds the §9.2 send hard limit.
import type { Settings } from '../../shared/settings';
import type { ApprovalFields, PermissionApp } from '../../shared/types';
import { appOf, classOf, isHardLimit, personalHard, rowFor, type PermRow } from './classes';
import type { SendContent } from './sendContent';

export type ActionClass =
  'read' | 'prepare' | 'calendar_write' | 'send' | 'book' | 'buy' | 'pay' | 'post' | 'delete' | 'share_personal' | 'switch';

/** The job facts the gate reads (08-0 jobs row, 08-2 §5.3.1 intent and do_verbs). */
export interface GateJob {
  id: string;
  intent: 'read_only' | 'do';
  doVerbs: readonly string[];
  /** The helper that owns the job (helper chats), or null for foo's own jobs. */
  ownerId: string | null;
  /** Apps the user already answered "Can I use {app} for this?" for, in this job (true = Yes). */
  appAnswers: ReadonlyMap<PermissionApp, boolean>;
  /** The owner helper's `allowedApps` (08-3 §17.6); absent for foo's own jobs. */
  helperApps?: Readonly<Record<string, boolean>>;
}

/** 08-3 §17.6: the `allowedApps` key a tool needs, or null when every helper may use it. */
function helperKey(tool: string): string | null {
  if (tool === 'screen.open' || tool === 'job.needSignIn') return 'browser';
  const ns = tool.split('.')[0]!;
  if (ns === 'web') return 'browser';
  return ['gmail', 'gcal', 'contacts', 'whatsapp', 'x', 'outlook', 'browser'].includes(ns) ? ns : null;
}

/** 08-3 §17.6: helper `allowedApps` AND Settings → Permissions; `payments=false` stops buy and pay. */
export function helperAllows(apps: Readonly<Record<string, boolean>>, tool: string, cls: ActionClass): boolean {
  if ((cls === 'buy' || cls === 'pay') && apps.payments !== true) return false;
  const key = helperKey(tool);
  return key === null || apps[key] === true;
}

/** One gated call: an AI tool call, or a verified ApprovalDraft (08-4 §28.1 item 7) as a call of its class. */
export interface GateCall {
  tool: string;
  cls: ActionClass;
  args?: unknown;
  /** A verified draft's fields (hard-limit column; card text). */
  fields?: ApprovalFields;
  /** 08-4 §28.2: a `gcal.create` whose start equals an approved booking of this job. */
  coveredByBooking?: boolean;
  /** M5 T8: a send's message text and attachments (§9.2 send hard limit). */
  content?: SendContent;
}

export type GateDecision =
  | { kind: 'EXECUTE'; approvedVia?: 'rule' }
  /** §9.4: never on the row, the app, or the helper's allowed apps. */
  | { kind: 'REFUSE'; row?: PermRow; app?: PermissionApp; error?: 'HELPER_NOT_ALLOWED' }
  /** v1 post: x.draft + x.openCompose ("Open in X to post"). */
  | { kind: 'HAND_BACK' }
  | { kind: 'ASK_CHOICE'; purpose: 'app_use'; app: PermissionApp }
  /** Art. 3: "Want me to {action}?"; a Yes adds the verb to do_verbs. */
  | { kind: 'ASK_CHOICE'; purpose: 'offer_action'; cls: ActionClass }
  /** gmail.send / whatsapp.send: the Draft card's own approval (08-0 §G.7); never from the AI. */
  | { kind: 'DRAFT_SEND' }
  /** Everything else: createApproval → PENDING card → job NEEDS_YOU. */
  | { kind: 'CARD'; hard: boolean };

export interface GateLogic {
  decide(job: GateJob, call: GateCall): GateDecision;
}

export interface GateDeps {
  settings(): Settings;
  now(): number;
}

/** §9.5 / 08-0 §G.3 Rule.verb values a rule may carry for a class with no hard limit. */
function matchRule(rules: Settings['rules'], verb: 'use_app' | 'calendar_write', app?: PermissionApp): boolean {
  return rules.some((r) => r.verb === verb && (verb !== 'use_app' || r.match.app === app));
}

/** 08-2 §9.4, line for line. */
export function createGate(d: GateDeps): GateLogic {
  return {
    decide(job, call) {
      const s = d.settings();
      const cls = classOf(call.tool, call.cls, call.args); // §8.2.1, §9.2 (fillPersonal phone/address → share_personal)
      const app = appOf(call.tool);
      const row = rowFor(cls);
      // The row is read FIRST (X-125); `switch` has no row and always asks.
      const perm = row === null ? 'ask' : s.permissions.actions[row];
      if (perm === 'never') return cls === 'post' ? { kind: 'HAND_BACK' } : { kind: 'REFUSE', row: row! };
      if (job.ownerId && job.helperApps && !helperAllows(job.helperApps, call.tool, cls))
        return { kind: 'REFUSE', error: 'HELPER_NOT_ALLOWED' };
      if (app) {
        const ap = s.permissions.apps[app];
        if (ap === 'never') return { kind: 'REFUSE', app };
        if (ap === 'ask') {
          const answer = job.appAnswers.get(app);
          if (answer === false) return { kind: 'REFUSE', app };
          if (answer === undefined && !matchRule(s.rules, 'use_app', app)) return { kind: 'ASK_CHOICE', purpose: 'app_use', app };
        }
      }
      if (cls === 'read') return { kind: 'EXECUTE' };
      if (cls === 'prepare' && !personalHard(call.tool, call.args)) return { kind: 'EXECUTE' };
      if (job.intent === 'read_only') return { kind: 'ASK_CHOICE', purpose: 'offer_action', cls };
      const hard = isHardLimit(cls, call.fields, d.now(), call.content);
      // Only read, drafts and calendar may be `always` (08-0 §A.2); no second look for them.
      if (!hard && perm === 'always') return { kind: 'EXECUTE' };
      if (!hard && cls === 'calendar_write' && call.coveredByBooking) return { kind: 'EXECUTE' };
      if (!hard && cls === 'calendar_write' && matchRule(s.rules, 'calendar_write')) return { kind: 'EXECUTE', approvedVia: 'rule' };
      if (call.tool === 'gmail.send' || call.tool === 'whatsapp.send') return { kind: 'DRAFT_SEND' };
      return { kind: 'CARD', hard };
    },
  };
}
