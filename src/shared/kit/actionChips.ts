// Spec: 04-2 §21.7 "Action chips" (X-180, CR-0022: Call, Open map, Add to calendar, Open link; an action chip that acts for
// the user goes through the normal gates, Article 6), 04 §13.6 (C-26 "This opens {domain}. Open it?" before a link opens),
// AT-367. R1 T7. Pure: main opens exactly the URL this builds from the stored chip; the renderer shows its domain first.
import type { ActionChip } from '../types';

/** The URL a call, map or link chip opens (a calendar chip opens nothing: it is sent to foo as the user's words). */
export function chipUrl(chip: ActionChip): string | null {
  switch (chip.kind) {
    case 'call':
      return `tel:${chip.value.replace(/[^+0-9]/g, '')}`;
    case 'map':
      // Google Maps URLs (developers.google.com/maps/documentation/urls): a search for the place's words.
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chip.value)}`;
    case 'link':
      try {
        return new URL(chip.value).protocol === 'https:' ? chip.value : null;
      } catch {
        return null;
      }
    case 'calendar':
      return null;
  }
}

/** What the C-26 dialog names: the site's host, or the number a call dials. */
export function chipDomain(chip: ActionChip): string {
  if (chip.kind === 'call') return chip.value;
  const url = chipUrl(chip);
  try {
    return url ? new URL(url).hostname : chip.value;
  } catch {
    return chip.value;
  }
}
