// Spec: 06-2 §7 Memory "What I know about you": §7.1 entry (params `factId` + `mode=edit` open that fact in edit mode,
// `helperId` filters to a helper's notes), §7.2 layout (header with search 240, "+ Add something", ⋯; chips; learned strip;
// groups; helpers' notes), §7.3 elements, §7.4 actions and their results, §7.5 states, §7.6 keyboard and Narrator, §7.7 test
// ids; 06 §0.1 Page (content column `--column-max`), §0.5 common states, §0.8 Narrator; 06-3 §14 C-3 / C-4; 02-3 §F21.3 undo
// bar; CR-0010 G-M6-08 (no store slice: the page keeps its own state and reloads on `memory:changed`); CR-0021 (X-179)
// §F7.1 "a new memory fact glows once; Forget folds the row and Undo brings it back", pick 6 (empty-state poses).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { TID } from '../../shared/testids';
import { motion } from '../../shared/tokens';
import type { MemoryFactView, MemoryKind, View } from '../../shared/types';
import { announce } from '../a11y/announce';
import { reducedMotionNow } from '../a11y/useReducedMotion';
import { useRovingTabIndex } from '../a11y/useRovingTabIndex';
import { CardFrame } from '../cards/CardFrame';
import { useFooEvent } from '../ipc/client';
import { back, closeDialog, navigate, openDialog, setMenu, useStore } from '../store/index';
import { selectHelpers } from '../store/helpers';
import { selectNow } from '../store/live';
import { selectSettings, selectTimeZone } from '../store/settings';
import { Avatar } from '../ui/Avatar';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { Menu, type MenuEntry } from '../ui/Menu';
import { Skeleton } from '../ui/Skeleton';
import { TextArea } from '../ui/TextArea';
import { UndoBar } from '../ui/UndoBar';
import { C03 } from './confirms/C03';
import { C04 } from './confirms/C04';
import { fileName, UnreadableLines, type UnreadableFile } from './confirms/UnreadableLines';
import { learnedInChat, memoryActions } from './memoryActions';
import {
  APP_NAME,
  exportErrorLine,
  forgetSource,
  groupFacts,
  helperIdOf,
  highlight,
  learnedCount,
  matches,
  pageState,
  rowName,
  sourceLine,
  undoText,
  visibleChips,
  type ForgetSourceItem,
  type MemoryChipId,
  type PageFilter,
} from './memoryView';
import { PageHeader } from './shared/PageHeader';
import { PageSearchField } from './shared/PageSearchField';
import { RowGroup } from './shared/RowGroup';
import { SectionLabel } from './shared/SectionLabel';
import styles from './Memory.module.css';

const PAGE_MENU = 'memory-page-menu';
const rowMenuId = (id: string) => `memory-row-menu:${id}`;
function sectionLabel(kind: MemoryKind): string {
  if (kind === 'person') return t('screen.memory.section.people');
  if (kind === 'preference') return t('screen.memory.section.preferences');
  if (kind === 'place') return t('screen.memory.section.places');
  return t('screen.memory.section.facts');
}
function chipLabel(chip: MemoryChipId): string {
  if (chip === 'said') return t('screen.memory.filter.said');
  if (chip === 'guessed') return t('screen.memory.filter.guessed');
  if (chip === 'gmail') return t('screen.memory.filter.gmail');
  if (chip === 'whatsapp') return t('screen.memory.filter.whatsapp');
  if (chip === 'chat') return t('screen.memory.filter.chat');
  return t('screen.memory.filter.all');
}
function moveLabel(kind: MemoryKind): string {
  if (kind === 'person') return t('screen.memory.row.move.person');
  if (kind === 'preference') return t('screen.memory.row.move.preference');
  if (kind === 'place') return t('screen.memory.row.move.place');
  return t('screen.memory.row.move.fact');
}
function forgetLabel(item: ForgetSourceItem): string {
  if (item === 'gmail') return t('screen.memory.menu.forget_gmail');
  if (item === 'whatsapp') return t('screen.memory.menu.forget_whatsapp');
  return t('screen.memory.menu.forget_chats');
}

interface Undo {
  fact: MemoryFactView;
  token: string;
}
interface Status {
  text: string;
  path?: string;
}

/** Shared by the rows: what they read and the actions they call. */
interface RowCtx {
  now: number;
  timeZone: string;
  q: string;
  editingId: string | null;
  menuId: string | null;
  startEdit: (f: MemoryFactView) => void;
  saveEdit: (f: MemoryFactView, text: string) => void;
  cancelEdit: () => void;
  forget: (f: MemoryFactView) => void;
  openRowMenu: (f: MemoryFactView, el: HTMLElement) => void;
  /** CR-0021 §F7.1: a new fact glows once ('fresh'); an undone Forget unfolds back ('back'). */
  appear: Record<string, Appear>;
  /** Rows folding closed after Forget (`data-exit`, `--m-normal`). */
  folding: Set<string>;
  appeared: (id: string) => void;
}
type Appear = 'fresh' | 'back';

function Marked({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlight(text, q).map((s, i) =>
        s.hit ? (
          <mark key={i} className={styles.mark}>
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

function EditField({
  initial,
  onSave,
  onCancel,
  placeholder,
  saveLabel,
  cancelLabel,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  placeholder?: string;
  saveLabel: string;
  cancelLabel: string;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const save = () => text.trim() && onSave(text);
  return (
    <div className={styles.editor}>
      <TextArea
        ref={ref}
        value={text}
        maxLines={4}
        maxLength={120}
        placeholder={placeholder}
        aria-label={placeholder ?? initial}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className={styles.editorButtons}>
        <Button variant="primary" size="md" disabled={!text.trim()} onClick={save}>
          {saveLabel}
        </Button>
        <Button variant="secondary" size="md" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}

function FactRow({ f, ctx, rowProps }: { f: MemoryFactView; ctx: RowCtx; rowProps: Record<string, unknown> }) {
  const source = sourceLine(f, ctx.now, ctx.timeZone);
  const editing = ctx.editingId === f.id;
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.currentTarget.focus();
      }
      return;
    }
    const buttons = () => Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-row-action]'));
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      buttons()[0]?.focus();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      ctx.forget(f);
    } else if (e.key === 'F2') {
      e.preventDefault();
      ctx.startEdit(f);
    }
  };
  if (editing)
    return (
      <li className={styles.row} data-testid={TID.memoryRow} data-row-id={f.id} data-editing="">
        <EditField
          initial={f.text}
          saveLabel={t('screen.memory.row.save')}
          cancelLabel={t('screen.memory.row.cancel')}
          onSave={(text) => ctx.saveEdit(f, text)}
          onCancel={ctx.cancelEdit}
        />
      </li>
    );
  return (
    <li
      {...rowProps}
      className={styles.row}
      data-testid={TID.memoryRow}
      data-row-id={f.id}
      data-private={f.private || undefined}
      data-appear={ctx.appear[f.id]}
      data-exit={ctx.folding.has(f.id) ? '' : undefined}
      aria-label={rowName(f, ctx.now, ctx.timeZone)}
      onKeyDown={onKeyDown}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && ctx.appear[f.id]) ctx.appeared(f.id);
      }}
    >
      <div className={styles.rowText}>
        <span className={styles.fact}>
          {f.private && <Icon name="LockClosed" size={16} className={styles.lock} />}
          <Marked text={f.text} q={ctx.q} />
        </span>
        <span className={styles.source} data-source="">
          {source}
        </span>
        {f.scope === 'chat' && f.onlyInChatTitle && (
          <span className={styles.source}>{t('screen.memory.row.only_in_chat', { chat: f.onlyInChatTitle })}</span>
        )}
      </div>
      <div className={styles.rowActions}>
        <button
          type="button"
          tabIndex={-1}
          data-row-action=""
          className={styles.link}
          data-testid={TID.memoryRowEdit}
          onClick={() => ctx.startEdit(f)}
        >
          {t('screen.memory.row.edit')}
        </button>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          tabIndex={-1}
          data-row-action=""
          className={styles.link}
          data-testid={TID.memoryRowForget}
          onClick={() => ctx.forget(f)}
        >
          {t('screen.memory.row.forget')}
        </button>
        <IconButton
          icon="MoreHorizontal"
          tabIndex={-1}
          data-row-action=""
          label={t('screen.memory.row.menu_label')}
          aria-haspopup="menu"
          aria-expanded={ctx.menuId === rowMenuId(f.id)}
          data-testid={TID.memoryRowMenu}
          onClick={(e) => ctx.openRowMenu(f, e.currentTarget)}
        />
      </div>
    </li>
  );
}

function FactList({ facts, ctx, labelledBy }: { facts: MemoryFactView[]; ctx: RowCtx; labelledBy?: string }) {
  const roving = useRovingTabIndex(facts.length);
  return (
    <RowGroup aria-labelledby={labelledBy} onKeyDown={roving.onKeyDown}>
      {facts.map((f, i) => (
        <FactRow key={f.id} f={f} ctx={ctx} rowProps={roving.itemProps(i)} />
      ))}
    </RowGroup>
  );
}

function HelperNotes({ helpers, ctx }: { helpers: ReturnType<typeof groupFacts>['helpers']; ctx: RowCtx }) {
  const all = useStore(selectHelpers);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <section aria-labelledby="memory-section-helpers">
      <SectionLabel id="memory-section-helpers">{t('screen.memory.section.helpers')}</SectionLabel>
      <div className={styles.helpers}>
        {helpers.map((h) => {
          const row = all[h.helperId];
          const expanded = open.has(h.helperId);
          return (
            <div key={h.helperId} className={styles.helperBlock}>
              <button
                type="button"
                className={styles.helper}
                data-testid={TID.memoryHelper}
                data-row-id={h.helperId}
                aria-expanded={expanded}
                onClick={() => toggle(h.helperId)}
              >
                <Avatar
                  face={row?.faceRef ?? `letter:${h.name}`}
                  name={h.name}
                  kind="helper"
                  color={row?.colorToken ?? null}
                  size="inline"
                />
                <span className={styles.helperText}>{t('screen.memory.helper.row', { helper: h.name, count: h.facts.length })}</span>
                <Icon name={expanded ? 'ChevronDown' : 'ChevronRight'} size={16} />
              </button>
              {expanded && <FactList facts={h.facts} ctx={ctx} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function MemoryPage({ view }: { view: Extract<View, { kind: 'screen' }> }) {
  const now = useStore(selectNow);
  const timeZone = useStore(selectTimeZone);
  const helpers = useStore(selectHelpers);
  const rememberOn = useStore((s) => selectSettings(s)?.privacy.rememberOn ?? true);
  const dialog = useStore((s) => s.ui.dialog);
  const menuId = useStore((s) => s.ui.menu);
  const params = view.params ?? {};

  const [facts, setFacts] = useState<MemoryFactView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [filter, setFilter] = useState<PageFilter>({ chip: 'all', last7: false, q: '' });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(params.mode === 'edit' ? (params.factId ?? null) : null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [appear, setAppear] = useState<Record<string, Appear>>({});
  const [folding, setFolding] = useState<Set<string>>(new Set());
  // A fact that was not in the last list glows once (not on the first list; an undone Forget unfolds instead).
  const [prevFacts, setPrevFacts] = useState(facts);
  if (facts !== prevFacts) {
    setPrevFacts(facts);
    if (prevFacts && facts && !reducedMotionNow()) {
      const before = new Set(prevFacts.map((f) => f.id));
      const fresh = facts.filter((f) => !before.has(f.id) && !appear[f.id]).map((f) => f.id);
      if (fresh.length) setAppear((a) => ({ ...a, ...Object.fromEntries(fresh.map((id) => [id, 'fresh' as const])) }));
    }
  }
  const [undo, setUndo] = useState<Undo | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [forgotAll, setForgotAll] = useState(false);
  const [source, setSource] = useState<ForgetSourceItem | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuFact, setRowMenuFact] = useState<MemoryFactView | null>(null);
  // MEMORY_PARSE bad lines (08-1 §3.2): read from the index once T3's watcher reports them (implementation-notes).
  const [unreadable] = useState<UnreadableFile[]>([]);
  const [showBad, setShowBad] = useState<UnreadableFile | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    memoryActions
      .list()
      .then((r) => {
        setFailed(!r.ok);
        if (r.ok) setFacts(r.value);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    const timer = window.setTimeout(() => setSlow(true), motion['delay-loading']);
    return () => window.clearTimeout(timer);
  }, [load]);
  const say = (s: Status) => {
    setStatus(s);
    announce(s.text);
  };

  useFooEvent('memory:changed', load);
  useFooEvent('data:exportProgress', (p) => {
    if (p.path) say({ text: t('screen.memory.export.saved', { path: shownPath(p.path) }), path: p.path });
    const failed = exportErrorLine(p.error);
    if (failed) say({ text: failed });
  });

  // Ctrl+F focuses the page search (06-2 §7.6).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scoped = useMemo(
    () => (facts ?? []).filter((f) => !gone.has(f.id) && (!params.helperId || helperIdOf(f) === params.helperId)),
    [facts, gone, params.helperId],
  );
  const shown = useMemo(() => scoped.filter((f) => matches(f, filter, now)), [scoped, filter, now]);
  const grouped = useMemo(() => groupFacts(shown, (id) => helpers[id]?.name), [shown, helpers]);
  const chips = visibleChips(scoped);
  const learned = learnedCount(scoped, now);
  const state = pageState({ facts: scoped, shown, forgotAll });

  // Opened from a fact's "Edit": bring that row into view once it is drawn.
  useEffect(() => {
    if (!editingId || !facts) return;
    document.querySelector(`[data-testid="${TID.memoryRow}"][data-row-id="${CSS.escape(editingId)}"]`)?.scrollIntoView({ block: 'center' });
  }, [editingId, facts]);

  const finalizeUndo = () => setUndo(null);
  const ctx: RowCtx = {
    now,
    timeZone,
    q: filter.q,
    editingId,
    menuId,
    startEdit: (f) => setEditingId(f.id),
    cancelEdit: () => setEditingId(null),
    saveEdit: (f, text) => {
      setEditingId(null);
      setFacts((list) => list?.map((x) => (x.id === f.id ? { ...x, text: text.trim(), provenance: 'said', learnedAt: now } : x)) ?? list);
      void memoryActions.edit(f.id, text).then((r) => {
        if (r.ok) {
          setFacts((list) => list?.map((x) => (x.id === f.id ? r.value : x)) ?? list);
          say({ text: t('screen.memory.status.updated') });
        } else load();
      });
    },
    appear,
    folding,
    appeared: (id) =>
      setAppear((a) => {
        const next = { ...a };
        delete next[id];
        return next;
      }),
    forget: (f) => {
      // §F7.1: the row folds closed (`--m-normal`, exits are faster than entrances), then leaves the list.
      const exitMs = reducedMotionNow() ? 0 : motion.normal;
      setFolding((s) => new Set(s).add(f.id));
      window.setTimeout(() => {
        setGone((s) => new Set(s).add(f.id));
        setFolding((s) => {
          const n = new Set(s);
          n.delete(f.id);
          return n;
        });
      }, exitMs);
      void memoryActions.forget(f.id).then((r) => {
        if (r.ok) setUndo({ fact: f, token: r.value.undoToken });
        else
          setGone((s) => {
            const n = new Set(s);
            n.delete(f.id);
            return n;
          });
      });
    },
    openRowMenu: (f, el) => {
      setAnchor(el);
      setRowMenuFact(f);
      setMenu(rowMenuId(f.id));
    },
  };

  const undoForget = () => {
    if (!undo) return;
    const { fact, token } = undo;
    setUndo(null);
    void memoryActions.undo(token).then((r) => {
      if (r.ok) {
        if (!reducedMotionNow()) setAppear((a) => ({ ...a, [r.value.id]: 'back' }));
        setFacts((list) => (list ? [...list.filter((x) => x.id !== r.value.id), r.value] : list));
        setGone((s) => {
          const n = new Set(s);
          n.delete(fact.id);
          return n;
        });
        window.setTimeout(
          () => document.querySelector<HTMLElement>(`[data-testid="${TID.memoryRow}"][data-row-id="${CSS.escape(r.value.id)}"]`)?.focus(),
          0,
        );
      } else if (r.error.kind === 'TOO_LATE') say({ text: t('errors.too_late.line') });
    });
  };

  const closeMenu = (chose: boolean) => {
    setMenu(null);
    if (!chose) anchor?.focus();
    setAnchor(null);
    setRowMenuFact(null);
  };

  const pageMenu: MenuEntry[] = [
    {
      kind: 'item',
      id: 'export',
      label: t('screen.memory.menu.export'),
      onSelect: () => void memoryActions.exportTo(),
    },
    { kind: 'item', id: 'open-folder', label: t('screen.memory.menu.open_folder'), onSelect: () => void memoryActions.openFolder() },
    { kind: 'separator', id: 's1' },
    ...(['gmail', 'whatsapp', 'chat'] as const).map((item): MenuEntry => ({
      kind: 'item',
      id: `forget-${item}`,
      label: forgetLabel(item),
      // C-3 names a count; with nothing learned from that app there is nothing to forget.
      disabled: forgetSource(item, scoped).count === 0,
      onSelect: () => {
        setSource(item);
        openDialog('c-03');
      },
    })),
    { kind: 'separator', id: 's2' },
    { kind: 'item', id: 'forget-all', label: t('screen.memory.menu.forget_all'), destructive: true, onSelect: () => openDialog('c-04') },
  ];

  const rowMenu = (f: MemoryFactView): MenuEntry[] => {
    const chatId = learnedInChat(f);
    return [
      {
        kind: 'item',
        id: 'private',
        label: f.private ? t('screen.memory.row.not_private') : t('screen.memory.row.mark_private'),
        onSelect: () => {
          const on = !f.private;
          setFacts((list) => list?.map((x) => (x.id === f.id ? { ...x, private: on } : x)) ?? list);
          void memoryActions.setPrivate(f.id, on).then((r) => {
            if (!r.ok) load();
            else if (on) say({ text: t('screen.memory.status.private') });
          });
        },
      },
      {
        kind: 'item',
        id: 'where',
        label: t('screen.memory.row.where'),
        disabled: !chatId,
        onSelect: () => chatId && navigate({ kind: 'chat', chatId }),
      },
      {
        kind: 'item',
        id: 'move',
        label: t('screen.memory.row.move'),
        submenu: (['person', 'preference', 'place', 'fact'] as MemoryKind[]).map((kind): MenuEntry => ({
          kind: 'item',
          id: `move-${kind}`,
          label: moveLabel(kind),
          disabled: f.kind === kind,
          onSelect: () => {
            setFacts((list) => list?.map((x) => (x.id === f.id ? { ...x, kind } : x)) ?? list);
            void memoryActions.setKind(f.id, kind).then((r) => !r.ok && load());
          },
        })),
      },
    ];
  };

  const sourceCount = source ? forgetSource(source, scoped) : null;
  const clearFilters = () => setFilter({ chip: 'all', last7: false, q: '' });

  let body: ReactNode;
  if (failed && !facts)
    body = (
      <div data-testid={TID.screenError}>
        <CardFrame tid="cardError" label={t('screen.memory.error.text')} state="shown">
          <p className={styles.errorText}>{t('screen.memory.error.text')}</p>
          <Button variant="secondary" size="md" onClick={load}>
            {t('screen.memory.error.action')}
          </Button>
        </CardFrame>
      </div>
    );
  else if (!facts)
    body = slow ? (
      <div data-testid={TID.screenLoading} className={styles.loading} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.loadingRow}>
            <Skeleton shape="bar" width="70%" />
            <Skeleton shape="bar" width="30%" />
          </div>
        ))}
      </div>
    ) : null;
  else if (state === 'first_time' || state === 'empty')
    body = (
      <EmptyState
        state={state}
        icon="Brain"
        // CR-0021 pick 6: a forgotten list shows the Noticed pose; first time keeps E-10's slot (the L-1 drawing, §F16.1).
        {...(state === 'empty' ? { pose: 'noticed' as const } : {})}
        title={state === 'first_time' ? t('screen.memory.empty.title') : t('screen.memory.forgotten.title')}
        body={state === 'first_time' ? t('screen.memory.empty.body') : t('screen.memory.forgotten.body')}
        {...(state === 'first_time' && !adding ? { action: { label: t('screen.memory.add.button'), onClick: () => setAdding(true) } } : {})}
      />
    );
  else if (state === 'filter_empty')
    body = (
      <EmptyState
        state="filter_empty"
        pose="scan"
        body={t('screen.memory.no_match.text', { query: filter.q.trim() || chipLabel(filter.chip) })}
        action={{ label: t('screen.memory.no_match.clear'), onClick: clearFilters, variant: 'link' }}
      />
    );
  else
    body = (
      <>
        {grouped.sections.map((s) => (
          <section key={s.kind} aria-labelledby={`memory-section-${s.kind}`}>
            <SectionLabel id={`memory-section-${s.kind}`}>
              {t('screen.memory.section.count', { label: sectionLabel(s.kind), count: s.facts.length })}
            </SectionLabel>
            <FactList facts={s.facts} ctx={ctx} labelledBy={`memory-section-${s.kind}`} />
          </section>
        ))}
        {grouped.helpers.length > 0 && <HelperNotes helpers={grouped.helpers} ctx={ctx} />}
      </>
    );

  return (
    <div className={styles.page} data-testid={TID.screenMemory} data-page="memory" data-state={facts ? state : 'loading'}>
      <PageHeader title={t('screen.memory.title')} backLabel={t('screen.memory.back')} onBack={back}>
        <PageSearchField
          ref={search}
          tid="memorySearch"
          value={filter.q}
          placeholder={t('screen.memory.search.placeholder')}
          onChange={(q) => setFilter((f) => ({ ...f, q }))}
        />
        <Button variant="secondary" size="sm" data-testid={TID.memoryAdd} onClick={() => setAdding(true)}>
          {t('screen.memory.add.button')}
        </Button>
        <IconButton
          icon="MoreHorizontal"
          label={t('screen.memory.menu.label')}
          aria-haspopup="menu"
          aria-expanded={menuId === PAGE_MENU}
          data-testid={TID.memoryMenu}
          onClick={(e) => {
            if (menuId === PAGE_MENU) return closeMenu(false);
            setAnchor(e.currentTarget);
            setMenu(PAGE_MENU);
          }}
        />
      </PageHeader>
      <main className={styles.scroll} aria-label={t('screen.memory.title')}>
        <div className={styles.column}>
          {!rememberOn && (
            <Banner
              tone="info"
              text={t('screen.memory.off.text')}
              action={{ label: t('screen.memory.off.action'), onClick: () => void memoryActions.turnBackOn() }}
            />
          )}
          {unreadable.map((bad) => (
            <Banner
              key={bad.file}
              tone="warn"
              text={t('screen.memory.unreadable.text', { count: bad.lines.length, file: fileName(bad.file) })}
              action={{
                label: t('screen.memory.unreadable.action'),
                onClick: () => {
                  setShowBad(bad);
                  openDialog('unreadable-lines');
                },
              }}
            />
          ))}
          {adding && (
            <div className={styles.addRow}>
              <EditField
                initial=""
                placeholder={t('screen.memory.add.placeholder')}
                saveLabel={t('screen.memory.add.save')}
                cancelLabel={t('screen.memory.add.cancel')}
                onCancel={() => setAdding(false)}
                onSave={(text) => {
                  setAdding(false);
                  setForgotAll(false);
                  // memory:changed may have reloaded the list first; keep one row per fact.
                  void memoryActions
                    .add(text)
                    .then((r) => r.ok && setFacts((list) => [r.value, ...(list ?? []).filter((x) => x.id !== r.value.id)]));
                }}
              />
            </div>
          )}
          {facts && scoped.length > 0 && (
            <div className={styles.chips} role="toolbar" aria-label={t('screen.memory.title')}>
              {chips.map((c: MemoryChipId) => (
                <Chip
                  key={c}
                  selected={filter.chip === c}
                  data-testid={TID.memoryFilter}
                  data-row-id={c}
                  onClick={() => setFilter((f) => ({ ...f, chip: c }))}
                >
                  {chipLabel(c)}
                </Chip>
              ))}
              {filter.last7 && (
                <Chip
                  selected
                  removeLabel={t('screen.memory.filter.last7_remove')}
                  onClick={() => setFilter((f) => ({ ...f, last7: false }))}
                >
                  {t('screen.memory.filter.last7')}
                </Chip>
              )}
            </div>
          )}
          {status && (
            <p className={styles.status} role="status">
              {status.text}
              {status.path && (
                <>
                  {' '}
                  <button type="button" className={styles.link} onClick={() => void memoryActions.showInFolder(status.path!)}>
                    {t('screen.memory.export.show')}
                  </button>
                </>
              )}
            </p>
          )}
          {facts && learned > 0 && !filter.last7 && state === 'list' && (
            <div className={styles.learned} data-testid={TID.memoryLearned}>
              <Banner
                tone="info"
                text={t('screen.memory.learned.text', { count: learned })}
                action={{ label: t('screen.memory.learned.action'), onClick: () => setFilter((f) => ({ ...f, last7: true })) }}
              />
            </div>
          )}
          {body}
        </div>
      </main>
      {undo && (
        <UndoBar
          key={undo.token}
          text={undoText(undo.fact.text)}
          actionLabel={t('screen.memory.undo.action')}
          onUndo={undoForget}
          onFinal={finalizeUndo}
        />
      )}
      {menuId === PAGE_MENU && anchor && (
        <Menu entries={pageMenu} anchor={{ el: anchor, align: 'end' }} label={t('screen.memory.menu.label')} onClose={closeMenu} />
      )}
      {rowMenuFact && menuId === rowMenuId(rowMenuFact.id) && anchor && (
        <Menu
          entries={rowMenu(rowMenuFact)}
          anchor={{ el: anchor, align: 'end' }}
          label={t('screen.memory.row.menu_label')}
          onClose={closeMenu}
        />
      )}
      {dialog === 'c-03' && source && sourceCount && (
        <C03
          app={APP_NAME[source]}
          count={sourceCount.count}
          onClose={() => {
            closeDialog();
            setSource(null);
          }}
          onConfirm={() => {
            closeDialog();
            setSource(null);
            void memoryActions.forgetBySource(sourceCount.origin).then((r) => {
              if (r.ok) say({ text: t('screen.memory.status.forgot_count', { count: r.value.count }) });
              load();
            });
          }}
        />
      )}
      {dialog === 'c-04' && (
        <C04
          onClose={closeDialog}
          onConfirm={() => {
            closeDialog();
            void memoryActions.forgetAll().then((r) => {
              if (r.ok) {
                setForgotAll(true);
                setFacts([]);
              }
              load();
            });
          }}
        />
      )}
      {dialog === 'unreadable-lines' && showBad && (
        <UnreadableLines
          bad={showBad}
          onOpen={() => void memoryActions.openFile(showBad.file)}
          onClose={() => {
            closeDialog();
            setShowBad(null);
          }}
        />
      )}
    </div>
  );
}

/** "{Documents › foo-memory-16-Oct-2026.zip}" (06-2 §7.4). */
function shownPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join(' › ');
}
