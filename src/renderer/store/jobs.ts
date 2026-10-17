// Spec: 08-5 §5 `jobs.ts { byId; byChat }`, rule 2 (rev), 08-1 §3.3 job:upsert, Article 12 (job state comes from the job
// runner's rows; the right shell's Doing now and the header status line read this slice).
import type { JobRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export interface JobsState {
  byId: Record<string, JobRow>;
  byChat: Record<string, string[]>;
}

export const initialJobs = (): JobsState => ({ byId: {}, byChat: {} });

export function upsertJobReducer(s: JobsState, row: JobRow): void {
  const stored = s.byId[row.id];
  if (!acceptRev('job', row.id, stored, row)) return;
  s.byId[row.id] = row;
  if (stored && stored.chatId !== row.chatId) s.byChat[stored.chatId] = (s.byChat[stored.chatId] ?? []).filter((id) => id !== row.id);
  const list = (s.byChat[row.chatId] ??= []);
  if (!list.includes(row.id)) list.push(row.id);
}

const NO_IDS: string[] = [];
export const selectJob = (jobId: string) => (s: RootState) => s.jobs.byId[jobId];
export const selectJobIdsForChat = (chatId: string) => (s: RootState) => s.jobs.byChat[chatId] ?? NO_IDS;
