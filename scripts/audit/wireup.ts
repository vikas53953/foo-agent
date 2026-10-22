// Spec: 03-shell-1 §3.9.6 (every visible control changes application state); 08-3 §22.8 (FOO_TEST live runs use isolated data).
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addFinding, lineOf, output, readText, relPath, repoRoot, result, trackedFiles, type AuditFinding } from './common';

const CONTROL_RE = /<(button|Button|IconButton|Chip|Toggle|Segmented|MenuItem|a)\b[^>]*>/gu;
const EVENT_RE = /\b(?:onClick|onChange|onKeyDown|onSubmit|onPointerDown|onPress|href)\s*=/u;
const NOOP_RE =
  /\bon(?:Click|Change|KeyDown|Submit|PointerDown|Press)\s*=\s*\{\s*(?:\(\s*\)\s*=>\s*\{\s*\}|\(\s*\)\s*=>\s*undefined|noop)\s*\}/u;
const EFFECT_RE = /\b(?:invoke|navigate|set[A-Z]\w*|dispatch|open|submit|remove|delete|save|send|toggle|update)\s*\(/u;
const JSX_COPY_RE = />\s*([A-Za-z][^<{\n]{2,})\s*</gu;

function isDestructiveLabel(label: string): boolean {
  return /\b(?:quit|delete|forget|remove|send|approve|pay|post|open in)\b/iu.test(label);
}

async function liveAudit(findings: AuditFinding[]): Promise<void> {
  if (process.env.FOO_AUDIT_LIVE !== '1') {
    addFinding(findings, {
      category: 'live-wireup',
      status: 'blocked',
      note: 'Live click audit not requested. Static source evidence is not live UX proof.',
    });
    return;
  }
  const outMain = join(repoRoot(), 'out', 'main', 'main', 'index.js');
  if (!existsSync(outMain)) {
    addFinding(findings, {
      category: 'live-wireup',
      status: 'blocked',
      note: 'FOO_AUDIT_LIVE=1 requires a current build (out/main/main/index.js is absent).',
    });
    return;
  }
  try {
    const { _electron: electron } = await import('@playwright/test');
    const base = mkdtempSync(join(tmpdir(), 'foo-wireup-'));
    const dirs = {
      FOO_DATA_DIR: join(base, 'data'),
      FOO_LOCAL_DIR: join(base, 'local'),
      FOO_OUT_DIR: join(base, 'out'),
    };
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/(?:API|AUTH|TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)/iu.test(key)) delete env[key];
    }
    const app = await electron.launch({
      args: ['.'],
      colorScheme: null,
      env: { ...env, FOO_TEST: '1', ...dirs },
    });
    try {
      const page = await app.firstWindow();
      const state = async () => ({
        body: await page
          .locator('body')
          .innerText()
          .catch(() => ''),
        url: page.url(),
        controls: await page
          .locator('button,[role="button"]')
          .evaluateAll((elements) =>
            elements.map(
              (element) =>
                `${element.tagName}:${element.getAttribute('aria-expanded') ?? ''}:${element.getAttribute('aria-pressed') ?? ''}:${element.getAttribute('disabled') ?? ''}:${element.className}`,
            ),
          ),
      });
      const count = await page.locator('button,[role="button"]').count();
      for (let i = 0; i < count; i++) {
        const button = page.locator('button,[role="button"]').nth(i);
        if (!(await button.isVisible().catch(() => false))) continue;
        const label = (await button.innerText().catch(() => '')) || (await button.getAttribute('aria-label').catch(() => null)) || '';
        if (isDestructiveLabel(label)) {
          addFinding(findings, {
            category: 'live-wireup-boundary',
            status: 'blocked',
            note: `Skipped destructive control ${i}; live click would need a dedicated fixture contract. Label omitted from evidence.`,
          });
          continue;
        }
        try {
          const before = await state();
          await button.click({ timeout: 2_000 });
          await page.waitForTimeout(150);
          const after = await state();
          const changed =
            before.body !== after.body || before.url !== after.url || JSON.stringify(before.controls) !== JSON.stringify(after.controls);
          addFinding(findings, {
            category: 'live-wireup',
            status: changed ? 'pass' : 'fail',
            note: changed
              ? `Control ${i} changed rendered DOM, URL or control state.`
              : `Control ${i} had no observable DOM, URL or control-state change.`,
          });
        } catch {
          addFinding(findings, {
            category: 'live-wireup',
            status: 'blocked',
            note: `Control ${i} could not be clicked in the isolated build; the error value was omitted.`,
          });
        }
      }
    } finally {
      await app.close();
      rmSync(base, { recursive: true, force: true });
    }
  } catch {
    addFinding(findings, {
      category: 'live-wireup',
      status: 'blocked',
      note: 'Live app launch/click audit could not start; error details omitted to keep the report machine-path and secret free.',
    });
  }
}

async function main(): Promise<void> {
  const findings: AuditFinding[] = [];
  for (const file of trackedFiles(repoRoot()).filter((candidate) => /src\/renderer\/.*\.tsx$/u.test(relPath(candidate)))) {
    const rel = relPath(file);
    const text = readText(file);
    if (text === null) continue;
    for (const match of text.matchAll(CONTROL_RE)) {
      const tag = match[1] ?? 'control';
      const opening = match[0];
      const line = lineOf(text, match.index ?? 0);
      if (!EVENT_RE.test(opening)) {
        addFinding(findings, {
          category: 'control-without-event',
          status: 'candidate',
          path: rel,
          line,
          note: `<${tag}> has no inline event or href in its opening tag; inspect its wrapper and keyboard path.`,
        });
      } else if (NOOP_RE.test(opening)) {
        addFinding(findings, {
          category: 'no-op-handler',
          status: 'fail',
          path: rel,
          line,
          note: 'Control has a syntactically empty handler.',
        });
      } else if (EFFECT_RE.test(opening)) {
        addFinding(findings, {
          category: 'control-static-effect',
          status: 'pass',
          path: rel,
          line,
          note: 'Handler references a state, navigation, IPC or action verb.',
        });
      } else {
        addFinding(findings, {
          category: 'control-handler-review',
          status: 'candidate',
          path: rel,
          line,
          note: 'Handler exists but its effect is not statically classifiable; live click evidence is required.',
        });
      }
    }
    for (const match of text.matchAll(JSX_COPY_RE)) {
      addFinding(findings, {
        category: 'literal-ui-copy',
        status: 'candidate',
        path: rel,
        line: lineOf(text, match.index ?? 0),
        note: 'Literal JSX text candidate; verify the copy uses the translation function.',
      });
    }
  }
  await liveAudit(findings);
  const status = findings.some((finding) => finding.status === 'fail')
    ? 'fail'
    : findings.some((finding) => finding.status === 'candidate')
      ? 'candidate'
      : findings.some((finding) => finding.status === 'blocked')
        ? 'blocked'
        : 'pass';
  const outIndex = process.argv.indexOf('--out');
  output(result('pnpm exec tsx scripts/audit/wireup.ts', status, findings), outIndex >= 0 ? process.argv[outIndex + 1] : undefined);
}

void main().catch(() => {
  process.exitCode = 1;
});
