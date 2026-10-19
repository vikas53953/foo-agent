// Spec: 05-2 §5.8.2 (the title is the plain name: "OpenAI key", "IRCTC login", "Card", never an environment-variable name),
// §5.8.4 (titles per variant: "{Service} key", "{Site} login"), 05 §0.4 + X-116 (a card is "{Visa} ••{4242}"), 08-0 §B.3
// `secrets_index.label` (user-facing, e.g. "Visa ••4242", "OpenAI key"), 06-3 §9.4 activity lines ("Saved your {OpenAI
// key}" / "Replaced your …" / "Removed your …"). The one place a vault name becomes words.
import { t } from '../../shared/copy/t';
import type { SecretKind } from '../../shared/types';

/** The service each vault `{name}` belongs to (product names, not copy). */
const SERVICE: Record<string, string> = {
  'openai-key': 'OpenAI',
  'anthropic-key': 'Anthropic',
  'google-key': 'Google',
  exa: 'Exa',
  tavily: 'Tavily',
  firecrawl: 'Firecrawl',
  browseruse: 'Browser Use',
  composio: 'Composio',
  google: 'Google',
  outlook: 'Outlook',
  whatsapp: 'WhatsApp',
};

export function secretLabel(kind: SecretKind, name: string, brand: string | null): string {
  if (kind === 'card') return `${brand ?? t('cards.secret.title.card')} ••${name}`;
  if (kind === 'login') return t('cards.secret.title.login', { site: name });
  return t('cards.secret.title.key', { service: SERVICE[name] ?? name });
}

export type SecretEvent = 'secret_saved' | 'secret_replaced' | 'secret_removed';

/** 06-3 §9.4 activity summary for a vault change (the label only, never a value). */
export function secretActivityLine(event: SecretEvent, label: string): string {
  if (event === 'secret_saved') return `Saved your ${label}`;
  if (event === 'secret_replaced') return `Replaced your ${label}`;
  return `Removed your ${label}`;
}
