// Spec: 05-3 §5.10.3 (the banner page: its state `waiting` / `in_control` / `signed_in`, set by main through the URL hash;
// the read-only address row: `LockClosed` for https, no lock plus "Not secure" for http, domain bold and path, read from
// the page URL so the user always sees which site they are typing into). The query and fragment are never shown: only the
// domain and path are (they can carry one-time tokens; foo decision, implementation-notes "M9 T6").
export type BannerState = 'waiting' | 'in_control' | 'signed_in';

export interface BannerPage {
  jobId: string;
  state: BannerState;
  url: string;
  agentName: string;
}

const STATES: readonly string[] = ['waiting', 'in_control', 'signed_in'];

export function parseBannerHash(hash: string): BannerPage | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const jobId = q.get('job');
  const state = q.get('state');
  const url = q.get('url');
  const agentName = q.get('agent');
  if (!jobId || !state || !STATES.includes(state) || url === null || !agentName) return null;
  return { jobId, state: state as BannerState, url, agentName };
}

export interface Address {
  secure: boolean;
  domain: string;
  path: string;
}

export function addressOf(url: string): Address | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { secure: u.protocol === 'https:', domain: u.hostname, path: u.pathname };
  } catch {
    return null;
  }
}
