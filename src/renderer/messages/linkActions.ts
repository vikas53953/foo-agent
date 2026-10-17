// Spec: 04 §10.7 / §13 (links open in the default browser; a link whose text names another domain asks first with C-26),
// §16.1 (auto-link menus: open, copy, "Ask {agentName} to write to them" and "Add to calendar" put a line in the composer,
// "Call from your phone" opens `tel:`, "Open in Maps" opens Google Maps search), 02-3 §F30.4 (copy is plain text).
import { t } from '../../shared/copy/t';
import { invoke } from '../ipc/client';
import { openDialog, update } from '../store/index';
import { requestComposer } from '../store/messages';
import { clockNow } from '../store/apply';
import { otherDomain } from './textRules';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens a link (http, https, mailto, tel) in its default Windows app through main (link:open). */
export function openUrl(url: string): void {
  void invoke('link:open', { url });
}

/** §13 Link click: C-26 first when the visible text names another domain. */
export function openLink(url: string, shown: string): void {
  const domain = otherDomain(shown, url);
  if (!domain) return openUrl(url);
  update((s) => {
    s.messages.pendingLink = { url, shown: shown.trim(), domain };
  });
  openDialog('c-26');
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function prefillWriteEmail(chatId: string, address: string): void {
  requestComposer(chatId, { kind: 'prefill', text: t('composer.prefill.write_email', { address }), at: clockNow() });
}

export function prefillCalendar(chatId: string, date: string): void {
  requestComposer(chatId, { kind: 'prefill', text: t('composer.prefill.add_to_calendar', { date }), at: clockNow() });
}
