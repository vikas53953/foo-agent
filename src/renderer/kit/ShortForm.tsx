// Spec: 04 §13.5 (kit `ShortForm`: up to 6 fields and a submit that sends one action; every value passes the 04-2 §22.4
// secret patterns before it leaves the renderer, a match is refused and the Secret box is offered, Article 8; the catalog
// never asks for passwords, card numbers, codes or keys), 06 §0.4 (fields), CR-0022 AT-351, AT-370, X-180. R1 T4.
// A field whose label asks for a secret is not drawn; the refusal line stands in its place. The values live in the
// surface's data model (KitSurface keeps them under `/_kit/{id}`), so a form scrolled away and back keeps what was typed.
import type { FormEvent } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { asksForSecret } from './SecretRefused';
import styles from './NumbersForms.module.css';

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'choice';
  options?: string[];
}

/** The values the submit sends: every drawn field by name; a number field sends a number, an empty one is left out. */
export function formValues(fields: readonly FormField[], values: Readonly<Record<string, string>>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of fields) {
    if (asksForSecret(f.label)) continue;
    const v = (values[f.name] ?? '').trim();
    if (!v) continue;
    out[f.name] = f.type === 'number' && Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return out;
}

export function ShortForm({
  fields,
  values,
  agentName,
  onChange,
  onSubmit,
}: {
  fields: FormField[];
  values: Record<string, string>;
  agentName: string;
  onChange(name: string, v: string): void;
  onSubmit(): void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className={styles.piece} data-testid={TID.kitShortForm} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        {fields.map((f) =>
          asksForSecret(f.label) ? (
            <p key={f.name} className={cx(styles.caption, styles.wide)} role="note" data-refused-field={f.name}>
              {t('kit.form.secret_refused')}
            </p>
          ) : (
            <label key={f.name} className={styles.field}>
              <span data-copy="ai">{f.label}</span>
              {f.type === 'choice' ? (
                <select
                  className={styles.input}
                  name={f.name}
                  value={values[f.name] ?? ''}
                  onChange={(e) => onChange(f.name, e.target.value)}
                >
                  <option value="" />
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o} data-copy="ai">
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  name={f.name}
                  type={f.type}
                  inputMode={f.type === 'number' ? 'decimal' : undefined}
                  autoComplete="off"
                  value={values[f.name] ?? ''}
                  onChange={(e) => onChange(f.name, e.target.value)}
                />
              )}
            </label>
          ),
        )}
      </div>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="md">
          {t('kit.form.submit', { agentName })}
        </Button>
      </div>
    </form>
  );
}
