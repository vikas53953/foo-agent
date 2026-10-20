// Spec: 06-2 §7.5 "Hand-edited file has unreadable lines" (Dialog md `dialog-unreadable-lines`, X-118, listing the lines in
// `--t-mono` with [ Open the file ] [ Close ]), 08-1 §3.2 `memory:list` MEMORY_PARSE (with bad lines), 08-3 §12.2 (bad lines
// are kept in place in the file). The title is the banner's sentence.
import { t } from '../../../shared/copy/t';
import { Dialog } from '../../ui/Dialog';
import styles from './Confirms.module.css';

export interface UnreadableFile {
  /** Relative to {DATA}: `memory/about-you.md`. */
  file: string;
  lines: string[];
}

export const fileName = (file: string) => file.split('/').pop() ?? file;

export function UnreadableLines({ bad, onOpen, onClose }: { bad: UnreadableFile; onOpen: () => void; onClose: () => void }) {
  return (
    <Dialog
      tid="dialogUnreadableLines"
      size="md"
      title={t('screen.memory.unreadable.text', { count: bad.lines.length, file: fileName(bad.file) })}
      primary={t('dialog.unreadable_lines.primary')}
      secondary={t('dialog.unreadable_lines.secondary')}
      onPrimary={onOpen}
      onClose={onClose}
    >
      <pre className={styles.lines}>{bad.lines.join('\n')}</pre>
    </Dialog>
  );
}
