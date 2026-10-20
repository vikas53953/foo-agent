// Spec: 04 §13.5 ("every TextField and ShortForm value passes the 04-2 §22.4 secret patterns before it leaves the
// renderer; a match is refused and the Secret box is offered", Article 8), 04-2 §22.4 ("Move to secret box": a Secret box
// card is posted in this chat with the value already in its masked field and a suggested name; the span leaves the field;
// groups never get one), CR-0022 AT-370, X-180. R1 T4: the offer for ShortForm and for T2's Button context.
import { useState } from 'react';
import { t } from '../../shared/copy/t';
import { findSecrets, secretOnly, suggestedNameSlot, type SecretNameSlot } from '../../shared/redactor';
import { invoke } from '../ipc/client';
import { prefillSecret } from '../cards/secretPrefill';
import { selectChat } from '../store/chats';
import { useStore } from '../store/index';
import { Button } from '../ui/Button';
import styles from './NumbersForms.module.css';

/** A refused value: what moves into the Secret box, its suggested name and the text it came from. */
export interface SecretCatch {
  /** The whole text the secret was found in (a field value or an action context string). */
  text: string;
  /** Only the secret (a P11 label is left out). */
  value: string;
  slot: SecretNameSlot;
  /** `text` with the secret cut out, for the field it came from. */
  rest: string;
}

/** The first of `texts` that holds a secret (04-2 §22.4 patterns), or null. */
export function firstSecret(texts: readonly string[]): SecretCatch | null {
  for (const text of texts) {
    const hit = findSecrets(text)[0];
    if (!hit) continue;
    return {
      text,
      value: secretOnly(hit, text.slice(hit.start, hit.end)),
      slot: suggestedNameSlot(hit),
      rest: (text.slice(0, hit.start) + text.slice(hit.end)).trim(),
    };
  }
  return null;
}

/**
 * Words a field label uses when it asks for a password, PIN, one-time code, card number, card code or key (the labels of
 * 04-2 §22.4 P11–P15; "PIN code" is the Indian postal code and stays). A ShortForm never asks for one (catalog), so such a field is not drawn: the refusal shows instead.
 */
const ASKS_FOR_SECRET =
  /\b(?:password|passwd|pwd|passcode|pin(?![ -]?code)|mpin|otp|one[ -]time (?:password|code)|verification code|login code|cvv2?|cvc2?|security code|card number|api key|secret key|access key)\b|पासवर्ड|ਪਾਸਵਰਡ/iu;
export const asksForSecret = (label: string): boolean => ASKS_FOR_SECRET.test(label);

/** "This looks like a password or code. Use the Secret box instead." with "Move to secret box" (not in a group). */
export function SecretRefused({ chatId, caught, onMoved }: { chatId: string; caught: SecretCatch | null; onMoved(): void }) {
  const inGroup = useStore((s) => selectChat(chatId)(s)?.kind === 'group');
  const [busy, setBusy] = useState(false);
  const move = () => {
    if (!caught || busy) return;
    setBusy(true);
    void invoke('secret:offer', { chatId, slot: caught.slot })
      .then((r) => {
        if (!r.ok) return;
        prefillSecret(r.value.id, caught.value);
        onMoved();
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <div className={styles.refused} role="alert">
      <p className={styles.caption}>{t('kit.form.secret_refused')}</p>
      {caught && !inGroup && (
        <Button variant="outline" icon="LockClosed" disabled={busy} onClick={move}>
          {t('composer.paste.move')}
        </Button>
      )}
    </div>
  );
}
