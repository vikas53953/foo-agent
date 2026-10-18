// Spec: 08-3 §22.6 (the fake Notifier "records toasts instead of showing them"), §22.8 (`test:notifier` returns the log),
// CR-0015 (G-M11-16). Test runs only: this folder is left out of the packaged app.
import type { Notifier, ToastSpec } from '../notify/types';

export type NotifierCall =
  { op: 'show'; spec: ToastSpec } | { op: 'close'; tag: string; group: string } | { op: 'closeGroup'; group: string } | { op: 'closeAll' };

/** Keeps the toasts on show as Windows would (same tag + group replaces) and every call in order. */
export class RecordingNotifier implements Notifier {
  readonly calls: NotifierCall[] = [];
  private live = new Map<string, ToastSpec>();

  show(spec: ToastSpec): void {
    this.calls.push({ op: 'show', spec });
    this.live.set(`${spec.group}\u0000${spec.tag}`, spec);
  }
  close(tag: string, group: string): void {
    this.calls.push({ op: 'close', tag, group });
    this.live.delete(`${group}\u0000${tag}`);
  }
  closeGroup(group: string): void {
    this.calls.push({ op: 'closeGroup', group });
    for (const [key, spec] of this.live) if (spec.group === group) this.live.delete(key);
  }
  closeAll(): void {
    this.calls.push({ op: 'closeAll' });
    this.live.clear();
  }

  /** Every toast shown, oldest first (what `test:notifier` returns). */
  shown(): ToastSpec[] {
    return this.calls.flatMap((c) => (c.op === 'show' ? [c.spec] : []));
  }
  /** The toasts still in the notification centre. */
  showing(): ToastSpec[] {
    return [...this.live.values()];
  }
  reset(): void {
    this.calls.length = 0;
    this.live.clear();
  }
}
