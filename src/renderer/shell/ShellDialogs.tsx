// Spec: 06-3 §19 (the shortcuts sheet) and §14 C-1 (Clear messages), CR-0060 (X-217); 10-acceptance-2 §C.8 AT-322: the two
// dialogs the shell mounts load with the settings page script, so they stay out of the first script.
import { ShortcutsSheet } from './ShortcutsSheet';
import { C01 } from '../screens/confirms/C01';

export function ShellDialogs() {
  return (
    <>
      <ShortcutsSheet />
      <C01 />
    </>
  );
}
