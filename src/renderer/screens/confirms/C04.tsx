// Spec: 06-3 §14 C-4 ("Forget everything I know about you?" / "This deletes everything I know about you, including helpers'
// notes. Your chats stay." / field "Type FORGET to confirm" / [ Forget everything ] [ Cancel ]; typed confirm: a 40px
// `--t-mono` Text field, the destructive button stays disabled until the field equals the word exactly (case-sensitive,
// trimmed), Enter does nothing until then; `dialog-c-04`, field `dialog-confirm-field`), 06 §0.3 (Enter never triggers a
// Destructive button unless it has focus), CR-0010 G-M6-07.
import { useId, useState } from 'react';
import { t } from '../../../shared/copy/t';
import { TID } from '../../../shared/testids';
import { Dialog } from '../../ui/Dialog';
import styles from './Confirms.module.css';

export const FORGET_WORD = 'FORGET';
export const typedMatches = (value: string) => value.trim() === FORGET_WORD;

export function C04({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const [value, setValue] = useState('');
  const fieldId = useId();
  const ready = typedMatches(value);
  return (
    <Dialog
      tid="dialogC04"
      destructive
      title={t('dialog.c_04.title')}
      body={t('dialog.c_04.body')}
      primary={t('dialog.c_04.primary')}
      secondary={t('dialog.c_04.secondary')}
      primaryDisabled={!ready}
      onPrimary={() => ready && onConfirm()}
      onClose={onClose}
    >
      <label className={styles.fieldLabel} htmlFor={fieldId}>
        {t('dialog.c_04.field_label')}
      </label>
      <input
        id={fieldId}
        className={styles.field}
        data-testid={TID.dialogConfirmField}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
      />
    </Dialog>
  );
}
