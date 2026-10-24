// Spec: 05-2 §5.8 Secret box: §5.8.1 anatomy (reason, `Key` 20 + title + "secret", masked `--t-mono` field 36 with a 40×40
// eye, [ Save securely ] [ Cancel ], `LockClosed` footer in `--ok`; saved row "{Name} · saved {date}" [ Replace ] [ Remove ]
// → 06-3 §14 C-22), §5.8.2 copy, §5.8.3 states (asking / saved / rejected / withdrawn; Failed keeps the value in memory;
// Disabled when safe storage is unavailable, 09 §9.18 line + [ Try again ]), §5.8.4 variants (key, login, card, code box,
// CVV, voice key, web key; code box placeholder "123 456", CVV "123"; field errors), §5.8.5 rules (one IPC call carries the value; the field is cleared right after a
// successful write; copy and drag out are blocked while masked), §5.8.6 (Enter / Ctrl+Enter = Save securely; Alt+F8 toggles
// the eye; field label "{title}, hidden|shown", Narrator reads only "{n} characters" while hidden; "Saved securely." is
// announced), the eye hides again after 30 s, on every render and after a save (OCL §7.1). 04-2 §22.4 Move: the card
// arrives with the moved value in its field and the field focused. The renderer never receives a value (08-1 §1 rule 1).
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import { isVaultOff, type VaultOff } from '../../shared/ipc';
import { luhn } from '../../shared/redactor';
import { TID } from '../../shared/testids';
import type { CardRow, SecretCardKind, SecretKind, SecretPayload } from '../../shared/types';
import { announce } from '../a11y/announce';
import { invoke } from '../ipc/client';
import { useStore } from '../store/index';
import { selectAgentName } from '../store/settings';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { cx } from '../ui/cx';
import { CardButton } from './CardButton';
import { CardFrame, CardTimeLabel, type CardTime } from './CardFrame';
import { listenSecretPrefill, peekSecretPrefill } from './secretPrefill';
import { ctrlEnter, useCardAction } from './useCardAction';
import a11y from '../a11y/a11y.module.css';
import styles from './Card.module.css';
import box from './SecretBox.module.css';

/** OCL §7.1, foo decision: a shown secret hides itself after 30 s. */
export const EYE_AUTO_HIDE_MS = 30_000;

type Field = SecretPayload['fields'][number];

/** §5.8.4 fields when the card names none. */
const DEFAULT_FIELDS: Record<SecretCardKind, Field[]> = {
  ai_key: [{ key: 'value', label: '', masked: true }],
  voice_key: [{ key: 'value', label: '', masked: true }],
  web_key: [{ key: 'value', label: '', masked: true }],
  login: [
    { key: 'username', label: t('cards.secret.field.username'), masked: false },
    { key: 'password', label: t('cards.secret.field.password'), masked: true },
  ],
  card: [
    { key: 'number', label: t('cards.secret.field.card_number'), masked: true },
    { key: 'expiry', label: t('cards.secret.field.expiry'), masked: false },
    { key: 'cvv', label: t('cards.secret.field.cvv'), masked: true },
    { key: 'name', label: t('cards.secret.field.name_on_card'), masked: false },
  ],
  otp: [{ key: 'code', label: '', masked: true }],
  cvv: [{ key: 'code', label: '', masked: true }],
  user_key: [
    { key: 'name', label: t('cards.secret.field.key_name'), masked: false },
    { key: 'value', label: t('cards.secret.field.key_value'), masked: true },
  ],
};

const isCode = (k: SecretCardKind) => k === 'otp' || k === 'cvv';
const digits = (s: string) => s.replace(/\D/g, '');

/** §5.8.4 field errors (06 §0.4), or null when the fields can be saved. */
export function fieldError(kind: SecretCardKind, v: Record<string, string>): string | null {
  if (kind === 'card') {
    const n = digits(v.number ?? '');
    if (n.length < 12 || n.length > 19 || !luhn(n)) return t('cards.secret.error.card_number');
    const exp = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec((v.expiry ?? '').trim());
    if (!exp) return t('cards.secret.error.expiry');
    if (v.cvv && !/^\d{3,4}$/.test(v.cvv)) return t('cards.secret.error.code');
  }
  // CR-0057: a key the user names needs a name, 40 characters at most, with a letter or digit in it.
  if (kind === 'user_key' && !/[\p{L}\p{N}]/u.test(v.name ?? '')) return t('cards.secret.error.key_name');
  if (kind === 'user_key' && (v.name ?? '').trim().length > 40) return t('cards.secret.error.key_name_long');
  if (kind === 'otp' && !/^\d{4,8}$/.test(digits(v.code ?? ''))) return t('cards.secret.error.code');
  if (kind === 'cvv' && !/^\d{3,4}$/.test(digits(v.code ?? ''))) return t('cards.secret.error.code');
  return null;
}

/** The `secret:save` kind and vault name for this card, or null when it names none (08-0 §E.8). */
function saveTarget(p: SecretPayload, v: Record<string, string>): { kind: SecretKind; name: string } | null {
  if (p.secretKind === 'voice_key') return { kind: 'ai_key', name: 'openai-key' };
  if (p.secretKind === 'card') return { kind: 'card', name: digits(v.number ?? '').slice(-4) };
  if (p.secretKind === 'user_key') return { kind: 'user_key', name: v.name ?? '' };
  if (isCode(p.secretKind) || !p.vaultName) return null;
  return { kind: p.secretKind, name: p.vaultName };
}

export function SecretField({
  field,
  kind,
  index,
  title,
  value,
  shown,
  readOnly,
  autoFocus,
  onChange,
  onEnter,
  onToggleEye,
}: {
  field: Field;
  kind: SecretCardKind;
  index: number;
  title: string;
  value: string;
  shown: boolean;
  readOnly: boolean;
  autoFocus: boolean;
  onChange: (v: string) => void;
  onEnter: () => void;
  onToggleEye: () => void;
}) {
  const lengthId = useId();
  const ref = useRef<HTMLInputElement>(null);
  const hidden = field.masked && !shown;
  const name = field.label || title;
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  // The value is set as a property only: a React-controlled input mirrors it into the `value` attribute, which puts the secret
  // in the DOM's markup (05-2 §5.8.5 rule 2).
  useLayoutEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value]);
  const block = (e: ClipboardEvent | DragEvent) => {
    if (hidden) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'F8' && e.altKey && field.masked) {
      e.preventDefault();
      onToggleEye();
    }
  };
  const placeholder =
    field.key === 'expiry'
      ? t('cards.secret.field.expiry_placeholder')
      : field.key === 'code'
        ? kind === 'otp'
          ? t('cards.secret.otp.placeholder')
          : kind === 'cvv'
            ? t('cards.secret.cvv.placeholder')
            : undefined
        : field.key === 'name' && kind === 'user_key'
          ? t('cards.secret.field.key_name_placeholder')
          : field.label
            ? undefined
            : t('cards.secret.placeholder');
  const input = (
    <span className={box.box}>
      <input
        ref={ref}
        className={cx(box.input, field.masked && box.withEye)}
        data-testid={TID.cardSecretField}
        data-index={index}
        type={hidden ? 'password' : 'text'}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        inputMode={field.key === 'code' || field.key === 'number' || field.key === 'cvv' ? 'numeric' : undefined}
        aria-label={
          field.masked
            ? shown
              ? t('cards.secret.field_label.shown', { title: name })
              : t('cards.secret.field_label.hidden', { title: name })
            : name
        }
        aria-describedby={hidden ? lengthId : undefined}
        onChange={(e) => onChange(field.key === 'number' ? (digits(e.target.value).match(/.{1,4}/g) ?? []).join(' ') : e.target.value)}
        onKeyDown={onKeyDown}
        onCopy={block}
        onCut={block}
        onDragStart={block}
      />
      {hidden && (
        <span id={lengthId} className={a11y.visuallyHidden}>
          {t('cards.secret.field_label.length', { n: [...value].length })}
        </span>
      )}
      {field.masked && (
        <IconButton
          className={box.eye}
          icon={shown ? 'EyeOff' : 'Eye'}
          label={shown ? t('cards.secret.eye.hide') : t('cards.secret.eye.show')}
          pressed={shown}
          data-testid={TID.cardSecretEye}
          data-index={index}
          onClick={onToggleEye}
        />
      )}
    </span>
  );
  return field.label ? (
    <label className={box.label}>
      {field.label}
      {input}
    </label>
  ) : (
    input
  );
}

/** `no_kind`: a moved password or unknown key has no vault name yet (G-M5-21); Save refuses it plainly. */
type Failure = 'save_failed' | 'no_kind' | VaultOff | null;
type Action = 'save' | 'cancel' | 'remove';

export function SecretBox({ card, time }: { card: CardRow; time: CardTime }) {
  const p = card.payload as unknown as SecretPayload;
  const agentName = useStore(selectAgentName);
  const fields = p.fields?.length ? p.fields : DEFAULT_FIELDS[p.secretKind];
  const [moved, setMoved] = useState(() => peekSecretPrefill(card.id) !== null);
  const movedInto = (v: string): Record<string, string> => {
    const key = fields.find((f) => f.masked)?.key ?? fields[0]!.key;
    return { [key]: key === 'number' ? (digits(v).match(/.{1,4}/g) ?? []).join(' ') : v };
  };
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v = peekSecretPrefill(card.id);
    return v ? movedInto(v) : {};
  });
  // The eye resets to hidden on every render of the card (a new mount) and after save.
  const [shown, setShown] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  // Try again on a card posted while the vault was off (§5.8.3 Disabled) lets the next Save ask main again.
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { busy, run } = useCardAction<Action>();

  useEffect(
    () =>
      listenSecretPrefill(card.id, (v) => {
        setValues(movedInto(v));
        setMoved(true);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one listener per card; movedInto reads only the card's fields
    [card.id],
  );
  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => setShown(false), EYE_AUTO_HIDE_MS);
    return () => window.clearTimeout(id);
  }, [shown]);

  const title = p.name;
  const state = cancelled ? 'withdrawn' : card.state;
  const asking = (state === 'asking' || state === 'rejected' || replacing) && !cancelled;
  // CR-0057: a named key is ready to save once its value is typed (the name alone is not a secret).
  const filled = p.secretKind === 'user_key' ? (values.value ?? '').trim() !== '' : fields.some((f) => (values[f.key] ?? '').trim() !== '');
  const forget = () => {
    setValues({});
    setShown(false);
  };

  const save = () => {
    if (!filled || busy) return;
    const err = fieldError(p.secretKind, values);
    setError(err);
    if (err) return;
    if (isCode(p.secretKind)) {
      run('save', () =>
        invoke('code:submit', { requestId: p.requestId ?? card.id, code: digits(values.code ?? '') }).then((r) => {
          forget();
          if (!r.ok) setCancelled(true);
          return r;
        }),
      );
      return;
    }
    const target = saveTarget(p, values);
    if (!target) {
      setFailure('no_kind');
      return;
    }
    // A card's CVV is never stored (08-2 §11.2); it does not travel either. A user key's name travels as `name` only.
    const fields = Object.fromEntries(
      Object.entries(values).filter(([k]) => !(p.secretKind === 'card' && k === 'cvv') && !(p.secretKind === 'user_key' && k === 'name')),
    );
    run('save', () =>
      invoke('secret:save', { requestId: card.id, kind: target.kind, name: target.name, fields }).then((r) => {
        if (r.ok) {
          forget();
          setReplacing(false);
          setFailure(null);
          announce(t('cards.secret.saved_announce'));
        } else if (r.error.kind !== 'SECRET_EXISTS') {
          // §5.8.2 Save failed: the value stays in the field (memory only).
          setFailure(isVaultOff(r.error.message) ? r.error.message : 'save_failed');
        }
        return r;
      }),
    );
  };
  const cancel = () => {
    if (replacing) {
      forget();
      setReplacing(false);
      return;
    }
    forget();
    setCancelled(true);
    run('cancel', () => invoke('card:answer', { cardId: card.id, nonce: card.nonce, answer: { skip: true }, resolvedBy: 'tap' }));
  };
  const remove = () => {
    setConfirmRemove(false);
    if (!p.target) return;
    const target = p.target;
    run('remove', () => invoke('secret:delete', { target, confirm: true }));
  };

  const savedName = p.label ?? title;
  const brand = p.label?.split(' ••')[0] ?? '';
  const savedLine =
    p.secretKind === 'login'
      ? t('cards.secret.login.saved', { site: p.vaultName ?? title })
      : p.secretKind === 'card'
        ? t('cards.secret.card.saved', { brand, last4: p.target?.slice(-4) ?? '', agentName })
        : p.secretKind === 'voice_key'
          ? t('cards.secret.voice_key.saved')
          : p.secretKind === 'web_key'
            ? t('cards.secret.web_key.saved', { service: title.replace(/ key$/, '') })
            : p.secretKind === 'user_key'
              ? t('cards.secret.user_key.saved', { name: p.label ?? title, agentName })
              : t('cards.secret.summary.saved', { agentName });
  // CR-0030 pick 5 (05-2 §5.8.4 Code box): "Your bank sent a code to {+91 98••• ••210}." from the masked `sentTo`.
  const reason =
    p.why ||
    (p.secretKind === 'card'
      ? t('cards.secret.card.reason')
      : p.secretKind === 'voice_key'
        ? t('cards.secret.voice_key.reason')
        : p.secretKind === 'otp' && p.sentTo
          ? t('cards.secret.otp.reason', { phone: p.sentTo })
          : '');
  const rejectedLine =
    state === 'rejected' && p.secretKind === 'card'
      ? t('cards.secret.line.exists', { last4: digits(values.number ?? '').slice(-4) || (p.target?.slice(-4) ?? '') })
      : null;
  const off: VaultOff | null = failure && isVaultOff(failure) ? failure : !retried && !failure && p.vaultOff ? p.vaultOff : null;
  const failLine =
    off === 'keyring_unavailable'
      ? t('cards.secret.line.disabled')
      : off === 'encryption_unavailable'
        ? t('cards.secret.line.no_safe_storage')
        : failure === 'save_failed'
          ? t('cards.secret.line.save_failed')
          : failure === 'no_kind'
            ? t('cards.secret.line.no_kind')
            : null;
  const tryAgain = () => {
    setRetried(true);
    setFailure(null);
    if (filled) save();
  };
  const bad = !!failLine || state === 'rejected';
  const muted = state === 'withdrawn' || state === 'expired';
  const busySave = busy === 'save';

  let body;
  if (asking) {
    body = (
      <>
        <div className={box.fields}>
          {fields.map((f, i) => (
            <SecretField
              key={f.key}
              field={f}
              kind={p.secretKind}
              index={i}
              title={title}
              value={values[f.key] ?? ''}
              shown={shown}
              readOnly={busySave}
              autoFocus={i === 0 && moved}
              onChange={(v) => {
                setValues((o) => ({ ...o, [f.key]: v }));
                setError(null);
              }}
              onEnter={save}
              onToggleEye={() => setShown((s) => !s)}
            />
          ))}
        </div>
        {error && <span className={box.error}>{error}</span>}
        {rejectedLine && <span className={box.line}>{rejectedLine}</span>}
        {failLine && <span className={box.line}>{failLine}</span>}
        <div className={styles.buttons}>
          {rejectedLine ? (
            // GAP: the foo://settings/money/methods route arrives with Settings (08-0 §G.9, M11); the button is shown, not live.
            <CardButton tid="cardSecretOpenMoney" kind="primary" disabled onClick={() => undefined}>
              {t('cards.secret.button.open_money')}
            </CardButton>
          ) : off || failure === 'no_kind' ? (
            // §5.8.3 Disabled: the Primary stays and is disabled; Try again sits beside it (none for a box with no vault name).
            <>
              <CardButton tid="cardSecretSave" kind="primary" disabled onClick={() => undefined}>
                {t('cards.secret.primary')}
              </CardButton>
              {off && (
                <CardButton tid="cardSecretTryAgain" kind="secondary" busy={busySave} disabled={!!busy} onClick={tryAgain}>
                  {t('cards.secret.button.try_again')}
                </CardButton>
              )}
            </>
          ) : failLine ? (
            <CardButton tid="cardSecretTryAgain" kind="primary" busy={busySave} disabled={!!busy} onClick={save}>
              {t('cards.secret.button.try_again')}
            </CardButton>
          ) : isCode(p.secretKind) ? (
            <CardButton tid="cardSecretUseCode" kind="primary" busy={busySave} disabled={!filled || !!busy} onClick={save}>
              {t('cards.secret.button.use_code')}
            </CardButton>
          ) : (
            <CardButton tid="cardSecretSave" kind="primary" busy={busySave} disabled={!filled || !!busy} onClick={save}>
              {t('cards.secret.primary')}
            </CardButton>
          )}
          {isCode(p.secretKind) ? (
            <CardButton tid="cardSecretTypeOnPage" kind="secondary" disabled={!!busy} onClick={cancel}>
              {t('cards.secret.button.type_on_page')}
            </CardButton>
          ) : p.secretKind === 'voice_key' && !replacing ? (
            <CardButton tid="cardSecretUseThisPc" kind="secondary" disabled={!!busy} onClick={cancel}>
              {t('cards.secret.voice_key.use_this_pc')}
            </CardButton>
          ) : (
            <CardButton tid="cardSecretCancel" kind="secondary" disabled={!!busy} onClick={cancel}>
              {t('cards.secret.secondary')}
            </CardButton>
          )}
        </div>
      </>
    );
  } else if (state === 'saved' && !isCode(p.secretKind)) {
    body = (
      <>
        <span className={box.done}>
          <Icon name="Checkmark" size={16} />
          {savedLine}
        </span>
        <div className={box.saved} data-testid={TID.cardSecretSaved}>
          <span className={box.savedName}>
            <Icon name="Key" size={16} />
            <span data-copy="external">
              {t('cards.secret.saved_row', { name: savedName, date: formatDate(p.savedAt ?? card.updatedAt, 'date', time) })}
            </span>
          </span>
          {/* X-129: a saved card is removed first, never replaced. */}
          {p.secretKind !== 'card' && (
            <CardButton tid="cardSecretReplace" kind="secondary" disabled={!!busy} onClick={() => setReplacing(true)}>
              {t('cards.secret.button.replace')}
            </CardButton>
          )}
          <CardButton
            tid="cardSecretRemove"
            kind="link"
            busy={busy === 'remove'}
            disabled={!!busy || !p.target}
            onClick={() => setConfirmRemove(true)}
          >
            {t('cards.secret.button.remove')}
          </CardButton>
        </div>
      </>
    );
  } else {
    const summary =
      state === 'saved'
        ? null
        : p.removedAt
          ? t('cards.secret.summary.removed', { agentName })
          : p.secretKind === 'voice_key'
            ? t('cards.secret.voice_key.summary_this_pc')
            : t('cards.secret.summary.cancelled');
    body = summary && <span className={styles.summary}>{summary}</span>;
  }

  return (
    <CardFrame
      tid="cardSecret"
      card={card}
      state={state}
      label={t('cards.secret.label', { title })}
      edge={bad ? 'bad' : undefined}
      busy={!!busy}
      muted={muted}
      onKeyDown={asking ? ctrlEnter(save) : undefined}
    >
      {asking && reason && (
        <span className={box.reason} data-copy="external">
          {reason}
        </span>
      )}
      <div className={styles.head}>
        <span className={styles.headIcon}>
          <Icon name="Key" size={20} />
        </span>
        <span className={styles.title} data-copy="external">
          {title}
        </span>
        <span className={styles.right}>{t('cards.secret.right_label')}</span>
      </div>
      {body}
      <div className={styles.foot}>
        {asking && !isCode(p.secretKind) ? (
          <span className={box.lock}>
            <Icon name="LockClosed" size={16} />
            {t('cards.secret.footer', { agentName })}
          </span>
        ) : null}
        <span className={styles.footSpacer} />
        <CardTimeLabel {...time} />
      </div>
      {confirmRemove && (
        <Dialog
          tid="dialogC22"
          title={t('dialog.c_22.title', { name: savedName })}
          body={t('dialog.c_22.body')}
          primary={t('dialog.c_22.primary')}
          secondary={t('dialog.c_22.secondary')}
          destructive
          onPrimary={remove}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </CardFrame>
  );
}
