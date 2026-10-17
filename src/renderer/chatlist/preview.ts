// Spec: 03-shell-1 §3.4.6 preview line (first rule that applies: 1 typing, 2 draft when the chat is not open, 3a working
// / queued, 3 a card waits on the user, 4 failed in the last 24 h, 5 the user's own (tick, or "Not sent"), 6 sender in a
// group or a WhatsApp mirror, 7 foo / the helper in its own chat; non-text bodies: card "{label}: {title}", voice
// "Voice message ({m:ss})", photo, file name), §3.4.7 (first run: "Setting up…"). Main derives rules 3a–7 from rows
// (Article 12); this file adds rules 1–2 and turns the result into words. Pure; unit-tested.
import { t } from '../../shared/copy/t';
import { formatDuration } from '../../shared/format';
import type { ChatRow, PreviewBody, TickState } from '../../shared/types';
import type { IconName } from '../ui/icons/registry';

export type PreviewTone = 'accent' | 'normal' | 'bad';

export interface PreviewParts {
  /** Which §3.4.6 rule produced it (data-state on the preview). */
  rule:
    | 'typing'
    | 'draft'
    | 'working'
    | 'queued'
    | 'needs_ok'
    | 'pick_one'
    | 'sign_in'
    | 'stuck'
    | 'failed'
    | 'mine'
    | 'not_sent'
    | 'sender'
    | 'own'
    | 'none'
    | 'setting_up';
  /** "Draft:" in `--accent` (rule 2) or "typing…" (rule 1). */
  lead?: string;
  tick?: TickState;
  icon?: { name: IconName; tone: PreviewTone };
  text: string;
  tone: PreviewTone;
}

/** Card labels from 05 that the list names (other card types show their title alone). */
function cardLabel(type: string): string | null {
  switch (type) {
    case 'payment':
      return t('chatlist.row.preview.card_label.payment');
    case 'checklist':
      return t('chatlist.row.preview.card_label.checklist');
    default:
      return null;
  }
}

export function bodyParts(body: PreviewBody): { icon?: IconName; text: string } {
  switch (body.kind) {
    case 'text':
      return { text: body.text };
    case 'voice':
      return { icon: 'Mic', text: t('chatlist.row.preview.voice', { duration: formatDuration(body.durationMs) }) };
    case 'photo':
      return { icon: 'Image', text: t('chatlist.row.preview.photo') };
    case 'file':
      return { icon: 'Document', text: body.name };
    case 'card': {
      const label = cardLabel(body.cardType);
      return { text: label ? t('chatlist.row.preview.card', { label, title: body.title }) : body.title };
    }
  }
}

export interface PreviewContext {
  typing: boolean;
  isOpen: boolean;
  setupComplete: boolean;
}

export function previewParts(row: ChatRow, ctx: PreviewContext): PreviewParts {
  if (!ctx.setupComplete && row.kind === 'foo') return { rule: 'setting_up', text: t('chatlist.row.preview.setting_up'), tone: 'normal' };
  if (ctx.typing) return { rule: 'typing', text: t('chatlist.row.preview.typing'), tone: 'accent' };
  if (row.list.draft !== null && !ctx.isOpen)
    return { rule: 'draft', lead: t('chatlist.row.preview.draft'), text: row.list.draft, tone: 'normal' };
  const p = row.list.preview;
  switch (p.rule) {
    case 'working':
      return { rule: 'working', text: t('chatlist.row.preview.working', { job: p.jobTitle }), tone: 'normal' };
    case 'queued':
      return { rule: 'queued', text: t('chatlist.row.preview.queued', { job: p.jobTitle }), tone: 'normal' };
    case 'needs_ok':
      return { rule: 'needs_ok', text: t('chatlist.row.preview.needs_ok', { title: p.title }), tone: 'normal' };
    case 'pick_one':
      return { rule: 'pick_one', text: t('chatlist.row.preview.pick_one', { question: p.question }), tone: 'normal' };
    case 'sign_in':
      return { rule: 'sign_in', text: t('chatlist.row.preview.sign_in', { site: p.site }), tone: 'normal' };
    case 'stuck':
      return { rule: 'stuck', text: t('chatlist.row.preview.stuck', { job: p.jobTitle }), tone: 'normal' };
    case 'failed':
      return { rule: 'failed', icon: { name: 'ErrorCircle', tone: 'bad' }, text: p.text, tone: 'normal' };
    case 'mine': {
      const b = bodyParts(p.body);
      if (p.tick === 'not_sent')
        return {
          rule: 'not_sent',
          icon: { name: 'ErrorCircle', tone: 'bad' },
          text: t('chatlist.row.preview.not_sent', { text: b.text }),
          tone: 'normal',
        };
      return {
        rule: 'mine',
        tick: p.tick,
        text: t('chatlist.row.preview.mine', { text: b.text }),
        tone: 'normal',
        ...(b.icon ? { icon: { name: b.icon, tone: 'normal' as const } } : {}),
      };
    }
    case 'sender': {
      const b = bodyParts(p.body);
      return { rule: 'sender', text: t('chatlist.row.preview.sender', { sender: p.sender, text: b.text }), tone: 'normal' };
    }
    case 'own': {
      const b = bodyParts(p.body);
      return { rule: 'own', text: b.text, tone: 'normal', ...(b.icon ? { icon: { name: b.icon, tone: 'normal' as const } } : {}) };
    }
    case 'none':
      return { rule: 'none', text: '', tone: 'normal' };
  }
}

/** The preview as one string (Narrator, search announcements). */
export function previewText(p: PreviewParts): string {
  return [p.lead, p.text].filter(Boolean).join(' ');
}
