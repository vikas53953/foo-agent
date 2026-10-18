// Spec: 08-3 §16.1.1 (missing client file → Google Connect buttons disabled with "Gmail isn't available in this build."),
// 06-3 §14 C-10 (routines that use Gmail, Calendar or Contacts); `connection:googleInfo` is a gap channel (implementation-notes
// "M8 T2"). Read once per window and shared by the Connect card and Settings → Connections.
import { useEffect, useState } from 'react';
import type { InvokeOut } from '../../../shared/ipc';
import { invoke } from '../../ipc/client';

export type GoogleInfo = InvokeOut['connection:googleInfo'];

let cached: Promise<GoogleInfo> | null = null;

function load(fresh: boolean): Promise<GoogleInfo> {
  if (!cached || fresh)
    cached = invoke('connection:googleInfo', {})
      .then((r) => (r.ok ? r.value : { available: false, routines: [] }))
      .catch(() => ({ available: false, routines: [] }));
  return cached;
}

/** `null` until main answered. `fresh` re-reads (the routines list for C-10 can change). */
export function useGoogleInfo(fresh = false): GoogleInfo | null {
  const [info, setInfo] = useState<GoogleInfo | null>(null);
  useEffect(() => {
    let live = true;
    void load(fresh).then((v) => live && setInfo(v));
    return () => {
      live = false;
    };
  }, [fresh]);
  return info;
}
