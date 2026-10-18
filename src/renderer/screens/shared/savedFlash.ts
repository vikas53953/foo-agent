// Spec: 06 §0.5 Saving (typed fields save on Enter or blur and show "Saved" for 2s, `--dur-confirm`; a write that fails
// reverts the value and shows the row-level retry line). The 2s flash as a hook a row's owner drives.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from '../../../shared/tokens';

/** `[saved, flash]`: call `flash()` after a write lands; `saved` is true for `--dur-confirm`, then false. */
export function useSavedFlash(ms: number = motion['dur-confirm']): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setSaved(false);
    }, ms);
  }, [ms]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return [saved, flash];
}
