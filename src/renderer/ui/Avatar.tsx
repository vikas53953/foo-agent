// Spec: 03-shell-1 §3.4.5 avatar (48 `--avatar-list`, `--r-full`; letter faces: foo fill `--fg-1` letter `--bg-app`;
// helper fill = its `--h-*` colour, letter `--on-helper`; letter = first letter of the name in `--t-title`; group = up to
// 3 member avatars of 26 clustered top-left, top-right, bottom-centre, each with a 2px `--bg-sidebar` ring), §3.4.5.1
// (WhatsApp mirror: fill `--bg-sunken`, letter `--fg-1`), §3.4.11 (the user: `--h-slate`), 08-0 §E.7 FaceRef grammar.
// The living face (02-2 §F15.9) arrives with its milestone: `living:*` draws the letter face of the name until then.
import type { CSSProperties } from 'react';
import type { FaceRef, Mood } from '../../shared/types';
import { cx } from './cx';
import styles from './Avatar.module.css';

export type AvatarKind = 'foo' | 'helper' | 'group' | 'wa_mirror' | 'user';
export type AvatarSize = 'list' | 'header' | 'inline';

export interface AvatarMember {
  face: FaceRef;
  name: string;
  kind: AvatarKind;
  color?: string | null;
}

export interface AvatarProps {
  face: FaceRef;
  name: string;
  kind: AvatarKind;
  /** A `--h-*` token name for helpers and groups. */
  color?: string | null;
  size?: AvatarSize;
  /** Group chats: the members drawn in the cluster (first 3). */
  members?: AvatarMember[];
  mood?: Mood;
  className?: string;
  'data-testid'?: string;
}

function firstGrapheme(s: string): string {
  const seg = new Intl.Segmenter('en-IN', { granularity: 'grapheme' });
  return seg.segment(s.trim()).containing(0)?.segment ?? '';
}

/** The glyph a letter face shows: `letter:{g}` → g; `glyph:{emoji}` → emoji; otherwise the name's first letter. */
export function faceGlyph(face: FaceRef, name: string, kind: AvatarKind): string {
  if (face.startsWith('letter:')) return face.slice('letter:'.length);
  if (face.startsWith('glyph:')) return face.slice('glyph:'.length);
  const g = firstGrapheme(name);
  // foo's wordmark face is lower case ("f", Blueprint `#win`); every other letter face is upper-cased.
  return kind === 'foo' ? g : g.toLocaleUpperCase('en-IN');
}

function fillStyle(kind: AvatarKind, color: string | null | undefined): CSSProperties | undefined {
  if ((kind === 'helper' || kind === 'group') && color && /^--h-[a-z]+$/.test(color)) return { background: `var(${color})` };
  return undefined;
}

export function Avatar({ face, name, kind, color, size = 'list', members, mood, className, ...rest }: AvatarProps) {
  if (kind === 'group' && members && members.length > 0) {
    return (
      <span className={cx(styles.avatar, styles[size], styles.cluster, className)} data-mood={mood} aria-hidden="true" {...rest}>
        {members.slice(0, 3).map((m, i) => (
          <span key={i} className={cx(styles.member, styles[`m${i}`], styles[m.kind])} style={fillStyle(m.kind, m.color)}>
            {faceGlyph(m.face, m.name, m.kind)}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span
      className={cx(styles.avatar, styles[size], styles[kind], className)}
      style={fillStyle(kind, color)}
      data-mood={mood}
      aria-hidden="true"
      {...rest}
    >
      {faceGlyph(face, name, kind)}
    </span>
  );
}

/** The face for a chat (02-2 §F15.9.9): today the letter face with its mood in data-mood for the living face to read. */
export function Face(props: AvatarProps) {
  return <Avatar {...props} />;
}
