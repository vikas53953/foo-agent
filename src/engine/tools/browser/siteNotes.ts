// Spec: 08-2 §8.3.9 (site notes, Instinct browser guidance: after blocks (`SITE_BLOCKED`), CAPTCHAs (`SITE_CAPTCHA`) and
// successes the engine updates `site_notes.flags` and appends a dated line to `sites\{domain}.md`; step turns receive the flags
// for every domain in play; `blocksAutomation` seen within 14 days → the AI is told to skip that site, J9 "Zomato blocked me"),
// 08-1 §4.3.13 (`site_notes(domain, flags JSON { blocksAutomation, needsSignIn, captchaAlways, otpChannel, searchLoop,
// bookingWorks }, updated_at)`), §4.1 (the .md is authoritative for text, the row caches the flags), 08-1 §2.4.1 `siteNotes`.
// `blocksAutomation` holds the time it was last seen (ms), so the 14 days are counted from the block, not from the row's last
// change. Sign-in needs and the OTP channel are T7's lanes; loops stay with the watchdog. The lines name no person: only what
// the site did.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MainLink } from '../../protocol';

export const BLOCK_SKIP_MS = 14 * 24 * 60 * 60 * 1000;

export interface SiteFlags {
  blocksAutomation?: number;
  needsSignIn?: boolean;
  captchaAlways?: boolean;
  otpChannel?: string;
  searchLoop?: boolean;
  bookingWorks?: boolean;
}

export type SiteEvent = 'blocked' | 'captcha' | 'booked' | 'done';

const LINE: Record<SiteEvent, string> = {
  blocked: 'blocked foo (refused the page or showed a bot check)',
  captcha: 'showed a CAPTCHA',
  booked: 'a booking went through',
  done: 'a job here finished with proof',
};

/** The flags after `event` (a success clears an old block: the site let foo through). */
export function applyEvent(flags: SiteFlags, event: SiteEvent, now: number): SiteFlags {
  const next: SiteFlags = { ...flags };
  if (event === 'blocked') next.blocksAutomation = now;
  if (event === 'captcha') next.captchaAlways = true;
  if (event === 'booked') next.bookingWorks = true;
  if (event === 'booked' || event === 'done') delete next.blocksAutomation;
  return next;
}

export function blockedRecently(flags: SiteFlags | undefined, now: number): boolean {
  return typeof flags?.blocksAutomation === 'number' && now - flags.blocksAutomation < BLOCK_SKIP_MS;
}

/** The host of a page foo was sent to, lower-case, `www.` dropped (one notes file per site). */
export function domainOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./u, '');
    return /^[a-z0-9][a-z0-9.-]*$/u.test(h) ? h : null;
  } catch {
    return null;
  }
}

/** The step turn's lines for the domains in play (08-2 §8.3.9). */
export function promptLines(notes: Record<string, SiteFlags>, now: number, isoDate: (ms: number) => string): string[] {
  const lines: string[] = [];
  for (const [domain, f] of Object.entries(notes)) {
    if (blockedRecently(f, now)) {
      lines.push(`- ${domain}: blocked foo on ${isoDate(f.blocksAutomation!)}. Skip this site; use another one.`);
      continue;
    }
    const known = [f.captchaAlways && 'shows a CAPTCHA', f.needsSignIn && 'needs sign-in', f.bookingWorks && 'booking worked before']
      .filter(Boolean)
      .join(', ');
    if (known) lines.push(`- ${domain}: ${known}.`);
  }
  return lines.length ? ['Site notes:', ...lines] : [];
}

export interface SiteNotesDeps {
  link: Pick<MainLink, 'request'>;
  dataDir: string;
  now(): number;
  timeZone(): string;
  log(event: string, kind?: string): void;
}

/** Per job: the domains in play, what happened on them, and the notes the step turn reads. */
export class SiteNotes {
  private readonly inPlay = new Map<string, Set<string>>();
  /** Domains that blocked foo or showed a CAPTCHA in this job: the job finishing elsewhere says nothing good about them. */
  private readonly troubled = new Map<string, Set<string>>();
  /** The site the job's window was last sent to by browser.open. */
  private readonly window = new Map<string, string>();

  constructor(private readonly d: SiteNotesDeps) {}

  isoDate = (ms: number): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: this.d.timeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

  /** After each tool call: browser.open (and a blocked web.fetch) names a domain; a block or CAPTCHA there is written down at once. */
  async onTool(jobId: string, tool: string, args: unknown, errorKind: string | null, result?: unknown): Promise<void> {
    const trouble = errorKind === 'SITE_BLOCKED' || errorKind === 'SITE_CAPTCHA';
    // A web.fetch read is noted only when the site blocked it: a plain GET that worked says nothing about driving the site.
    const names = tool === 'browser.open' || (tool === 'web.fetch' && trouble);
    if (!names && !tool.startsWith('browser.')) return;
    // A blocked web.fetch names the site it landed on after redirects; the asked address may only have pointed there.
    const landed = tool === 'web.fetch' ? (result as { site?: unknown } | null)?.site : undefined;
    const asked = names ? domainOf(typeof landed === 'string' ? `https://${landed}/` : (args as { url?: unknown } | null)?.url) : null;
    const set = this.inPlay.get(jobId) ?? new Set<string>();
    if (asked) set.add(asked);
    this.inPlay.set(jobId, set);
    // The other browser tools act on the window's site; a web.fetch read never moves the window.
    if (asked && tool === 'browser.open') this.window.set(jobId, asked);
    const where = asked ?? this.window.get(jobId) ?? null;
    if (!where) return;
    if (!trouble) return;
    const bad = this.troubled.get(jobId) ?? new Set<string>();
    bad.add(where);
    this.troubled.set(jobId, bad);
    await this.record(where, errorKind === 'SITE_BLOCKED' ? 'blocked' : 'captcha');
  }

  /**
   * A job reached DONE with proof: `booked` are the pages a `browser.submit` succeeded on; every other domain in play worked,
   * except one that blocked foo or showed a CAPTCHA in this job (J9: Zomato blocked, the table was booked elsewhere).
   */
  async onDone(jobId: string, booked: readonly string[]): Promise<void> {
    const bad = this.troubled.get(jobId);
    for (const domain of this.inPlay.get(jobId) ?? []) {
      if (booked.includes(domain)) await this.record(domain, 'booked');
      else if (!bad?.has(domain)) await this.record(domain, 'done');
    }
  }

  forget(jobId: string): void {
    this.inPlay.delete(jobId);
    this.troubled.delete(jobId);
    this.window.delete(jobId);
  }

  async linesFor(jobId: string): Promise<string[]> {
    const domains = [...(this.inPlay.get(jobId) ?? [])];
    if (!domains.length) return [];
    const r = await this.d.link.request<Record<string, { flags: SiteFlags }>>('db.query', { q: 'siteNotes', args: [domains] });
    if (!r.ok) return [];
    const notes = Object.fromEntries(Object.entries(r.value).map(([k, v]) => [k, v.flags]));
    return promptLines(notes, this.d.now(), this.isoDate);
  }

  /** Flags into the row (upsert by domain), then one dated line appended to sites/{domain}.md. */
  async record(domain: string, event: SiteEvent): Promise<void> {
    const now = this.d.now();
    const cur = await this.d.link.request<Record<string, { flags: SiteFlags }>>('db.query', { q: 'siteNotes', args: [[domain]] });
    const flags = applyEvent(cur.ok ? (cur.value[domain]?.flags ?? {}) : {}, event, now);
    const w = await this.d.link.request('db.tx', {
      ops: [{ op: 'insert', table: 'site_notes', row: { domain, flags, updated_at: now } }],
    });
    if (!w.ok) this.d.log('site_notes.write_failed', w.error.kind);
    const rel = `sites/${domain}.md`;
    const prev = await readFile(join(this.d.dataDir, 'sites', `${domain}.md`), 'utf8').catch(() => `# ${domain}\n\n`);
    const f = await this.d.link.request('file.write', {
      relPath: rel,
      text: `${prev}- ${this.isoDate(now)}: ${LINE[event]}\n`,
      atomic: true,
    });
    if (!f.ok) this.d.log('site_notes.file_failed', f.error.kind);
  }
}
