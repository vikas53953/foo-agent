// Spec: 08-2 §6.2 (adapter interface, normative), §6.7 (AiErrorKind), §6.9 (lanes); 08-4 §30.1 (purposes), §30.6 (attachments).
// The shapes below are copied from 08-2 §6.2; only `RawAiError` and `AdapterDeps` are added (gap: 08-2 names them, never
// spells them out; implementation-notes "M3").
import type { ErrorKind, ProviderId } from '../../shared/types';
import type { Result } from '../../shared/errors';

export type AiPurpose =
  | 'chat'
  | 'intake'
  | 'step'
  | 'repair'
  | 'second_look'
  | 'memory_review'
  | 'tidy'
  | 'routine'
  | 'brief'
  | 'verify'
  | 'classify'
  | 'rewrite'
  | 'voice'
  | 'web'
  | 'hub'
  | 'catch_up'
  | 'read_attachment';

/** 08-2 §6.7: every value is an ErrorKind of 08-3 §21. */
export type AiErrorKind = Extract<
  ErrorKind,
  | 'NET_OFFLINE'
  | 'AI_SERVICE_DOWN'
  | 'AI_SIGNED_OUT'
  | 'AI_KEY_INVALID'
  | 'AI_LIMIT'
  | 'AI_CLI_INCOMPATIBLE'
  | 'AI_TIMEOUT'
  | 'AI_NO_VISION'
  | 'AI_PROTOCOL_VIOLATION'
  | 'PROTOCOL_INVALID'
  | 'FAKE_AI_NO_MATCH'
  | 'UNKNOWN'
>;

export interface DetectResult {
  found: boolean;
  state: 'ready' | 'installed_not_signed_in' | 'not_installed' | 'key_in_env' | 'running_local';
  binaryPath?: string;
  version?: string;
  account?: string /* masked */;
  envKeyName?: string;
  models?: string[];
}
export interface VerifyResult {
  ok: boolean;
  kind?: AiErrorKind;
  latencyMs: number;
  resetAt?: number;
}
export interface Capabilities {
  stdinPrompt: boolean;
  systemPromptFile: boolean;
  appendSystemPrompt: boolean;
  resume: boolean;
  disableTools: 'flag' | 'settings' | 'none';
  jsonStream: boolean;
  modelFlag: boolean;
  vision: boolean;
}
export interface TurnRequest {
  turnId: string;
  purpose: AiPurpose;
  system: string;
  prompt: string; // both already REDACTED (08-2 §11.4)
  resumeSessionId?: string;
  model?: string;
  maxOutputTokens: number;
  timeoutMs: number;
  temperature: number | null;
  stream: boolean;
  attachments?: { path: string; mime: 'image/png'; bytes: number }[];
  attachmentText?: { page: number; text: string }[];
  /** Fake provider only (08-3 §22.3 `match.chatId`). */
  chatId?: string;
}
export interface TurnSink {
  onText(delta: string): void;
  onSession(id: string): void;
}
export interface AiUsage {
  tokensIn: number | null;
  tokensOut: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  costUsd: number | null;
  planUsedPct?: number | null;
}
export interface TurnResult {
  text: string;
  sessionId?: string;
  usage: AiUsage;
  modelReported?: string;
  stopReason: 'end' | 'max_tokens' | 'cancelled' | 'error';
  /** Set when stopReason is 'error' (08-2 §6.7). */
  errorKind?: AiErrorKind;
  resetAt?: number;
}
/** 08-5 §3 RawAiError ({ providerId, http?, code?, message }) plus engine-only signals classifyError reads (never sent over IPC
 * as-is: `toWireRawAiError` keeps only the 08-5 fields, message Redactor-scrubbed and cut to 200). */
export interface RawAiError {
  providerId: ProviderId;
  http?: number;
  code?: string; // ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ...
  message: string;
  retryAfterSec?: number;
  stderr?: string;
  exitCode?: number | null;
  timedOut?: boolean;
  online?: boolean;
}

export interface AiAdapter {
  readonly id: ProviderId;
  readonly billing: 'plan' | 'key' | 'local';
  detect(): Promise<DetectResult>;
  probe(): Promise<Capabilities>;
  verify(signal: AbortSignal): Promise<VerifyResult>;
  runTurn(req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult>;
  cancel(turnId: string): Promise<void>;
  estimate(req: TurnRequest): { tokensIn: number; tokensOutMax: number; costPaise: number | null };
  classifyError(e: RawAiError): AiErrorKind;
  signIn?(signal: AbortSignal): Promise<Result<{ email?: string }>>;
}
