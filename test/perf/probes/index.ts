// Spec: 10-acceptance-2 §E (PERF-01…18), 08-3 §20, M14 pack §4 (smoke = the ids measurable on M0–M3 + the perf seed).
import { probe as p01 } from './PERF-01';
import { probe as p02 } from './PERF-02';
import { probe as p03 } from './PERF-03';
import { probe as p04 } from './PERF-04';
import { probe as p05 } from './PERF-05';
import { probe as p06 } from './PERF-06';
import { probe as p07 } from './PERF-07';
import { probe as p08 } from './PERF-08';
import { probe as p09 } from './PERF-09';
import { probe as p10 } from './PERF-10';
import { probe as p11 } from './PERF-11';
import { probe as p12 } from './PERF-12';
import { probe as p13 } from './PERF-13';
import { probe as p14 } from './PERF-14';
import { probe as p15 } from './PERF-15';
import { probe as p16 } from './PERF-16';
import { probe as p17 } from './PERF-17';
import { probe as p18 } from './PERF-18';
import type { Probe } from './types';

export const PROBES: readonly Probe[] = [p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12, p13, p14, p15, p16, p17, p18];

export const SMOKE_IDS: readonly string[] = PROBES.filter((p) => p.smoke).map((p) => p.id);
