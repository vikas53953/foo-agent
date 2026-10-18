// Spec: 06 §0.5 Offline (screens still open and show local data; only controls that need the internet are disabled, and
// each one's tooltip is "You're offline. This needs the internet."; the global offline banner is 03-shell's).
import { t } from '../../../shared/copy/t';

/** The tooltip of a control disabled because it needs the internet. */
export function offlineTooltip(): string {
  return t('screen.common.offline_tooltip');
}
