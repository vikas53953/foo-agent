// Spec: 08-0 §G.10 (no router: `ui.view` decides), 03-shell-1 §3.1.3.4 (the shell frame), 03-shell-2 §3.9.6 (the store
// is filled from app:getBootstrap and kept current by events), 02-3 §F25.2 (one announcer), §3.9.2 / §3.9.4 (F6 and the Esc
// ladder: one root handler, ShellKeys), 02-2 §F15.9.9 (one hidden `<FaceRaster>`). The chat view (`main`) and the details panel (`right`) mount into the shell here.
import { useEffect } from 'react';
import { Announcer } from './a11y/Announcer';
import { MainShell } from './shell/MainShell';
import { RightShell } from './shell/RightShell';
import { Shell } from './shell/Shell';
import { ShellKeys } from './shell/ShellKeys';
import { loadBootstrap, startClock, wireEvents } from './store/apply';
import { selectChat } from './store/chats';
import { useStore } from './store/index';
import { selectOpenChatId } from './store/ui';
import { FaceRaster } from './ui/FaceRaster';

export function App() {
  useEffect(() => {
    const off = wireEvents();
    const stop = startClock();
    void loadBootstrap();
    return () => {
      off();
      stop();
    };
  }, []);
  const openChatId = useStore(selectOpenChatId);
  const chat = useStore(selectChat(openChatId));
  return (
    <>
      <Shell main={openChatId ? <MainShell chatId={openChatId} /> : null} right={chat ? <RightShell chat={chat} /> : null} />
      <ShellKeys />
      <Announcer />
      <FaceRaster />
    </>
  );
}
