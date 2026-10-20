// Spec: CR-0022 pick 9 ("Open" reopens a kept kit surface in foo's own renderer and a kept page always in the sealed box,
// never with `shell.openPath`), pick 15 (a kept page is served from its `.foopage` blob through `pages.serve()`),
// 04 §13.5–§13.6, 06 §0.3 (Dialog md), 08-1 §3.2 `keep:open` / `page:open` (`keptId`), AT-369, X-180. R1 T7.
import { useEffect, useState } from 'react';
import { t } from '../../shared/copy/t';
import type { KeptItem, KeptKind } from '../../shared/types';
import { invoke } from '../ipc/client';
import { KitDropped, KitSurface } from '../kit/KitSurface';
import { useFenceSurfaces } from '../kit/model';
import { PageView } from '../page/PageView';
import { useStore } from '../store/index';
import { selectAgentName } from '../store/settings';
import { Dialog } from '../ui/Dialog';

function KeptKit({ item, body }: { item: KeptItem; body: string }) {
  const agentName = useStore(selectAgentName);
  // The kept copy draws alone under its own key (`keptId`): edits stay in it, and its taps never reach the reply.
  const { surfaces, dropped } = useFenceSurfaces('', item.id, body, false);
  const host = item.cardId ? { chatId: item.chatId, cardId: item.cardId } : { chatId: item.chatId, messageId: item.messageId ?? '' };
  return (
    <>
      {surfaces.map((s, i) => (
        <KitSurface
          key={s.id}
          keptId={item.id}
          surface={s}
          host={host}
          agentName={agentName}
          blockDropped={i === surfaces.length - 1 ? dropped : 0}
        />
      ))}
      {surfaces.length === 0 && dropped > 0 && <KitDropped />}
    </>
  );
}

export function KeptView({ item, onClose }: { item: KeptItem; onClose: () => void }) {
  const [opened, setOpened] = useState<{ kind: KeptKind; body: string } | 'failed' | null>(null);
  useEffect(() => {
    if (item.kind === 'page') return;
    let live = true;
    void invoke('keep:open', { id: item.id }).then(
      (r) => live && setOpened(r.ok ? r.value : 'failed'),
      () => live && setOpened('failed'),
    );
    return () => {
      live = false;
    };
  }, [item]);
  return (
    <Dialog
      tid="dialogKeptItem"
      size="md"
      title={item.title}
      primary={t('kit.keep.show_in_folder')}
      secondary={t('dialog.common.close')}
      onPrimary={() => void invoke('keep:showInFolder', { id: item.id })}
      onClose={onClose}
    >
      {item.kind === 'page' ? (
        <PageView chatId={item.chatId} source={{ keptId: item.id }} state="kept" />
      ) : opened === 'failed' ? (
        <KitDropped />
      ) : opened ? (
        <KeptKit item={item} body={opened.body} />
      ) : null}
    </Dialog>
  );
}
