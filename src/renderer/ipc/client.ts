// Spec: 03-shell-2 §3.9.6 (components never touch window.foo; `invoke` typed by the 08-1 §3 channel maps with a 15 s
// timeout → IpcTimeoutError; `useFooEvent` for events, FE-25), 08-0 §G.10, 08-5 §1 (IpcTimeoutError is renderer-only).
import { useEffect, useRef } from 'react';
import type { FooError, Result } from '../../shared/errors';
import type { EventChannel, EventPayload, FooBridge, InvokeChannel, InvokeIn, InvokeOut } from '../../shared/ipc';

export const IPC_TIMEOUT_MS = 15_000;

export class IpcTimeoutError extends Error {
  constructor(readonly channel: InvokeChannel) {
    super(`IPC ${channel} did not answer within 15 s`);
    this.name = 'IpcTimeoutError';
  }
}

/** A Result whose error is a FooError; thrown by `invokeOrThrow`. */
export class IpcError extends Error {
  constructor(
    readonly channel: InvokeChannel,
    readonly error: FooError,
  ) {
    super(`IPC ${channel} failed: ${error.kind}`);
    this.name = 'IpcError';
  }
}

let bridge: FooBridge | undefined;

function foo(): FooBridge {
  return bridge ?? window.foo;
}

/** Tests and the visual harness swap the bridge (a fake window.foo works too). */
export function setBridge(b: FooBridge | undefined): void {
  bridge = b;
}

/** Calls a main-process channel. Resolves to the channel's Result; rejects with IpcTimeoutError after 15 s. */
export function invoke<C extends InvokeChannel>(
  channel: C,
  payload: InvokeIn[C],
  timeoutMs = IPC_TIMEOUT_MS,
): Promise<Result<InvokeOut[C]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new IpcTimeoutError(channel)), timeoutMs);
    foo()
      .invoke(channel, payload)
      .then(
        (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
  });
}

/** Like `invoke`, but resolves to the value and rejects with IpcError when the Result is not ok. */
export async function invokeOrThrow<C extends InvokeChannel>(channel: C, payload: InvokeIn[C]): Promise<InvokeOut[C]> {
  const r = await invoke(channel, payload);
  if (!r.ok) throw new IpcError(channel, r.error);
  return r.value;
}

/** Subscribes outside React (the store's event wiring). Returns the unsubscribe function. */
export function onFooEvent<E extends EventChannel>(event: E, handler: (payload: EventPayload[E]) => void): () => void {
  return foo().on(event, handler);
}

/** Subscribes a component to a main-process event for its lifetime; the latest handler is always called. */
export function useFooEvent<E extends EventChannel>(event: E, handler: (payload: EventPayload[E]) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => onFooEvent(event, (p) => ref.current(p)), [event]);
}

/** The platform facts the preload read at start (os, reduced motion, animations, main's clock). */
export function platform(): FooBridge['platform'] {
  return foo().platform;
}
