// Spec: 08-1 §2.5 (CPU-heavy work, memory file parsing and hashing among it, runs in `worker_threads` inside the engine; the
// engine never opens the database file), 08-3 §12.2 (parser), 08-0 §E.7 (ids `f_{UUIDv7}`). This file is both the engine-side
// wrapper and the worker body: loaded as a worker with `workerData.fooMemoryParse`, it answers parse requests.
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { newId } from '../../shared/ids';
import { parseMemoryFile, type ParseResult } from './fileFormat';

interface ParseRequest {
  seq: number;
  text: string;
  file: string;
  today: string;
}
type ParseReply = { seq: number; ok: true; result: ParseResult } | { seq: number; ok: false; message: string };

export interface ParseWorker {
  /** Parses one memory file off the event loop; ids for brace-less lines are minted in the worker. */
  parse(text: string, opts: { file: string; today: string }): Promise<ParseResult>;
  close(): Promise<void>;
}

export interface ParseWorkerOptions {
  /** Extra Node flags for the worker (tests load TypeScript with `--require tsx/cjs`). */
  execArgv?: string[];
}

export function createParseWorker(options: ParseWorkerOptions = {}): ParseWorker {
  const worker = new Worker(__filename, {
    workerData: { fooMemoryParse: true },
    ...(options.execArgv ? { execArgv: options.execArgv } : {}),
  });
  worker.unref();
  let seq = 0;
  const waiting = new Map<number, { resolve: (r: ParseResult) => void; reject: (e: Error) => void }>();
  const failAll = (e: Error) => {
    for (const w of waiting.values()) w.reject(e);
    waiting.clear();
  };
  worker.on('message', (reply: ParseReply) => {
    const w = waiting.get(reply.seq);
    if (!w) return;
    waiting.delete(reply.seq);
    if (reply.ok) w.resolve(reply.result);
    else w.reject(new Error(reply.message));
  });
  worker.on('error', failAll);
  worker.on('exit', () => failAll(new Error('memory parse worker exited')));
  return {
    parse(text, opts) {
      seq += 1;
      const req: ParseRequest = { seq, text, file: opts.file, today: opts.today };
      return new Promise((resolve, reject) => {
        waiting.set(req.seq, { resolve, reject });
        worker.ref();
        worker.postMessage(req);
      }).finally(() => {
        if (waiting.size === 0) worker.unref();
      }) as Promise<ParseResult>;
    },
    async close() {
      await worker.terminate();
    },
  };
}

if (!isMainThread && parentPort && (workerData as { fooMemoryParse?: boolean } | null)?.fooMemoryParse) {
  const port = parentPort;
  port.on('message', (req: ParseRequest) => {
    let reply: ParseReply;
    try {
      reply = { seq: req.seq, ok: true, result: parseMemoryFile(req.text, { file: req.file, today: req.today, newId: () => newId('f') }) };
    } catch (e) {
      reply = { seq: req.seq, ok: false, message: e instanceof Error ? e.message : String(e) };
    }
    port.postMessage(reply);
  });
}
