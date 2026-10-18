// Spec: 08-3 §22.8 (test channels: "fire power event"), 09 §9.14.2 (text size), CR-0015. M11 T4 owns this file after T1;
// both channels are stubs until T4 (test:power may arrive first with M4's PowerService: then T4 keeps M4's).
import { z } from 'zod';
import type { PowerEventName } from '../../../shared/ipc';
import type { ChannelGuard } from '../../ipc/guard';

const POWER_EVENTS = ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'shutdown'] as const satisfies readonly PowerEventName[];
const powerArg = z.object({ event: z.enum(POWER_EVENTS) }).strict();
const textScaleArg = z.object({ factor: z.number().int().min(100).max(225) }).strict();

export function registerDisplayTestHooks(guard: ChannelGuard): void {
  guard.handle('test:power', (raw: unknown) => {
    powerArg.parse(raw);
    throw new Error('not built yet: M11 T4');
  });
  guard.handle('test:textScale', (raw: unknown) => {
    textScaleArg.parse(raw);
    throw new Error('not built yet: M11 T4');
  });
}
