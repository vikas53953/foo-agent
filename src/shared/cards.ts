// Spec: 05 card payloads (the line a card is known by: a checklist or brief `title`, a choice `question`, a payment or bill
// `payee`, a sign-in `site`), 03-shell-1 §3.4.6 (list preview), 03-shell-2 §3.6.2.1 row 2 / §3.7.3.1 ("Needs you: {title}").
/** The short name of a card, from its payload. */
export function cardTitle(payload: Record<string, unknown>): string {
  return String(payload.title ?? payload.question ?? payload.payee ?? payload.site ?? '');
}
