// Spec: 03-shell-1 §3.1.3.4: grid rows title bar, banner strip, content. M0 has no banner and empty content.
import styles from './Shell.module.css';
import { TitleBar } from './TitleBar';

export function Shell() {
  return (
    <div className={styles.shell}>
      <TitleBar />
      <div className={styles.banner} />
      <main className={styles.content} />
    </div>
  );
}
