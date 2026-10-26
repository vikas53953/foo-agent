// Spec: 02-3 §F22 as amended by X-179 (Approve when the user's tap turns an Approval or Payment card APPROVED; Done when a
// job of the open chat turns DONE with proof; never in quiet hours or while hidden), CR-0021 pick 20, AT-318.
import { useEffect } from 'react';
import { quietUntil } from '../shell/statusLine';
import { useStore, type RootState } from '../store/index';
import { quietHours } from '../store/live';
import { selectOpenChatId } from '../store/ui';
import { approvedByUser, doneWithProof, soundAllowed, type SoundName } from './gate';
import { playTone } from './tones';

function allowed(s: RootState): boolean {
  const v = s.settings.value;
  if (!v) return false;
  const hours = quietHours(s);
  return soundAllowed({
    setting: v.appearance.sounds,
    quiet: hours !== null && quietUntil(hours, s.live.now, v.locale.timeZone) !== null,
    hidden: document.visibilityState === 'hidden',
  });
}

/** The sound a store change earns, if any (Approve wins when both land in one change). */
export function soundFor(prev: RootState, next: RootState): SoundName | null {
  if (next.cards.byId !== prev.cards.byId) {
    for (const card of Object.values(next.cards.byId)) {
      const before = prev.cards.byId[card.id];
      if (before !== card && approvedByUser(before, card)) return 'approve';
    }
  }
  if (next.jobs.byId !== prev.jobs.byId) {
    const open = selectOpenChatId(next);
    for (const job of Object.values(next.jobs.byId)) {
      const before = prev.jobs.byId[job.id];
      if (before !== job && doneWithProof(before, job, open)) return 'done';
    }
  }
  return null;
}

/** Mounted once at the root (ShellKeys). */
export function useSounds(): void {
  useEffect(
    () =>
      useStore.subscribe((next, prev) => {
        const name = soundFor(prev, next);
        if (name && allowed(next)) playTone(name);
      }),
    [],
  );
}
