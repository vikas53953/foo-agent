// Spec: 04-2 §22.6 (attachment limits, J7 values: 6 files per message, 25 MB per file; allowed images, documents, audio and
// video; blocked programs and zipped folders), §22.5 (a paste over 2,000 characters or 40 lines becomes a "Pasted text"
// chip), §23.6 (10,000 characters per message; the counter from 9,000), 08-5 §3.4 (`Attachment.kind`), 08-1 §3.2 files:stage
// (`FILE_TOO_BIG`, `FILE_TYPE`). Shared by the composer (chips, notices, the drop overlay) and main (files:stage re-checks).
import type { Attachment } from './types';

export const MAX_FILES = 6;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PASTE_MAX_CHARS = 2_000;
export const PASTE_MAX_LINES = 40;
export const TEXT_LIMIT = 10_000;
export const COUNTER_FROM = 9_000;

export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif'] as const;
export const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'odt', 'ods', 'txt', 'md', 'rtf'] as const;
export const MEDIA_EXT = ['m4a', 'mp3', 'wav', 'ogg', 'opus', 'mp4', 'mov'] as const;
/** The composer's own voice recordings (MediaRecorder writes WebM Opus; see implementation-notes M2 builder B). */
export const VOICE_EXT = ['webm', 'ogg'] as const;
export const PROGRAM_EXT = [
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'ps1',
  'vbs',
  'js',
  'jse',
  'wsf',
  'scr',
  'lnk',
  'dll',
  'sys',
  'reg',
  'hta',
  'cpl',
  'jar',
  'appx',
  'msix',
] as const;
export const ZIP_EXT = ['zip', 'rar', '7z', 'tar', 'gz'] as const;

/** Why a file cannot be added, as the `composer.notice.*` slot of §22.6 (null: it can). */
export type FileProblem = 'programs' | 'zipped' | 'too_big' | 'unreadable';

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const has = (list: readonly string[], ext: string) => list.includes(ext);

/** §22.6: the first rule a file breaks. A file with no known extension cannot be read. */
export function fileProblem(name: string, bytes: number): FileProblem | null {
  const ext = extOf(name);
  if (has(PROGRAM_EXT, ext)) return 'programs';
  if (has(ZIP_EXT, ext)) return 'zipped';
  if (!has(IMAGE_EXT, ext) && !has(DOC_EXT, ext) && !has(MEDIA_EXT, ext)) return 'unreadable';
  if (bytes > MAX_FILE_BYTES) return 'too_big';
  return null;
}

/** 08-5 §3.4 `Attachment.kind` from the name. */
export function kindOf(name: string): Attachment['kind'] {
  const ext = extOf(name);
  if (has(IMAGE_EXT, ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (has(DOC_EXT, ext)) return 'doc';
  return 'other';
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export function mimeOf(name: string): string {
  return MIME[extOf(name)] ?? 'application/octet-stream';
}

/** §22.5: a paste this long becomes a "Pasted text" chip instead of text in the field. */
export function isLongPaste(text: string): boolean {
  if (text.length > PASTE_MAX_CHARS) return true;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10 && ++lines > PASTE_MAX_LINES) return true;
  return false;
}

/** The Windows file picker filter (§21.1 "filter = allowed types"). */
export const ACCEPT = [...IMAGE_EXT, ...DOC_EXT, ...MEDIA_EXT].map((e) => `.${e}`).join(',');
