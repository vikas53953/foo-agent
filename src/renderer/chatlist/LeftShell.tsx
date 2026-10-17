// Spec: 03-shell-1 §3.4 (left shell: `<nav aria-label="Chats">`, test id `sidebar`). Filled in by the chat list work.
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';

export function LeftShell() {
  return <nav data-testid={TID.sidebar} aria-label={t('sidebar.landmark.label')} />;
}
