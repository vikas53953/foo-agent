// Spec: 03-shell-1 §3.4.2 "Menu style (all shell menus)": `--bg-raised`, `--r-md`, 1px `--line`, `--shadow-16`, padding
// `--s0`; items min-height 40, padding 0 `--s2`, `--r-sm`, `--t-body`, shortcut hint right in `--t-caption` `--fg-3`;
// separators; destructive items `--bad`; opens with `--m-normal` `--ease-in` (fade + 4px drop), instant under reduced
// motion. Keys: ↑/↓ move, Home/End, Enter/Space choose, → opens a submenu, ←/Esc closes, Tab closes. `role="menu"` /
// `menuitem`. Test ids come from TID by key (lint foo/testid-from-registry). P1 T3 (CR-0021 pick 5, AT-303): menus scale
// in from the button that opened them (transform-origin at the anchor).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { TID } from '../../shared/testids';
import { cx } from './cx';
import { Icon } from './Icon';
import type { MenuAnchor, MenuEntry } from './menuTypes';
import styles from './Menu.module.css';

export type { MenuAnchor, MenuEntry } from './menuTypes';

export interface MenuProps {
  entries: MenuEntry[];
  anchor: MenuAnchor;
  /** Called with `true` when the menu closes because an item was chosen. */
  onClose: (chose: boolean) => void;
  label?: string;
  tid?: keyof typeof TID;
  /** Submenus: focus the first item on open (true) or not. */
  autoFocus?: boolean;
  level?: number;
}

function place(anchor: MenuAnchor, menu: DOMRect): { x: number; y: number } {
  const gap = 4;
  let x: number;
  let y: number;
  if ('el' in anchor) {
    const r = anchor.el.getBoundingClientRect();
    x = anchor.align === 'end' ? r.right - menu.width : r.left;
    y = r.bottom + gap;
    if (y + menu.height > window.innerHeight - gap) y = Math.max(gap, r.top - gap - menu.height);
  } else {
    x = anchor.x;
    y = anchor.y;
    if (y + menu.height > window.innerHeight - gap) y = Math.max(gap, y - menu.height);
  }
  x = Math.min(Math.max(gap, x), window.innerWidth - menu.width - gap);
  return { x, y };
}

/** The point inside a placed menu or popover (at `x`, `y`, size `box`) nearest the anchor's centre, as a CSS origin. */
export function originFrom(anchor: DOMRect | { x: number; y: number }, x: number, y: number, box: DOMRect): string {
  const cx = 'width' in anchor ? anchor.left + anchor.width / 2 : anchor.x;
  const cy = 'height' in anchor ? anchor.top + anchor.height / 2 : anchor.y;
  const ox = Math.min(Math.max(0, cx - x), box.width);
  const oy = Math.min(Math.max(0, cy - y), box.height);
  return `${Math.round(ox)}px ${Math.round(oy)}px`;
}

export function Menu({ entries, anchor, onClose, label, tid, autoFocus = true, level = 0 }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Placed once, where it opened (a re-render of the opener must not move it or steal focus).
  const opened = useRef({ anchor, autoFocus });
  const [sub, setSub] = useState<{ id: string; el: HTMLElement } | null>(null);
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]') ?? []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const { x, y } = place(opened.current.anchor, box);
    const a = opened.current.anchor;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transformOrigin = originFrom('el' in a ? a.el.getBoundingClientRect() : a, x, y, box);
    el.style.visibility = 'visible';
    if (opened.current.autoFocus) el.querySelector<HTMLButtonElement>(':scope > [role="menuitem"]')?.focus();
  }, []);

  useEffect(() => {
    if (level > 0) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !document.querySelector('[data-menu-root]')?.contains(t) &&
        !Array.from(document.querySelectorAll('[data-menu]')).some((m) => m.contains(t))
      )
        onClose(false);
    };
    const onBlur = () => onClose(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [level, onClose]);

  const choose = (e: Extract<MenuEntry, { kind: 'item' }>, el: HTMLElement) => {
    if (e.disabled) return;
    if (e.submenu) {
      setSub({ id: e.id, el });
      return;
    }
    onClose(true);
    e.onSelect?.();
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (n: number) => list[(n + list.length) % list.length]?.focus();
    switch (ev.key) {
      case 'ArrowDown':
        move(i + 1);
        break;
      case 'ArrowUp':
        move(i < 0 ? list.length - 1 : i - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(list.length - 1);
        break;
      case 'ArrowRight': {
        const entry = entries.find((x) => x.kind === 'item' && x.id === list[i]?.dataset.entry);
        if (entry?.kind === 'item' && entry.submenu && list[i]) setSub({ id: entry.id, el: list[i] });
        else return;
        break;
      }
      case 'ArrowLeft':
      case 'Escape':
        onClose(false);
        break;
      case 'Tab':
        onClose(false);
        return;
      default:
        return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  };

  const subEntry = sub ? entries.find((x) => x.kind === 'item' && x.id === sub.id) : undefined;
  const node = (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={{ visibility: 'hidden', left: 0, top: 0 }}
      onKeyDown={onKeyDown}
      data-menu=""
      data-menu-root={level === 0 ? '' : undefined}
      {...(tid ? { 'data-testid': TID[tid] } : {})}
    >
      {entries.map((e) =>
        e.kind === 'separator' ? (
          <div key={e.id} role="separator" className={styles.separator} />
        ) : (
          <button
            key={e.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={cx(styles.item, e.destructive && styles.destructive)}
            aria-disabled={e.disabled || undefined}
            aria-haspopup={e.submenu ? 'menu' : undefined}
            aria-expanded={e.submenu ? sub?.id === e.id : undefined}
            data-entry={e.id}
            {...(e.tid ? { 'data-testid': TID[e.tid] } : {})}
            onClick={(ev) => choose(e, ev.currentTarget)}
            onPointerEnter={(ev) => {
              ev.currentTarget.focus();
              if (e.submenu) setSub({ id: e.id, el: ev.currentTarget });
              else if (sub) setSub(null);
            }}
          >
            <span className={styles.label}>{e.label}</span>
            {e.shortcut && <span className={styles.shortcut}>{e.shortcut}</span>}
            {e.submenu && <Icon name="ChevronRight" size={16} className={styles.chevron} />}
          </button>
        ),
      )}
      {sub && subEntry?.kind === 'item' && subEntry.submenu && (
        <Menu
          entries={subEntry.submenu}
          anchor={{ x: sub.el.getBoundingClientRect().right, y: sub.el.getBoundingClientRect().top }}
          level={level + 1}
          onClose={(chose) => {
            const opener = sub.el;
            setSub(null);
            if (chose) onClose(true);
            else opener.focus();
          }}
        />
      )}
    </div>
  );
  return level === 0 ? createPortal(node, document.body) : node;
}
