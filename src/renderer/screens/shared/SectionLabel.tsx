// Spec: 06 §0.4 Section label (`--t-caption-strong`, uppercase, tracking +0.08em, `--fg-3`; 24px above, 8px below), 08-0
// §E.3 (screens/shared). A heading under the page's h1, so Narrator can jump between sections.
import styles from './SectionLabel.module.css';

export interface SectionLabelProps {
  text: string;
  id?: string;
  level?: 2 | 3;
}

export function SectionLabel({ text, id, level = 2 }: SectionLabelProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <Heading id={id} className={styles.label}>
      {text}
    </Heading>
  );
}
