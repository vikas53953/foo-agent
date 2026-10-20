// Spec: 04 §13.6 (an AI page: the status line "Building your page…" shows first until the fence closes and the reply ends;
// over 512 KB the state is failed with "This page is too big to open"; the page loads in `<iframe sandbox="allow-scripts">`
// from `foo-page://{pageId}`; height capped at 600px and the page scrolls inside; the bridge calls reportSize,
// draftMessage (fills the composer, never sends), openLink (always the C-26 dialog "This opens {domain}. Open it?", then
// `app:openExternal` with source `ai_page`), requestAction (sent as if the user typed it, so the gate sees it); states
// building, ready, failed, kept), CR-0022 AT-357..AT-362, X-180. Used by the reply's PageBlock and the `ai_page` card.
import { useEffect, useRef, useState } from 'react';
import { t } from '../../shared/copy/t';
import { PAGE_SANDBOX, PAGE_SCHEME, type PageRpcCall, type PageRpcResult } from '../../shared/kit/page';
import { TID } from '../../shared/testids';
import { newClientId, sendOutgoing } from '../composer/send';
import { invoke } from '../ipc/client';
import { clockNow } from '../store/apply';
import { useStore } from '../store/index';
import { requestComposer } from '../store/messages';
import { selectAgentName } from '../store/settings';
import { Dialog } from '../ui/Dialog';
import { asJson, callId, floodGate, frameHeight, linkDomain, rpcReply } from './bridge';
import styles from './PageView.module.css';

export type PageSource = { messageId: string; index: number } | { cardId: string };
export type PageState = 'building' | 'ready' | 'failed' | 'kept';

/** The first height before the page reports its own. */
const START_HEIGHT = 160;
/** The last height each page reported, so a row the message list mounts again keeps its size. */
const heights = new Map<string, number>();

/** What a call main passed does in foo (main already checked the page, the rate and the text). */
function act(chatId: string, call: PageRpcCall, setHeight: (h: number) => void, askLink: (url: string) => void): void {
  switch (call.method) {
    case 'reportSize':
      return setHeight(frameHeight(call.params.height));
    case 'draftMessage':
      return requestComposer(chatId, { kind: 'prefill', text: call.params.text, at: clockNow() });
    case 'openLink':
      return askLink(call.params.url);
    case 'requestAction':
      void sendOutgoing({ chatId, clientId: newClientId(), text: call.params.text, attachments: [], ready: Promise.resolve([]) });
  }
}

export function PageView({
  chatId,
  source,
  state,
  tooLarge,
}: {
  chatId: string;
  source: PageSource;
  state: PageState;
  tooLarge?: boolean;
}) {
  const agentName = useStore(selectAgentName);
  const frame = useRef<HTMLIFrameElement>(null);
  // page:open's answer, for the source it was asked for (a new source shows the status line until its own answer).
  const [answer, setAnswer] = useState<{ key: string; value: { pageId: string } | { failed: 'too_large' | 'not_found' } } | null>(null);
  const [height, setHeight] = useState(START_HEIGHT);
  const [refused, setRefused] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const key = 'cardId' in source ? `k:${source.cardId}` : `m:${source.messageId}:${source.index}`;
  const wanted = (state === 'ready' || state === 'kept') && !tooLarge;
  const opened = answer?.key === key ? answer.value : null;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void invoke('page:open', { chatId, ...source }).then(
      (r) => live && setAnswer({ key, value: r.ok ? r.value : { failed: 'not_found' } }),
      () => live && setAnswer({ key, value: { failed: 'not_found' } }),
    );
    return () => {
      live = false;
    };
    // `source` is a fresh object each render; `key` names it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, key, wanted]);

  const pageId = opened && 'pageId' in opened ? opened.pageId : null;

  useEffect(() => {
    if (!pageId) return;
    const allow = floodGate();
    const onMessage = (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      // Only this frame's own messages; anything else on the window is not the page's to send.
      if (!win || e.source !== win) return;
      const data = asJson(e.data);
      const id = callId(data);
      const answer = (r: PageRpcResult) => {
        setRefused(!r.ok);
        if (id !== null) win.postMessage(rpcReply(id, r), '*');
      };
      // A flood never reaches main (main's own limit is 10 a second); the page still gets its answer.
      if (!allow(performance.now())) return answer({ ok: false, refused: 'rate' });
      // Main checks and logs every call: its zod schema refuses a bad one (IPC_REJECTED, logged), then the rate and the text.
      void invoke('page:rpc', { chatId, pageId, call: data as PageRpcCall }).then(
        (r) => {
          const result: PageRpcResult = r.ok ? r.value : { ok: false, refused: 'schema' };
          if (result.ok)
            act(
              chatId,
              data as PageRpcCall,
              (h) => {
                heights.set(pageId, h);
                setHeight(h);
              },
              setLink,
            );
          answer(result);
        },
        () => answer({ ok: false, refused: 'declined' }),
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [chatId, pageId]);

  const failed = state === 'failed' || tooLarge || (opened !== null && 'failed' in opened);
  const shown: PageState = failed ? 'failed' : state;
  const status = failed
    ? tooLarge || (opened && 'failed' in opened && opened.failed === 'too_large')
      ? t('page.state.too_large')
      : t('page.state.failed')
    : !pageId
      ? t('page.state.building')
      : null;

  return (
    <div className={styles.page} data-testid={TID.aiPage} data-state={shown} data-page-id={pageId ?? undefined}>
      {status !== null && (
        <p className={failed ? styles.failed : styles.status} data-testid={TID.aiPageStatus} role="status">
          {status}
        </p>
      )}
      {pageId && !failed && (
        <iframe
          ref={frame}
          className={styles.frame}
          data-testid={TID.aiPageFrame}
          title={t('page.frame.accessible_name', { agentName })}
          sandbox={PAGE_SANDBOX}
          src={`${PAGE_SCHEME}://${pageId}/`}
          style={{ height: heights.get(pageId) ?? height }}
        />
      )}
      {refused && (
        <p className={styles.refused} role="status">
          {t('page.bridge.refused')}
        </p>
      )}
      {link && (
        <Dialog
          tid="aiPageOpenLink"
          title={t('page.open_link.title', { domain: linkDomain(link) })}
          primary={t('page.open_link.open')}
          secondary={t('page.open_link.cancel')}
          onClose={() => setLink(null)}
          onPrimary={() => {
            const url = link;
            setLink(null);
            void invoke('app:openExternal', { target: 'ai_page', url });
          }}
        />
      )}
    </div>
  );
}
