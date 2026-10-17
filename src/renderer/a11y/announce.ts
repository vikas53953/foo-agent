// Spec: 02-3 §F25.2 (`announce(text, 'polite' | 'assertive')`: one visually hidden live region per politeness in the app
// root, `app-announcer`; the same text twice in a row is still read), 03-shell-1 §3.4.3 (search count, debounced).
type Politeness = 'polite' | 'assertive';
type Listener = (text: string, politeness: Politeness) => void;

const listeners = new Set<Listener>();

export function announce(text: string, politeness: Politeness = 'polite'): void {
  listeners.forEach((l) => l(text, politeness));
}

export function onAnnounce(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
