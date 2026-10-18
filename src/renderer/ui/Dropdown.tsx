// Spec: 08-0 §E.3 (Dropdown is a primitive), 06 §0.4 Text field look for the closed control (`sm` 36 `--field-h`,
// padding 0 12px, `--r-sm`, `--bg-sunken`, 1px `--line-input`, `--t-body`; hover border `--fg-3`; ring on keyboard focus;
// disabled `--fg-disabled`), `ChevronDown` 16, 03-shell-1 §3.4.2 (the list is the shared Menu, opening under the control;
// ↑/↓ inside, Enter chooses, Esc closes), 02-3 §F27.1 (cursor `default`). Focus returns to the control when the menu closes.
import { useState } from 'react';
import { TID } from '../../shared/testids';
import { cx } from './cx';
import { Icon } from './Icon';
import { Menu, type MenuEntry } from './Menu';
import styles from './Dropdown.module.css';

export interface DropdownOption<V extends string> {
  value: V;
  label: string;
}

export interface DropdownProps<V extends string> {
  /** The row label; the accessible name reads label, then value (06 §0.8). */
  label: string;
  value: V;
  options: DropdownOption<V>[];
  onChange: (v: V) => void;
  disabled?: boolean;
  tid?: keyof typeof TID;
  className?: string;
}

/** One Menu item per option; choosing one calls `onChange` with its value. */
export function dropdownEntries<V extends string>(options: DropdownOption<V>[], onChange: (v: V) => void): MenuEntry[] {
  return options.map((o) => ({ kind: 'item', id: o.value, label: o.label, onSelect: () => onChange(o.value) }));
}

export function Dropdown<V extends string>({ label, value, options, onChange, disabled, tid, className }: DropdownProps<V>) {
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        type="button"
        className={cx(styles.dropdown, className)}
        aria-label={current ? `${label}, ${current.label}` : label}
        aria-haspopup="menu"
        aria-expanded={opener !== null}
        aria-disabled={disabled || undefined}
        data-state={value}
        {...(tid ? { 'data-testid': TID[tid] } : {})}
        onClick={(e) => !disabled && setOpener(opener ? null : e.currentTarget)}
      >
        <span className={styles.value}>{current?.label ?? value}</span>
        <Icon name="ChevronDown" size={16} className={styles.chevron} />
      </button>
      {opener && (
        <Menu
          entries={dropdownEntries(options, onChange)}
          anchor={{ el: opener }}
          label={label}
          onClose={() => {
            setOpener(null);
            opener.focus();
          }}
        />
      )}
    </>
  );
}
