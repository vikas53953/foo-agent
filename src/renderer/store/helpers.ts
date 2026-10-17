// Spec: 08-1 §4.3.8 `helpers` (names, one-line jobs, faces and colours), 03-shell-2 §3.6.2.1 row 13 (a helper chat's idle
// status is its job line), §3.7.3.3 ("What {helper} knows"), §3.7.4 ("In this group" rows). Not one of the 08-5 §5 slices:
// it mirrors `helper:list` (an added channel, implementation-notes "M1 integration"), loaded after the bootstrap.
import type { HelperRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export interface HelpersState {
  byId: Record<string, HelperRow>;
}

export const initialHelpers = (): HelpersState => ({ byId: {} });

export function loadHelpersReducer(s: HelpersState, rows: HelperRow[]): void {
  for (const r of rows) if (acceptRev('helper', r.id, s.byId[r.id], r)) s.byId[r.id] = r;
}

export const selectHelpers = (s: RootState) => s.helpers.byId;
export const selectHelper = (helperId: string | null) => (s: RootState) => (helperId ? s.helpers.byId[helperId] : undefined);
