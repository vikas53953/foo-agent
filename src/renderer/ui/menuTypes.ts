// Spec: 03-shell-1 §3.4.2 menu entries (items with shortcut hints, separators, destructive items, submenus) and
// anchors; test ids come from TID by key. Kept apart from Menu.tsx so pure menu builders are testable without JSX.
import type { TID } from '../../shared/testids';

export type MenuEntry =
  | {
      kind: 'item';
      id: string;
      label: string;
      tid?: keyof typeof TID;
      shortcut?: string;
      destructive?: boolean;
      disabled?: boolean;
      onSelect?: () => void;
      submenu?: MenuEntry[];
    }
  | { kind: 'separator'; id: string };

export type MenuAnchor = { el: HTMLElement; align?: 'start' | 'end' } | { x: number; y: number };
