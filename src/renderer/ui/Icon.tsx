// Spec: 02 F6 (icon set, sizes 16 / 20 / 24, colour `--fg-2` by default and inherited from the parent's `color`),
// 02-3 §F26 (decorative icons are hidden from Narrator; the control carries the name).
import { createElement } from 'react';
import { iconComponent, type IconName, type IconSize } from './icons/registry';
import { cx } from './cx';
import styles from './Icon.module.css';

export type { IconName, IconSize };

export interface IconProps {
  name: IconName;
  size?: IconSize;
  filled?: boolean;
  className?: string;
}

export function Icon({ name, size = 20, filled = false, className }: IconProps) {
  // The registry holds module-level components; createElement picks one without defining a component in render.
  return createElement(iconComponent(name, size, filled), {
    className: cx(styles.icon, className),
    'aria-hidden': true,
    focusable: false,
    'data-icon': name,
  } as Record<string, unknown>);
}
