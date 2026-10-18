// Spec: 08-3 §16.1.3 (the Gmail poller emits each new inbox message id once to `on_email` routines, §13.3, and to the brief
// collector; after a 404 re-baseline it de-duplicates by message id against `routine_runs` and brief records), CR-0012 (M8
// T4 exposes these interfaces only; lane A, M7, wires routines and the brief to them and owns `engine/routines/*` and
// `engine/brief/*`). Nothing here reads or writes those tables.

/** One new inbox message as the hooks see it. Words stay inside the engine; the AI sees them only through a job's tools. */
export interface NewEmail {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  /** ISO time it arrived. */
  date: string;
}

interface Dedupe {
  /** True when this message was already handled before (a `routine_runs` row, a brief record). Used after a re-baseline. */
  seen?(messageId: string): boolean | Promise<boolean>;
}

/** `on_email` routines (08-3 §13.3; M7 implements). */
export interface EmailHook extends Dedupe {
  onEmail(mail: NewEmail): void | Promise<void>;
}

/** The morning brief's collector (M7 implements): gathers new mail for "Gmail since the last brief". */
export interface BriefSource extends Dedupe {
  collect(mail: NewEmail): void | Promise<void>;
}

/** Where connectors hand new items to their listeners. Each add returns its own remove. */
export class ConnectorHooks {
  private email = new Set<EmailHook>();
  private brief = new Set<BriefSource>();

  addEmailHook(h: EmailHook): () => void {
    this.email.add(h);
    return () => this.email.delete(h);
  }

  addBriefSource(b: BriefSource): () => void {
    this.brief.add(b);
    return () => this.brief.delete(b);
  }

  /** Any listener already handled this message. */
  async seen(messageId: string): Promise<boolean> {
    for (const l of [...this.email, ...this.brief]) if (await l.seen?.(messageId)) return true;
    return false;
  }

  /** Gives one new message to every listener; one listener failing never stops the others. */
  async emitEmail(mail: NewEmail): Promise<void> {
    for (const h of this.email) await Promise.resolve(h.onEmail(mail)).catch(() => undefined);
    for (const b of this.brief) await Promise.resolve(b.collect(mail)).catch(() => undefined);
  }
}
