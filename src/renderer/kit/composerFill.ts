// Spec: 04 §13.7 "Try it" (the kit Button action `composer.fill` { text } fills the composer with the row's sentence and
// focuses it, exactly like a suggestion chip, 04-2 §21.7; never sends; handled in the renderer and never sent to the
// engine), CR-0024 §(e) 2. C1 T2. Only the engine-built Capabilities card calls this: an AI surface cannot carry the
// action at all (shared/kit/catalog.ts refuses the name), so the gate is never bypassed.
import type { z } from 'zod';
import type { KitActionSchema } from '../../shared/kit/catalog';
import { COMPOSER_FILL } from '../../shared/kit/capabilities';
import { clockNow } from '../store/apply';
import { requestComposer } from '../store/messages';

type KitAction = z.infer<typeof KitActionSchema>;

/** The `composer.fill` action of a Capabilities row (built here, not from the AI's catalog, which refuses the name). */
export function composerFillAction(text: string): { event: { name: typeof COMPOSER_FILL; context: { text: string } } } {
  return { event: { name: COMPOSER_FILL, context: { text } } };
}

/** Fills the chat's composer with the action's text; true when it was a `composer.fill` with words. Nothing is sent. */
export function composerFill(chatId: string, action: KitAction | ReturnType<typeof composerFillAction>): boolean {
  const text = action.event.context?.text;
  if (action.event.name !== COMPOSER_FILL || typeof text !== 'string' || !text.trim()) return false;
  requestComposer(chatId, { kind: 'prefill', text, at: clockNow() });
  return true;
}
