// Spec: 08-1 §0.3 (`Result<T>`, no throw across a process boundary), 08-3 §21 (ErrorKind lists), 08-0 §E.9 (errors.ts).
// `ErrorKind` lives in types.ts (08-0 §E.9).
import type { ErrorKind, PasteCatch } from './types';

export type { ErrorKind };

export interface FooError {
  kind: ErrorKind;
  message?: string;
  /** 08-1 §3.2 message:send: `SECRET_SUSPECTED` returns the `PasteCatch` main found (R1). */
  paste?: PasteCatch;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: FooError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(kind: ErrorKind, message?: string): Result<T> => ({
  ok: false,
  error: message === undefined ? { kind } : { kind, message },
});
