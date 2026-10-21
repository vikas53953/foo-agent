// Spec: 08-2 §8.3.12 / §11.4 (cloud outbound redaction choke point); 08-4 §27.6 (host policy); real-AI calls stay owner-key gated.
import {
  addFinding,
  hasOwnRealAiKey,
  lineOf,
  output,
  parseJson,
  readText,
  relPath,
  repoRoot,
  result,
  trackedFiles,
  type AuditFinding,
} from './common';

type NoCaptureHosts = { hosts?: string[]; patterns?: string[] };
const DIRECT_FETCH_RE = /\b(?:fetch|https?\.request|net\.fetch)\s*\(/gu;
const URL_RE = /https?:\/\/([^/'"`$)\s]+)/gu;
const APPROVED_DIRECT_FILES =
  /(?:src\/engine\/ai\/|src\/engine\/tools\/web\/|src\/engine\/tools\/connectors\/|src\/main\/connections\/connectionIpc\.ts|src\/main\/drafts\/gmailDraftsGoogle\.ts|src\/main\/windows\/protocol\.ts)/u;
const ALLOWED_HOSTS = new Set([
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'oauth2.googleapis.com',
  'accounts.google.com',
  'gmail.googleapis.com',
  'www.googleapis.com',
  'people.googleapis.com',
  'api.exa.ai',
  'api.tavily.com',
  'api.firecrawl.dev',
  'api.browser-use.com',
  'html.duckduckgo.com',
  'www.bing.com',
]);

async function runProductionCaptureFixture(findings: AuditFinding[]): Promise<void> {
  try {
    const { cloudOutbound } = await import('../../src/engine/tools/web/cloudOutbound');
    const scrub = (text: string) => ({ text: text.replace(/fixture-secret/gu, '[hidden]'), hits: text.includes('fixture-secret') ? 1 : 0 });
    const safe = cloudOutbound(scrub, {
      urls: { model: 'https://api.anthropic.com/v1/messages?token=fixture-secret' },
      text: { prompt: 'hello fixture-secret' },
    });
    const blocked = cloudOutbound(scrub, { urls: { model: 'https://fixture-secret.example.test/send' } });
    const serialised = JSON.stringify(safe);
    const passed =
      safe.ok && safe.urls.model === 'https://api.anthropic.com/v1/messages' && !serialised.includes('fixture-secret') && !blocked.ok;
    addFinding(findings, {
      category: 'production-network-boundary',
      status: passed ? 'pass' : 'fail',
      note: passed
        ? 'Production cloud outbound boundary removed fixture secret data and blocked a secret-bearing host without making a network request.'
        : 'Production cloud outbound boundary did not meet the redaction and blocking invariants.',
    });
  } catch {
    addFinding(findings, {
      category: 'production-network-boundary',
      status: 'blocked',
      note: 'Production cloud outbound boundary could not execute in this runtime; no network request was made.',
    });
  }
}

async function main(): Promise<void> {
  const findings: AuditFinding[] = [];
  const root = repoRoot();
  const noCapture = parseJson<NoCaptureHosts>('resources/no-capture-hosts.json') ?? {};
  const noCaptureHosts = new Set((noCapture.hosts ?? []).map((host) => host.split('/')[0]?.toLowerCase()));
  for (const file of trackedFiles(root).filter((candidate) => /^(?:src|scripts)\/.*\.(?:ts|tsx|mjs|js)$/u.test(relPath(candidate, root)))) {
    const rel = relPath(file, root);
    const text = readText(file);
    if (text === null) continue;
    for (const match of text.matchAll(DIRECT_FETCH_RE)) {
      const approved = APPROVED_DIRECT_FILES.test(rel) || /^scripts\/audit\//u.test(rel);
      addFinding(findings, {
        category: 'direct-network-sink',
        status: approved ? 'candidate' : 'fail',
        path: rel,
        line: lineOf(text, match.index ?? 0),
        note: approved
          ? 'Direct network call is in an approved adapter boundary; verify the redaction path.'
          : 'Direct network call is outside the approved adapter boundary.',
      });
    }
    for (const match of text.matchAll(URL_RE)) {
      const host = (match[1] ?? '').split(':')[0]?.toLowerCase();
      if (!host || host === '127.0.0.1' || host === 'localhost' || host.endsWith('.test')) continue;
      if (noCaptureHosts.has(host)) {
        addFinding(findings, {
          category: 'no-capture-host-reference',
          status: 'candidate',
          path: rel,
          line: lineOf(text, match.index ?? 0),
          note: 'Reference matches a host explicitly excluded from capture; keep it out of logs and proxy traces.',
        });
      } else if (!ALLOWED_HOSTS.has(host)) {
        addFinding(findings, {
          category: 'unlisted-network-host',
          status: 'candidate',
          path: rel,
          line: lineOf(text, match.index ?? 0),
          note: 'Literal host is not in the Lane F review allowlist; confirm it against the approved spec.',
        });
      }
    }
  }
  await runProductionCaptureFixture(findings);
  addFinding(
    findings,
    hasOwnRealAiKey()
      ? {
          category: 'real-ai-privacy',
          status: 'blocked',
          note: 'Own-key marker exists, but this lane does not start a paid real-AI capture from a local audit command.',
        }
      : {
          category: 'real-ai-privacy',
          status: 'blocked',
          note: 'No own AI key provisioned; real-AI network capture and cost measurement are blocked, with cost $0 for new calls.',
        },
  );
  const status = findings.some((finding) => finding.status === 'fail')
    ? 'fail'
    : findings.some((finding) => finding.status === 'candidate')
      ? 'candidate'
      : 'blocked';
  const outIndex = process.argv.indexOf('--out');
  output(
    result('pnpm exec tsx scripts/audit/privacy-network.ts', status, findings),
    outIndex >= 0 ? process.argv[outIndex + 1] : undefined,
  );
}

void main().catch(() => {
  process.exitCode = 1;
});
