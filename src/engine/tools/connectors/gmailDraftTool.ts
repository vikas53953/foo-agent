// Spec: 08-2 §8.2 `gmail.draft` (`{ to: string[]; subject; body; replyToMessageId? }`, prepare: a Gmail draft, a Draft card and
// its PENDING approvals row, never sends; the engine resolves `to`, never the AI), 08-4 §27.1 (its description, exact), 08-3
// §16.7 Use (one match → that person; two or more → Choice card "Which {Priya}?" with masked addresses; none → someone new,
// Art. 5), §16.1.4 (a reply keeps its Gmail thread), X-125 (Part 8 "Decisions:" lines carry the answered Choice).
// M8 T6. Main makes the draft (`draft.create`, src/main/drafts/DraftService.ts); this file only resolves who it goes to.
import { z } from 'zod';
import { t } from '../../../shared/copy/t';
import type { ContactHit } from '../../../shared/types';
import type { MainLink } from '../../protocol';
import type { ToolDef, ToolOutcome } from '../ToolLayer';
import { findPerson, type FindPersonDeps } from './contacts';
import type { Gmail } from './gmail';
import { connOutcome } from './limiter';

const OPTION_IDS = ['o1', 'o2', 'o3', 'o4'] as const;

const draftArgs = z
  .object({
    // One person per draft: the Draft card has one To line (05-2 §5.7).
    to: z.array(z.string().min(1).max(320)).length(1),
    subject: z.string().max(998).optional(),
    body: z.string().min(1).max(100_000),
    replyToMessageId: z.string().min(1).optional(),
  })
  .strict();

type Recipient = { name: string; address: string; isNew: boolean };

const isAddress = (s: string) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(s.trim());

export interface GmailDraftDeps {
  link: MainLink;
  gmail: Gmail;
  find: FindPersonDeps;
}

/** `gmail.draft`: who the draft is for, then main's `draft.create`. */
export function gmailDraftTool(d: GmailDraftDeps): ToolDef {
  // A "Which Priya?" answer comes back to the AI as its option label (Part 8 "Decisions:"); the next call names it.
  const picks = new Map<string, Map<string, ContactHit>>();
  const remembered = (jobId: string, who: string) => picks.get(jobId)?.get(who.trim().toLowerCase()) ?? null;

  async function resolve(jobId: string, who: string): Promise<Recipient | ToolOutcome> {
    const picked = remembered(jobId, who);
    if (picked?.emails[0]) return { name: picked.name, address: picked.emails[0], isNew: false };
    const query = who.trim();
    const m = await findPerson(query, d.find);
    if (m.match === 'one') {
      const hit = m.hits[0];
      // An address the AI gave counts as known only when it is this person's own; otherwise it is someone new (Art. 5).
      if (isAddress(query)) {
        const own = hit.emails.find((e) => e.toLowerCase() === query.toLowerCase());
        return own ? { name: hit.name || own, address: own, isNew: false } : { name: query, address: query, isNew: true };
      }
      const address = hit.emails[0];
      if (!address) return { kind: 'error', errorKind: 'NOT_FOUND' };
      return { name: hit.name || address, address, isNew: false };
    }
    if (m.match === 'many') {
      const options = m.choices.slice(0, OPTION_IDS.length).map((c, i) => ({ id: OPTION_IDS[i]!, label: c.label }));
      const mine = picks.get(jobId) ?? new Map<string, ContactHit>();
      for (const [i, c] of options.entries()) {
        const hit = m.hits.find((h) => h.id === m.choices[i]!.id);
        if (hit) mine.set(c.label.toLowerCase(), hit);
      }
      picks.set(jobId, mine);
      return {
        kind: 'needs_user',
        card: {
          type: 'choice',
          state: 'asking',
          payload: {
            purpose: 'job',
            question: t('cards.choice.question.which_person', { name: query }),
            options,
            aiReversible: false,
            reversible: false,
            livePrices: false,
          },
        },
      };
    }
    // Not in Contacts, sent mail or WhatsApp chats: someone new (Art. 5), if the AI was given an address at all.
    if (!isAddress(query)) return { kind: 'error', errorKind: 'NOT_FOUND' };
    return { name: query, address: query, isNew: true };
  }

  return {
    name: 'gmail.draft',
    actionClass: 'prepare',
    args: 'to: string[] (exactly one person), subject?: string, body: string, replyToMessageId?: string',
    description: 'Write an email draft for the user to review. Nothing is sent until the user taps Send.',
    run: (args, ctx) =>
      connOutcome(
        (a) => draftArgs.safeParse(a),
        args,
        async (a) => {
          const who = await resolve(ctx.jobId, a.to[0]!);
          if ('kind' in who) return who;
          let threadId: string | undefined;
          let subject = a.subject;
          if (a.replyToMessageId) {
            const orig = await d.gmail.hit(a.replyToMessageId);
            threadId = orig.threadId;
            if (subject === undefined && orig.subject) subject = /^re:/i.test(orig.subject) ? orig.subject : `Re: ${orig.subject}`;
          }
          const r = await d.link.request<{ approvalId: string; cardId: string; nonce: string }>('draft.create', {
            jobId: ctx.jobId,
            to: { name: who.name, address: who.address },
            ...(who.isNew ? { isNew: true } : {}),
            ...(subject !== undefined ? { subject } : {}),
            body: a.body,
            ...(threadId ? { threadId } : {}),
          });
          if (!r.ok) return { kind: 'error', errorKind: r.error.kind };
          // What the AI sees: the draft waits on the user's tap; it never learns the address it did not give.
          return { kind: 'ok', result: { drafted: true, cardId: r.value.cardId, to: who.name, waitingForSend: true } };
        },
      ),
  };
}
