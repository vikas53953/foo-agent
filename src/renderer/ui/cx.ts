// Spec: 02-3 §F29 (component styles are CSS modules on tokens); joins class names, skipping empty ones.
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
