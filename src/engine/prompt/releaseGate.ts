// Spec: 08-4 §25.5 item 2 (chat-lane release gate: hold everything for the first 1.5 s after the turn starts; </say> within
// that time → the whole text at once, chat mode; after 1.5 s release <say> one sentence at a time; a sentence ends at . ? ! ।
// or a line break, followed by whitespace or the end of <say>; each sentence passes 08-2 §7.6 steps 1, 2 and 4 first; a
// sentence with an unmapped banned word is held until the rewrite turn, then released or dropped; a partial sentence is never
// shown; at </say> the remainder is a sentence), item 1 (no <say> tag → the text before <act> is the say), item 5
// (PROTOCOL_SAY_LEAK is decided by the caller from what was released), 08-3 §22.2 (injected Clock), 04-2 §21.7 (the
// `Suggestions:` line never reaches the bubble: it is held from its first character and stripped at </say>; P1 T6).
import type { Clock, TimerId } from '../../shared/clock';
import type { Redactor } from '../redact/Redactor';
import { dropBannedSentences, filterSay, type FilterResult } from './filters';
import { splitSuggestions, suggestionsLineStart } from './suggestions';

export type ReleaseMode = 'whole' | 'sentence';

export interface ReleaseGateOptions {
  clock: Clock;
  /** One rewrite turn (purpose `rewrite`) for a held sentence; null = the turn failed (the sentence is dropped). */
  rewrite: (sentence: string) => Promise<string | null>;
  /** Text cleared for `message:delta` (sentence mode) or the whole reply (chat mode). */
  onRelease: (text: string, mode: ReleaseMode) => void;
  /** `</say>` closed (or the reply ended) and every held sentence has been released or dropped. */
  onSayClosed: () => void;
  /** Step 4; also used by the default filter. */
  redactor?: Pick<Redactor, 'scrub'>;
  /** The §7.6 filter; default `filterSay` with `redactor`. */
  filter?: (text: string) => FilterResult;
  /** The hold time, 1,500 ms (08-4 §25.5 item 2). */
  holdMs?: number;
}

const SAY_OPEN = '<say>';
const SAY_CLOSE = '</say>';
const ACT_OPEN = '<act>';
const BOUNDARY = /[.?!।\n]\s+|\n/gu;
/** A ``` fence line start (the bubble's fence rule, renderer/messages/markdownParse.ts). */
const FENCE_LINE = /^\s*```/gmu;
/**
 * R1 T2 (04 §13.5 / §14.4, AT-353): inside a code fence every line break ends a "sentence", so an ```a2ui block's messages
 * (one JSON object per line) release one by one and each complete message draws while the reply streams. Outside a fence a
 * line break still needs whitespace after it, as before. The gate keeps a running fence state ({@link ReleaseGate.inFence}).
 */

/**
 * Streaming release gate for one chat-lane turn. Feed every raw delta of the reply with {@link feed}; call {@link end} when
 * the AI's reply is finished. Releases come only through `onRelease`, never a partial sentence.
 */
export class ReleaseGate {
  private buf = '';
  private phase: 'detect' | 'say' | 'after' = 'detect';
  private tagged = false;
  private bodyStart = 0;
  private body = '';
  /** Index in `body` up to which sentences have been queued. */
  private consumed = 0;
  /** Index in `body` up to which fence lines have been counted, and whether a fence is open there. */
  private fenceAt = 0;
  private fenceOpen = false;
  private sayClosed = false;
  private streaming = false;
  private timer: TimerId | null;
  private readonly queue: { text: string; mode: ReleaseMode }[] = [];
  private busy = false;
  private signalled = false;
  private released = '';
  private readonly filter: (text: string) => FilterResult;
  private resolveDone!: () => void;
  /** Resolves after `onSayClosed`. */
  readonly done: Promise<void>;

  constructor(private readonly opts: ReleaseGateOptions) {
    this.filter = opts.filter ?? ((t) => filterSay(t, opts.redactor ? { redactor: opts.redactor } : {}));
    this.done = new Promise((r) => (this.resolveDone = r));
    this.timer = opts.clock.setTimeout(() => this.onHoldOver(), opts.holdMs ?? 1500);
  }

  /** Everything released so far (the caller logs PROTOCOL_SAY_LEAK when a non-reply kind released text). */
  get releasedText(): string {
    return this.released;
  }

  /** The raw `<say>` text seen so far (unfiltered). */
  get sayText(): string {
    return this.body;
  }

  get closed(): boolean {
    return this.sayClosed;
  }

  /** One raw delta of the reply (any part: say, act or stray text). */
  feed(delta: string): void {
    if (this.phase === 'after') return;
    this.buf += delta;
    this.parse(false);
  }

  /** The reply is complete: an unclosed `<say>` (or untagged text) ends here. */
  end(): void {
    if (this.phase !== 'after') this.parse(true);
  }

  private parse(final: boolean): void {
    if (this.phase === 'detect') {
      const lead = this.buf.trimStart();
      if (lead.startsWith(SAY_OPEN)) {
        this.tagged = true;
        this.bodyStart = this.buf.indexOf(SAY_OPEN) + SAY_OPEN.length;
        this.phase = 'say';
      } else if (!final && (SAY_OPEN.startsWith(lead) || lead === '')) {
        return;
      } else {
        this.bodyStart = 0;
        this.phase = 'say';
      }
    }
    const raw = this.buf.slice(this.bodyStart);
    const ends = [raw.indexOf(ACT_OPEN), this.tagged ? raw.indexOf(SAY_CLOSE) : -1].filter((i) => i !== -1);
    if (ends.length || final) {
      this.body = ends.length ? raw.slice(0, Math.min(...ends)) : raw;
      if (!this.tagged) this.body = this.body.trimStart();
      // Everything before the line is unchanged, so what was already queued still lines up with `consumed`.
      this.body = splitSuggestions(this.body).text;
      this.close();
      return;
    }
    this.body = this.tagged ? raw : raw.trimStart();
    if (this.streaming) this.queueSentences(this.safeLength());
  }

  /** Length of `body` that cannot still turn into a closing marker or belong to the `Suggestions:` line. */
  private safeLength(): number {
    const held = suggestionsLineStart(this.body);
    if (held !== -1) return held;
    const lt = this.body.lastIndexOf('<');
    if (lt === -1) return this.body.length;
    const tail = this.body.slice(lt);
    return SAY_CLOSE.startsWith(tail) || ACT_OPEN.startsWith(tail) ? lt : this.body.length;
  }

  /** Whether `at` lies inside a code fence: counts only the fence lines after the last call's point, so a reply stays O(n). */
  private inFence(text: string, at: number): boolean {
    FENCE_LINE.lastIndex = this.fenceAt;
    let f: RegExpExecArray | null;
    while ((f = FENCE_LINE.exec(text)) && f.index + f[0].length <= at) {
      this.fenceOpen = !this.fenceOpen;
      this.fenceAt = f.index + f[0].length;
    }
    return this.fenceOpen;
  }

  private queueSentences(limit: number, pump = true): void {
    const avail = this.body.slice(0, limit);
    BOUNDARY.lastIndex = this.consumed;
    let m: RegExpExecArray | null;
    while ((m = BOUNDARY.exec(avail))) {
      if (m[0] === '\n' && !this.inFence(avail, m.index)) continue;
      const end = m.index + m[0].length;
      this.queue.push({ text: avail.slice(this.consumed, end), mode: 'sentence' });
      this.consumed = end;
    }
    if (pump) this.pump();
  }

  private close(): void {
    this.phase = 'after';
    if (this.timer !== null) {
      this.opts.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.streaming) {
      this.queueSentences(this.body.length, false);
      const rest = this.body.slice(this.consumed);
      if (rest) this.queue.push({ text: rest, mode: 'sentence' });
      this.consumed = this.body.length;
    } else {
      this.queue.push({ text: this.body, mode: 'whole' });
    }
    this.sayClosed = true;
    this.pump();
  }

  private onHoldOver(): void {
    this.timer = null;
    if (this.sayClosed) return;
    this.streaming = true;
    if (this.phase === 'say') this.queueSentences(this.safeLength());
  }

  private emit(text: string, mode: ReleaseMode): void {
    if (!text.trim()) return;
    this.released += text;
    this.opts.onRelease(text, mode);
  }

  private pump(): void {
    while (!this.busy && this.queue.length) {
      const item = this.queue.shift()!;
      const f = this.filter(item.text);
      if (!f.needsRewrite) {
        this.emit(f.text, item.mode);
        continue;
      }
      this.busy = true;
      this.opts
        .rewrite(f.text)
        .then(
          (r) => (r === null ? dropBannedSentences(f.text) : dropBannedSentences(this.filter(r).text)),
          () => dropBannedSentences(f.text),
        )
        .then((text) => {
          this.emit(text, item.mode);
          this.busy = false;
          this.pump();
        });
      return;
    }
    if (!this.busy && this.sayClosed && !this.signalled) {
      this.signalled = true;
      this.opts.onSayClosed();
      this.resolveDone();
    }
  }
}
