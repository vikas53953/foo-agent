// Spec: 06-3 §19 (the shortcuts sheet) and §14 C-1 (Clear messages), CR-0060 (X-217); CR-0061 (X-218) the About dialogs
// (privacy, What's new, Send a report, Open-source parts); 10-acceptance-2 §C.8 AT-322: the dialogs the shell mounts load
// on first open, so they stay out of the first script.
import { ShortcutsSheet } from './ShortcutsSheet';
import { C01 } from '../screens/confirms/C01';
import { AboutDialogs } from '../screens/about/AboutDialogs';

export function ShellDialogs() {
  return (
    <>
      <ShortcutsSheet />
      <C01 />
      <AboutDialogs />
    </>
  );
}
