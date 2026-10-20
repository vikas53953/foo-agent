// Spec: 08-2 §8.2 (`x.draft { text }` prepare: an X Draft card, weighted length ≤ 280; `x.openCompose { draftCardId }`
// prepare: opens `https://x.com/intent/post?text=…` in the default browser, never posts, J12), §9.4 (`post` is locked
// `never` in v1: hand-back through these two tools), 08-3 §16.3 (no account, X-34; > 280 → the card's too-long line), 08-4
// §27.1 (their descriptions, exact). M8 T7. Main makes the card (`draft.create`) and opens it (`draft.openX`).
import { z } from 'zod';
import type { MainLink } from '../../protocol';
import type { ToolDef, ToolRegistry } from '../ToolLayer';
import { connOutcome } from './limiter';

const draftArgs = z.object({ text: z.string().min(1).max(10_000) }).strict();
const openArgs = z.object({ draftCardId: z.string().min(1).max(100) }).strict();

/** `x.draft` and `x.openCompose`. */
export function xTools(d: { link: MainLink }): ToolRegistry {
  const draft: ToolDef = {
    name: 'x.draft',
    actionClass: 'prepare',
    args: 'text: string',
    description: 'Write a post for X (at most 280 characters) for the user to review.',
    run: (args, ctx) =>
      connOutcome(
        (a) => draftArgs.safeParse(a),
        args,
        async (a) => {
          const made = await d.link.request<{ cardId: string }>('draft.create', {
            jobId: ctx.jobId,
            channel: 'x',
            to: { name: '', address: '' },
            body: a.text,
          });
          if (!made.ok) return { kind: 'error', errorKind: made.error.kind };
          // A post over 280 still makes the card; its too-long line and Shorten it are the user's (08-3 §16.3).
          return { kind: 'ok', result: { drafted: true, cardId: made.value.cardId, waitingForUser: true } };
        },
      ),
  };
  const openCompose: ToolDef = {
    name: 'x.openCompose',
    actionClass: 'prepare',
    args: 'draftCardId: string',
    description: 'Open the draft in X so the user can post it.',
    run: (args, ctx) =>
      connOutcome(
        (a) => openArgs.safeParse(a),
        args,
        async (a) => {
          const r = await d.link.request<void>('draft.openX', { jobId: ctx.jobId, cardId: a.draftCardId });
          if (!r.ok) return { kind: 'error', errorKind: r.error.kind };
          return { kind: 'ok', result: { opened: true, posted: false } };
        },
      ),
  };
  return { 'x.draft': draft, 'x.openCompose': openCompose };
}
