// Spec: 08-0 §C (data-testid scheme, X-58). Ids are static; components read them from here (lint foo/testid-from-registry).
export const TID = {
  /** 03-shell-1 §3.2.5: the title-bar drag strip. */
  titlebarStrip: 'titlebar-strip',
} as const;

export type TestId = (typeof TID)[keyof typeof TID];
