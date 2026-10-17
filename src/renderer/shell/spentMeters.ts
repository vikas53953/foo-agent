// Spec: 03-shell-2 §3.7.3.4 (meter: fill --accent; 80–99 % --warn; ≥ 100 % --bad and "Cap reached · {cap}"), Article 13.
export interface MeterState {
  tone: 'accent' | 'warn' | 'bad';
  capReached: boolean;
}

export function meterState(spentPaise: number, capPaise: number): MeterState {
  const ratio = capPaise > 0 ? spentPaise / capPaise : spentPaise > 0 ? 1 : 0;
  if (ratio >= 1) return { tone: 'bad', capReached: true };
  if (ratio >= 0.8) return { tone: 'warn', capReached: false };
  return { tone: 'accent', capReached: false };
}
