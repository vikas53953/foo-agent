// Spec: 08-3 §22.9 / 10-2 §E; user §7. The full eight-hour soak remains the acceptance threshold, while the
// explicitly requested one-hour route is diagnostic partial evidence and must never be reported as full acceptance.
export const FULL_SOAK_HOURS = 8;
export const PARTIAL_SOAK_HOURS = 1;

export type SoakDuration = {
  hours: number;
  partial: boolean;
  acceptanceHours: number;
};

export function resolveSoakDuration(rawHours: string | undefined, partial: boolean): SoakDuration {
  const hours = Number(rawHours ?? FULL_SOAK_HOURS);
  if (!Number.isInteger(hours) || (hours !== FULL_SOAK_HOURS && hours !== PARTIAL_SOAK_HOURS)) {
    throw new Error(`BLOCKED: use --duration-hours ${FULL_SOAK_HOURS}, or --partial --duration-hours ${PARTIAL_SOAK_HOURS}`);
  }
  if (hours === PARTIAL_SOAK_HOURS && !partial) {
    throw new Error(`BLOCKED: one-hour soak is diagnostic only; pass --partial explicitly`);
  }
  if (hours === FULL_SOAK_HOURS && partial) {
    throw new Error(`BLOCKED: --partial is only valid with --duration-hours ${PARTIAL_SOAK_HOURS}`);
  }
  return { hours, partial, acceptanceHours: FULL_SOAK_HOURS };
}
