// Spec: 11-fidelity §11.2.6 (the golden runner: Windows build, Segoe UI Variable / Segoe UI Emoji / Nirmala UI, 100 % scale,
// GPU off), FID-04 (runner identity recorded in every golden run and report). Writes golden/runner.json.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arch, platform, release, version } from 'node:os';
import { join } from 'node:path';

export interface RunnerIdentity {
  recordedAt: string;
  os: { platform: string; release: string; version: string; arch: string; windows: WindowsBuild | null };
  /** GitHub-hosted image, when on Actions (ImageOS / ImageVersion). */
  image: { os: string | null; version: string | null; runner: string | null };
  fonts: { segoeUIVariable: boolean; segoeUIEmoji: boolean; nirmalaUI: boolean; method: string };
  engine: string;
  chromium: string;
  electron: string | null;
  render: { viewport: string; deviceScaleFactor: 1; gpu: 'disabled'; network: 'blocked' };
  /** FID-04: the pinned image id. null until the golden runner is pinned (11 §11.2.6). */
  pinned: string | null;
  matchesPinned: boolean | null;
}

export interface WindowsBuild {
  productName: string | null;
  displayVersion: string | null;
  currentBuild: string | null;
  ubr: string | null;
}

function reg(name: string): string | null {
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion', '/v', name], { encoding: 'utf8' });
    const m = out.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`));
    if (!m) return null;
    const v = m[1]!.trim();
    return v.startsWith('0x') ? String(parseInt(v, 16)) : v;
  } catch {
    return null;
  }
}

function windowsFonts(): RunnerIdentity['fonts'] {
  const dirs = [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts')];
  if (process.env.LOCALAPPDATA) dirs.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
  const has = (...files: string[]) => dirs.some((d) => files.some((f) => existsSync(join(d, f))));
  return {
    segoeUIVariable: has('SegUIVar.ttf'),
    segoeUIEmoji: has('seguiemj.ttf'),
    nirmalaUI: has('Nirmala.ttc', 'Nirmala.ttf'),
    method: `font files in ${dirs.join(', ')}`,
  };
}

function fcFonts(): RunnerIdentity['fonts'] {
  let list = '';
  try {
    list = execFileSync('fc-list', [':', 'family'], { encoding: 'utf8' });
  } catch {
    // no fontconfig
  }
  const has = (family: string) => list.split('\n').some((l) => l.split(',').some((f) => f.trim() === family));
  return {
    segoeUIVariable: has('Segoe UI Variable'),
    segoeUIEmoji: has('Segoe UI Emoji'),
    nirmalaUI: has('Nirmala UI'),
    method: 'fc-list',
  };
}

export function runnerIdentity(engine: string, chromium: string, electron: string | null): RunnerIdentity {
  const win = platform() === 'win32';
  const windows: WindowsBuild | null = win
    ? { productName: reg('ProductName'), displayVersion: reg('DisplayVersion'), currentBuild: reg('CurrentBuild'), ubr: reg('UBR') }
    : null;
  const pinned = process.env.FOO_GOLDEN_PINNED_IMAGE ?? null;
  const imageId = process.env.ImageOS && process.env.ImageVersion ? `${process.env.ImageOS}/${process.env.ImageVersion}` : null;
  return {
    recordedAt: new Date().toISOString(),
    os: { platform: platform(), release: release(), version: version(), arch: arch(), windows },
    image: { os: process.env.ImageOS ?? null, version: process.env.ImageVersion ?? null, runner: process.env.RUNNER_NAME ?? null },
    fonts: win ? windowsFonts() : fcFonts(),
    engine,
    chromium,
    electron,
    render: { viewport: '1440x900', deviceScaleFactor: 1, gpu: 'disabled', network: 'blocked' },
    pinned,
    matchesPinned: pinned === null ? null : pinned === imageId,
  };
}
