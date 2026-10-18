// Spec: 06-2 §6.2 rows `accent` ("Use my Windows accent colour", AT-147) and `animations` ("Off · set by Windows" when Windows
// animation effects are off, X-150, AT-283), 08-3 §22.8 (test builds stand in for both through test:accent / test:osAnimations).
import { systemPreferences } from 'electron';

export interface PlatformLook {
  accent: string | null;
  osAnimations: boolean;
}

const override: { accent?: string | null; osAnimations?: boolean } = {};

function osAccent(): string | null {
  try {
    const rgba = systemPreferences.getAccentColor();
    return /^[0-9a-f]{6}/i.test(rgba) ? `#${rgba.slice(0, 6).toUpperCase()}` : null;
  } catch {
    return null;
  }
}

function osAnimationsOn(): boolean {
  try {
    return systemPreferences.getAnimationSettings().shouldRenderRichAnimation;
  } catch {
    return true;
  }
}

/** What the renderer reads at load: the Windows accent and whether Windows animation effects are on. */
export function platformLook(): PlatformLook {
  return {
    accent: 'accent' in override ? (override.accent ?? null) : osAccent(),
    osAnimations: override.osAnimations ?? osAnimationsOn(),
  };
}

/** Test builds only (test:accent, test:osAnimations): `null` returns to the OS value. Takes effect on the next window load. */
export function setLookOverride(o: { accent?: string | null; osAnimations?: boolean | null }): void {
  if ('accent' in o) {
    if (o.accent === null) delete override.accent;
    else override.accent = o.accent;
  }
  if ('osAnimations' in o) {
    if (o.osAnimations === null || o.osAnimations === undefined) delete override.osAnimations;
    else override.osAnimations = o.osAnimations;
  }
}
