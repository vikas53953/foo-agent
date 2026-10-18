// Spec: 08-3 §15.1 (NotificationRequest, ToastAction: re-exported from shared/types), §15.3 (toast build), §15.4 (BadgeState,
// verbatim l.252), 08-3 §22.6 ("records toasts instead of showing them"), 09 §9.9 (toasts), §9.10 (taskbar). CR-0015
// G-M11-16 types the Notifier the spec names but never spells out. M7's NotificationService decides delivery and calls
// `show` only for toast, merged (same tag replaces) and summary; M11 builds the real Notifier and adds no decision logic.
import type { ToastSpec } from '../../shared/types';

export type { BadgeState, NotificationKind, NotificationRequest, ToastAction, ToastSpec } from '../../shared/types';

export interface Notifier {
  show(spec: ToastSpec): void;
  close(tag: string, group: string): void;
  closeGroup(group: string): void;
  closeAll(): void;
}
