// Spec: 06-2 §6.11 About rows and the dialogs they open (CR-0061, X-218): 06-1 §2.1 "Privacy details" (`dialog-privacy`,
// Dialog sm: "What leaves this PC", the lead line, the 06-2 §6.6 `leaves` list with " (when you turn it on)" on a service
// not set up, the no-training sentence, [ Got it ]), 06-3 §16 What's new (`dialog-whats-new`, Dialog md: "Version {v} ·
// {date}", 3–6 first-person bullets, "Earlier versions", [ Got it ]; no notes → "Small fixes to keep things running
// smoothly."), §18.2 Send a report (`dialog-report`, Dialog lg: the exact redacted text in a read-only 320px mono box,
// "{48 KB} · Add a note (optional)", [ Not now ] [ Save report ]; Preparing / Saving / Saved (closes after 2 s) / Failed),
// 06-2 §6.11 `licences` (`dialog-licences`, Dialog lg: "{name} · {licence}" in `--t-small`, [ Close ]). A service row in the
// privacy list shows only when its feature is on in this build (CR-0054).
import { useEffect, useState } from 'react';
import { t } from '../../../shared/copy/t';
import type { FeatureId } from '../../../shared/features';
import { TID } from '../../../shared/testids';
import whatsNew from '../../../../resources/whats-new.json';
import licences from '../../../../resources/licences.json';
import { invoke } from '../../ipc/client';
import { closeDialog, useStore } from '../../store/index';
import { selectAi, selectFeatureOn } from '../../store/live';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import styles from './AboutDialogs.module.css';

const SERVICES: { line: () => string; feature: FeatureId }[] = [
  { line: () => t('privacy.leaves.voice'), feature: 'voice' },
  { line: () => t('privacy.leaves.search'), feature: 'search' },
  { line: () => t('privacy.leaves.reading'), feature: 'web' },
  { line: () => t('privacy.leaves.browsing'), feature: 'web' },
];

/** The §6.6 `leaves` list as lines; `firstRun` marks every service " (when you turn it on)" (06-1 §2.1). */
export function useLeavesLines(firstRun: boolean): string[] {
  const ai = useStore(selectAi);
  const on = useStore((s) => SERVICES.map((x) => selectFeatureOn(x.feature)(s)).join(','));
  const shown = SERVICES.filter((_, i) => on.split(',')[i] === 'true');
  // CR-0063 (X-220): with jobs and web off foo only chats, so the line names messages only (no job details, no sites).
  const acts = useStore((st) => selectFeatureOn('jobs')(st) || selectFeatureOn('web')(st));
  const name = ai?.primary ? ai.displayName : null;
  const aiLine = acts
    ? name
      ? t('privacy.leaves.ai', { ai: name })
      : t('privacy.leaves.ai_unnamed')
    : name
      ? t('privacy.leaves.ai_chat', { ai: name })
      : t('privacy.leaves.ai_chat_unnamed');
  return [
    aiLine,
    ...shown.map((x) => x.line() + (firstRun ? t('setup.privacy.not_on_suffix') : '')),
    t('privacy.leaves.nothing_else'),
    t('privacy.leaves.never_secrets'),
  ];
}

export function PrivacyDialog() {
  const firstRun = useStore((s) => !(s.settings.value?.setup.complete ?? false));
  const lines = useLeavesLines(firstRun);
  return (
    <Dialog
      tid="dialogPrivacy"
      title={t('setup.privacy.title')}
      body={t('setup.privacy.lead')}
      primary={t('setup.privacy.got_it')}
      onPrimary={closeDialog}
      onClose={closeDialog}
    >
      <ul className={styles.list}>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className={styles.note}>{t('setup.privacy.no_training')}</p>
    </Dialog>
  );
}

interface Notes {
  version: string;
  date: string | null;
  notes: string[];
}
const NOTES = whatsNew as Notes[];

export function WhatsNewDialog() {
  const version = useStore((s) => s.live.appVersion) ?? '';
  const [earlier, setEarlier] = useState(false);
  const current = NOTES.find((n) => n.version === version);
  const older = NOTES.filter((n) => n !== current);
  const meta = (n: { version: string; date: string | null }) =>
    n.date ? t('whats_new.dialog.meta', { version: n.version, date: n.date }) : t('whats_new.dialog.meta_undated', { version: n.version });
  return (
    <Dialog
      tid="dialogWhatsNew"
      size="md"
      title={t('whats_new.dialog.title')}
      primary={t('whats_new.dialog.got_it')}
      onPrimary={closeDialog}
      onClose={closeDialog}
    >
      <p className={styles.meta}>{meta(current ?? { version, date: null })}</p>
      {current?.notes.length ? (
        <ul className={styles.bullets}>
          {current.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : (
        <p>{t('whats_new.dialog.none')}</p>
      )}
      {older.length > 0 &&
        (earlier ? (
          older.map((o) => (
            <div key={o.version}>
              <p className={styles.meta}>{meta(o)}</p>
              <ul className={styles.bullets}>
                {o.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <Button variant="link" onClick={() => setEarlier(true)}>
            {t('whats_new.dialog.earlier')}
          </Button>
        ))}
    </Dialog>
  );
}

type ReportState =
  { kind: 'preparing' } | { kind: 'ready' | 'saving' | 'failed'; previewId: string; text: string; secret?: boolean } | { kind: 'saved' };

export function ReportDialog() {
  const [state, setState] = useState<ReportState>({ kind: 'preparing' });
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  // A failed preview leaves Save as "try again": it asks for the preview again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void invoke('app:reportPreview', {}).then(
      (r) =>
        live &&
        setState(r.ok ? { kind: 'ready', previewId: r.value.previewId, text: r.value.text } : { kind: 'failed', previewId: '', text: '' }),
      () => live && setState({ kind: 'failed', previewId: '', text: '' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (state.kind !== 'saved') return;
    const timer = window.setTimeout(closeDialog, 2000);
    return () => window.clearTimeout(timer);
  }, [state.kind]);
  const save = () => {
    if (state.kind !== 'ready' && state.kind !== 'failed') return;
    if (!state.previewId) {
      setState({ kind: 'preparing' });
      setAttempt((n) => n + 1);
      return;
    }
    const { previewId, text } = state;
    setState({ kind: 'saving', previewId, text });
    void invoke('app:reportSave', { previewId, ...(note.trim() ? { note } : {}) }).then(
      // 08-3 §19.5: a key in the export stops the save for good (the preview cannot change), so Save stays off.
      (r) => setState(r.ok ? { kind: 'saved' } : { kind: 'failed', previewId, text, secret: r.error.kind === 'EXPORT_SECRET_FOUND' }),
      () => setState({ kind: 'failed', previewId, text }),
    );
  };
  const text = state.kind === 'ready' || state.kind === 'saving' || state.kind === 'failed' ? state.text : '';
  const kb = Math.max(1, Math.round(new TextEncoder().encode(text).length / 1024));
  return (
    <Dialog
      tid="dialogReport"
      size="lg"
      title={t('report.dialog.title')}
      body={state.kind === 'saved' ? t('report.dialog.saved') : t('report.dialog.lead')}
      primary={state.kind === 'saving' ? t('report.dialog.saving') : t('report.dialog.save')}
      primaryDisabled={state.kind !== 'ready' && !(state.kind === 'failed' && !state.secret)}
      secondary={t('report.dialog.not_now')}
      onPrimary={save}
      onClose={closeDialog}
    >
      {state.kind !== 'saved' && (
        <>
          <textarea
            className={styles.preview}
            readOnly
            aria-label={t('report.dialog.preview_label')}
            data-testid={TID.dialogReportPreview}
            value={state.kind === 'preparing' ? t('report.dialog.preparing') : text}
            aria-busy={state.kind === 'preparing' || undefined}
          />
          <div className={styles.noteLine}>
            {state.kind !== 'preparing' && <span>{t('report.dialog.size', { size: kb })}</span>}
            {!noteOpen && (
              <Button variant="link" onClick={() => setNoteOpen(true)}>
                {t('report.dialog.add_note')}
              </Button>
            )}
          </div>
          {noteOpen && (
            <textarea
              className={styles.note}
              rows={2}
              maxLength={500}
              aria-label={t('report.dialog.add_note')}
              data-testid={TID.dialogReportNote}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          {state.kind === 'failed' && (
            <p className={styles.bad}>
              {state.secret
                ? t('errors.export_secret_found.line')
                : state.previewId
                  ? t('report.dialog.failed')
                  : t('report.dialog.preview_failed')}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}

const PARTS = licences as { name: string; licence: string }[];

export function LicencesDialog() {
  return (
    <Dialog
      tid="dialogLicences"
      size="lg"
      title={t('licences.dialog.title')}
      primary={t('licences.dialog.close')}
      onPrimary={closeDialog}
      onClose={closeDialog}
    >
      <ul className={styles.parts}>
        {PARTS.map((p) => (
          <li key={p.name}>{t('licences.dialog.row', { name: p.name, licence: p.licence })}</li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Mounted once by the shell (lazily): whichever About dialog is open. */
export function AboutDialogs() {
  const d = useStore((s) => s.ui.dialog);
  if (d === 'privacy') return <PrivacyDialog />;
  if (d === 'whats-new') return <WhatsNewDialog />;
  if (d === 'report') return <ReportDialog />;
  if (d === 'licences') return <LicencesDialog />;
  return null;
}
