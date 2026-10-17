// Spec: 04 §13 (the markdown subset and its styles: paragraphs 8 apart, bold 600, italic, strike, links always underlined
// with a domain tooltip and the C-26 other-domain confirm, bullet and numbered lists two levels, H1–H2 `--t-title`, H3+
// `--t-body-strong`, quote bar, rule, inline code), §13.1 code block (header with language and Copy → "Copied" 2 s; > 15 lines
// clamp with "Show all {n} lines", permanent), §13.2 table (rules only, numeric columns right-aligned tabular, > 20 rows →
// first 10 + "Show all {n} rows", focusable box "Table, {rows} rows, {columns} columns", right fade when it scrolls), §13.3
// images (max-height 360, contain on `--bg-sunken`, alt or "Picture"), §13.4 citation pills (popover on hover 500 ms, focus
// or click; "Sources ({n}) ›"), §16.1 auto-link menus, §16.2 money spans (tabular), §10.10 the user's WhatsApp set.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../shared/copy/t';
import { motion } from '../../shared/tokens';
import { TID } from '../../shared/testids';
import { Icon } from '../ui/Icon';
import { Menu, type MenuEntry } from '../ui/Menu';
import { Popover } from '../ui/Popover';
import { Tooltip } from '../ui/Tooltip';
import { cx } from '../ui/cx';
import { expand, selectExpanded } from '../store/messages';
import { useStore } from '../store/index';
import { mediaUrl, useBubble } from './bubbleContext';
import { copyText, mapsUrl, openLink, openUrl, prefillCalendar, prefillWriteEmail } from './linkActions';
import { domainOf, inlineText, type Block, type Inline, type Source } from './markdownParse';
import type { AutoKind } from './textRules';
import styles from './Markdown.module.css';

export const CODE_CLAMP = 15;
export const TABLE_CLAMP_OVER = 20;
export const TABLE_SHOWN = 10;

// ---------------------------------------------------------------- inline

export function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <InlineNode key={i} n={n} />
      ))}
    </>
  );
}

function InlineNode({ n }: { n: Inline }): ReactNode {
  switch (n.t) {
    case 'text':
      return n.v;
    case 'strong':
      return (
        <strong className={styles.strong}>
          <Inlines nodes={n.c} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inlines nodes={n.c} />
        </em>
      );
    case 'del':
      return (
        <del className={styles.del}>
          <Inlines nodes={n.c} />
        </del>
      );
    case 'code':
      return <code className={styles.code}>{n.v}</code>;
    case 'pre':
      return <code className={styles.pre}>{n.v}</code>;
    case 'br':
      return <br />;
    case 'money':
      return <span className={styles.money}>{n.v}</span>;
    case 'link':
      return <Link href={n.href} nodes={n.c} />;
    case 'auto':
      return <AutoLink kind={n.kind} text={n.v} href={n.href} />;
    case 'cite':
      return <CitePill sources={n.sources} />;
  }
}

function Link({ href, nodes }: { href: string; nodes: Inline[] }) {
  const shown = inlineText(nodes, false);
  return (
    <Tooltip text={domainOf(href)} className={styles.tipAnchor}>
      <a
        href={href}
        className={styles.link}
        data-testid={TID.bubbleLink}
        onClick={(e) => {
          e.preventDefault();
          openLink(href, shown);
        }}
      >
        <Inlines nodes={nodes} />
      </a>
    </Tooltip>
  );
}

function autoEntries(kind: AutoKind | 'address', text: string, href: string, chatId: string, agentName: string): MenuEntry[] {
  const item = (id: string, label: string, tid: Extract<MenuEntry, { kind: 'item' }>['tid'], onSelect: () => void): MenuEntry => ({
    kind: 'item',
    id,
    label,
    tid,
    onSelect,
  });
  switch (kind) {
    case 'url':
      return [
        item('open', t('bubble.autolink.menu.open'), 'bubbleAutolinkMenuOpen', () => openUrl(href)),
        item('copy', t('bubble.autolink.menu.copy_link'), 'bubbleAutolinkMenuCopy', () => void copyText(href)),
      ];
    case 'email':
      return [
        item('copy', t('bubble.autolink.menu.copy_email'), 'bubbleAutolinkMenuCopy', () => void copyText(text)),
        item('write', t('bubble.autolink.menu.write', { agentName }), 'bubbleAutolinkMenuWrite', () => prefillWriteEmail(chatId, text)),
      ];
    case 'phone':
      return [
        item('copy', t('bubble.autolink.menu.copy_number'), 'bubbleAutolinkMenuCopy', () => void copyText(text)),
        item('call', t('bubble.autolink.menu.call'), 'bubbleAutolinkMenuCall', () => openUrl(href)),
      ];
    case 'date':
      return [
        item('calendar', t('bubble.autolink.menu.calendar'), 'bubbleAutolinkMenuCalendar', () => prefillCalendar(chatId, text)),
        item('copy', t('bubble.autolink.menu.copy'), 'bubbleAutolinkMenuCopy', () => void copyText(text)),
      ];
    case 'address':
      return [
        item('maps', t('bubble.autolink.menu.maps'), 'bubbleAutolinkMenuMaps', () => openUrl(mapsUrl(text))),
        item('copy', t('bubble.autolink.menu.copy_address'), 'bubbleAutolinkMenuCopy', () => void copyText(text)),
      ];
  }
}

/** §16.1: an auto-link opens its small actions menu; it never acts directly. The user's side (§10.7) opens URLs directly. */
function AutoLink({ kind, text, href }: { kind: AutoKind; text: string; href: string }) {
  const b = useBubble();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <a
        href={href || undefined}
        role={href ? undefined : 'button'}
        tabIndex={href ? undefined : 0}
        className={styles.link}
        data-testid={TID.bubbleAutolink}
        data-state={kind}
        aria-haspopup={b.side === 'me' && kind === 'url' ? undefined : 'menu'}
        onClick={(e) => {
          e.preventDefault();
          if (b.side === 'me' && kind === 'url') openUrl(href);
          else setAnchor(e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (!href && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setAnchor(e.currentTarget);
          }
        }}
      >
        {text}
      </a>
      {anchor && (
        <Menu entries={autoEntries(kind, text, href, b.chatId, b.agentName)} anchor={{ el: anchor }} onClose={() => setAnchor(null)} />
      )}
    </>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ul className={styles.sources}>
      {sources.map((s, i) => (
        <li key={s.url} className={styles.source}>
          <span className={styles.sourceText}>
            <span className={styles.sourceTitle}>{s.name}</span>
            <span className={styles.sourceDomain}>{s.domain}</span>
          </span>
          <button type="button" className={styles.open} data-testid={TID.bubbleCitationOpen} data-index={i} onClick={() => openUrl(s.url)}>
            {t('bubble.citation.open')}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CitePill({ sources }: { sources: Source[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<'hover' | 'click' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const first = sources[0];
  if (!first) return null;
  const more = sources.length - 1;
  const label = more > 0 ? t('bubble.citation.label_many', { name: first.name, n: more }) : first.name;
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen((o) => (o === 'hover' ? null : o)), motion['delay-tooltip-warm']);
  };
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className={styles.cite}
        data-testid={TID.bubbleCitation}
        aria-label={t('bubble.citation.accessible_name', { name: first.name, n: more })}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        onClick={() => setOpen('click')}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setOpen((o) => o ?? 'click')}
        onPointerEnter={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setOpen((o) => o ?? 'hover'), motion['delay-tooltip']);
        }}
        onPointerLeave={leave}
      >
        {label}
      </button>
      {open && anchor && (
        <Popover
          anchor={anchor}
          label={label}
          tid="bubbleCitationPopover"
          size="md"
          onClose={() => setOpen(null)}
          onPointerEnter={() => clearTimeout(timer.current)}
          onPointerLeave={open === 'hover' ? leave : undefined}
        >
          <SourceList sources={sources} />
        </Popover>
      )}
    </>
  );
}

/** §13.4: "Sources ({n}) ›" under a message with ≥ 2 sources. */
export function SourcesRow({ sources }: { sources: Source[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  if (sources.length < 2) return null;
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className={styles.sourcesRow}
        data-testid={TID.bubbleSources}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {t('bubble.citation.sources', { n: sources.length })}
      </button>
      {open && anchor && (
        <Popover
          anchor={anchor}
          label={t('bubble.citation.sources', { n: sources.length })}
          tid="bubbleCitationPopover"
          size="md"
          autoFocus
          onClose={() => setOpen(false)}
        >
          <SourceList sources={sources} />
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- blocks

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockNode key={i} b={b} index={i} />
      ))}
    </>
  );
}

function ListBlock({ b }: { b: Extract<Block, { t: 'list' }> }) {
  const items = b.items.map((it, i) => (
    <li key={i}>
      <Inlines nodes={it.c} />
      {it.sub && <ListBlock b={it.sub} />}
    </li>
  ));
  return b.ordered ? (
    <ol className={styles.list} start={b.start}>
      {items}
    </ol>
  ) : (
    <ul className={styles.list}>{items}</ul>
  );
}

function BlockNode({ b, index }: { b: Block; index: number }): ReactNode {
  switch (b.t) {
    case 'p':
      return (
        <p className={styles.p}>
          <Inlines nodes={b.c} />
        </p>
      );
    case 'h':
      return b.level <= 2 ? (
        <h3 className={styles.h12}>
          <Inlines nodes={b.c} />
        </h3>
      ) : (
        <h4 className={styles.h3}>
          <Inlines nodes={b.c} />
        </h4>
      );
    case 'list':
      return <ListBlock b={b} />;
    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <Blocks blocks={b.c} />
        </blockquote>
      );
    case 'hr':
      return <hr className={styles.hr} />;
    case 'code':
      return <CodeBlock lang={b.lang} code={b.v} part={`code${index}`} />;
    case 'table':
      return <TableBlock b={b} part={`table${index}`} />;
    case 'img':
      return <AnswerImage alt={b.alt} src={b.src} />;
  }
}

export function languageLabel(lang: string): string {
  const l = lang.toLowerCase();
  if (l === 'python' || l === 'py') return t('bubble.code.language.python');
  if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'json'].includes(l)) return t('bubble.code.language.javascript');
  if (l === 'html' || l === 'xml') return t('bubble.code.language.html');
  if (l === 'css') return t('bubble.code.language.css');
  if (l === 'sql') return t('bubble.code.language.sql');
  if (l === 'excel' || l === 'formula' || l === 'sheets') return t('bubble.code.language.formula');
  return t('bubble.code.language.text');
}

function CodeBlock({ lang, code, part }: { lang: string; code: string; part: string }) {
  const b = useBubble();
  const expanded = useStore(selectExpanded(b.messageId, part));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), motion['dur-confirm']);
    return () => clearTimeout(id);
  }, [copied]);
  const lines = code.split('\n');
  const clamped = lines.length > CODE_CLAMP && !expanded;
  const language = languageLabel(lang);
  return (
    <div
      className={styles.codeBox}
      data-testid={TID.bubbleCode}
      role="group"
      aria-label={t('bubble.code.accessible_name', { language, n: lines.length })}
    >
      <div className={styles.codeHead}>
        <span className={styles.codeLang}>{language}</span>
        <button
          type="button"
          className={cx(styles.codeCopy, copied && styles.copied)}
          aria-label={t('bubble.code.copy_accessible')}
          data-testid={TID.bubbleCodeCopy}
          onClick={() => void copyText(code).then((ok) => ok && setCopied(true))}
        >
          <Icon name={copied ? 'Checkmark' : 'Copy'} size={16} />
          {copied ? t('bubble.code.copied') : t('bubble.code.copy')}
        </button>
      </div>
      <pre className={cx(styles.codeBody, clamped && styles.clamped)} tabIndex={0}>
        {clamped ? lines.slice(0, CODE_CLAMP).join('\n') : code}
      </pre>
      {clamped && (
        <button type="button" className={styles.showAll} data-testid={TID.bubbleCodeExpand} onClick={() => expand(b.messageId, part)}>
          {t('bubble.code.show_all', { n: lines.length })}
        </button>
      )}
    </div>
  );
}

function TableBlock({ b, part }: { b: Extract<Block, { t: 'table' }>; part: string }) {
  const bubble = useBubble();
  const expanded = useStore(selectExpanded(bubble.messageId, part));
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const clamp = b.rows.length > TABLE_CLAMP_OVER && !expanded;
  const rows = clamp ? b.rows.slice(0, TABLE_SHOWN) : b.rows;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, [rows.length]);
  return (
    <div className={styles.tableWrap} data-more={more || undefined}>
      <div
        ref={box}
        className={styles.tableBox}
        tabIndex={0}
        role="group"
        aria-label={t('bubble.table.accessible_name', { rows: b.rows.length, columns: b.head.length })}
        data-testid={TID.bubbleTable}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            box.current?.scrollBy({ left: e.key === 'ArrowRight' ? 80 : -80 });
          }
        }}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              {b.head.map((c, i) => (
                <th key={i} className={cx(b.numeric[i] && styles.num)}>
                  <Inlines nodes={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, i) => (
                  <td key={i} className={cx(b.numeric[i] && styles.num)}>
                    <Inlines nodes={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {clamp && (
        <button type="button" className={styles.showAll} data-testid={TID.bubbleTableExpand} onClick={() => expand(bubble.messageId, part)}>
          {t('bubble.table.show_all', { n: b.rows.length })}
        </button>
      )}
    </div>
  );
}

function AnswerImage({ alt, src }: { alt: string; src: string }) {
  const url = mediaUrl(src);
  const [broken, setBroken] = useState(!url);
  if (broken)
    return (
      <div className={styles.imgBroken} data-testid={TID.bubbleImage} data-index={0}>
        <Icon name="Image" size={24} />
        <span>{t('bubble.image.broken')}</span>
      </div>
    );
  return (
    <img
      className={styles.img}
      src={url ?? undefined}
      alt={alt || t('bubble.image.alt_default')}
      data-testid={TID.bubbleImage}
      data-index={0}
      onError={() => setBroken(true)}
    />
  );
}
