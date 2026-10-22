// Spec: project testing rule §6 (real AI on Vikas's ANTHROPIC_API_KEY secret) and Test-First Pipeline G5 (a monthly
// real-AI spend cap with an alert). Prices what one real-AI CI part spent from the AI CLI's own transcripts, and sums a
// month's ledger (real-ai/spend/<YYYY-MM>.tsv on the evidence branch) against test/real-pc/budget.json.
// Runs under plain Node (type stripping), so the workflow needs no install:
//   node --experimental-strip-types scripts/real-ai-budget.ts measure --ai claude --journeys 12 --run 123 --part r1-s0
//   node --experimental-strip-types scripts/real-ai-budget.ts check <ledger.tsv>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Price = { in: number; out: number; cacheWrite: number; cacheRead: number };
export type Budget = {
  monthlyCapInr: number;
  alertAtPercent: number;
  usdToInr: number;
  fallbackUsdPerJourney: number;
  pricesUsdPerMTok: Record<string, Price>;
};
export type Usage = { model: string; input: number; output: number; cacheWrite: number; cacheRead: number };
export const LEDGER_HEADER = 'time\trun\tai\tpart\tjourneys\tusd\tsource';

export function readBudget(text: string): Budget {
  const b = JSON.parse(text) as Budget;
  const nums = [b.monthlyCapInr, b.alertAtPercent, b.usdToInr, b.fallbackUsdPerJourney];
  if (nums.some((n) => typeof n !== 'number' || !(n >= 0))) throw new Error('budget.json: cap, alert, rate and fallback must be numbers');
  if (!b.pricesUsdPerMTok?.['*']) throw new Error('budget.json: pricesUsdPerMTok needs a "*" row for unknown models');
  return b;
}

/** The exact model, else the longest listed name the model starts with, else "*" (the dearest row, so nothing slips). */
export function priceFor(budget: Budget, model: string): Price {
  const p = budget.pricesUsdPerMTok;
  if (p[model]) return p[model];
  const prefix = Object.keys(p)
    .filter((k) => k !== '*' && model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return p[prefix ?? '*']!;
}

export function costUsd(budget: Budget, usages: Usage[]): number {
  return usages.reduce((sum, u) => {
    const p = priceFor(budget, u.model);
    return sum + (u.input * p.in + u.output * p.out + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / 1e6;
  }, 0);
}

/**
 * Claude Code transcripts (~/.claude/projects/<dir>/<session>.jsonl): one line per assistant content block, each
 * repeating its message's usage, so a message counts once (by message id).
 */
export function claudeUsage(jsonl: string[]): Usage[] {
  const seen = new Set<string>();
  const out: Usage[] = [];
  for (const text of jsonl)
    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue;
      let e: { type?: string; message?: { id?: string; model?: string; usage?: Record<string, number> } };
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      const m = e.message;
      if (e.type !== 'assistant' || !m?.usage || !m.model || m.model === '<synthetic>') continue;
      if (m.id) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
      }
      const u = m.usage;
      out.push({
        model: m.model,
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
      });
    }
  return out;
}

/** Codex session logs (~/.codex/sessions/**\/*.jsonl): the last running total of each session. */
export function codexUsage(jsonl: string[]): Usage[] {
  const out: Usage[] = [];
  for (const text of jsonl) {
    let model = 'codex-unknown';
    let total: Record<string, number> | undefined;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let e: { type?: string; payload?: { type?: string; model?: string; info?: { total_token_usage?: Record<string, number> } } };
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      if (e.type === 'turn_context' && e.payload?.model) model = e.payload.model;
      if (e.payload?.type === 'token_count' && e.payload.info?.total_token_usage) total = e.payload.info.total_token_usage;
    }
    if (!total) continue;
    const cached = total.cached_input_tokens ?? 0;
    out.push({ model, input: (total.input_tokens ?? 0) - cached, output: total.output_tokens ?? 0, cacheWrite: 0, cacheRead: cached });
  }
  return out;
}

/** One ledger row. No usage found while journeys ran = the flat per-journey estimate, marked so, never zero. */
export function ledgerRow(
  budget: Budget,
  r: { time: string; run: string; ai: string; part: string; journeys: number; usages: Usage[] },
): string {
  const measured = costUsd(budget, r.usages);
  const estimated = r.usages.length === 0 && r.journeys > 0;
  const usd = estimated ? r.journeys * budget.fallbackUsdPerJourney : measured;
  return [r.time, r.run, r.ai, r.part, r.journeys, usd.toFixed(4), estimated ? 'estimate' : 'transcripts'].join('\t');
}

export type Spend = { spentUsd: number; spentInr: number; capInr: number; percent: number; state: 'ok' | 'alert' | 'over'; runs: number };

export function monthSpend(budget: Budget, ledger: string): Spend {
  const rows = ledger
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim() && l !== LEDGER_HEADER);
  const spentUsd = rows.reduce((s, l) => s + (Number(l.split('\t')[5]) || 0), 0);
  const spentInr = Math.round(spentUsd * budget.usdToInr);
  const percent = budget.monthlyCapInr > 0 ? Math.round((spentInr / budget.monthlyCapInr) * 100) : 100;
  const state = spentInr >= budget.monthlyCapInr ? 'over' : percent >= budget.alertAtPercent ? 'alert' : 'ok';
  return {
    spentUsd: Number(spentUsd.toFixed(2)),
    spentInr,
    capInr: budget.monthlyCapInr,
    percent,
    state,
    runs: new Set(rows.map((l) => l.split('\t')[1])).size,
  };
}

function jsonlUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? jsonlUnder(p) : n.endsWith('.jsonl') ? [readFileSync(p, 'utf8')] : [];
  });
}

function main(argv: string[]): number {
  const opt = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const budget = readBudget(readFileSync(opt('--budget') ?? 'test/real-pc/budget.json', 'utf8'));
  if (argv[0] === 'measure') {
    const ai = opt('--ai') ?? 'claude';
    const home = opt('--home') ?? homedir();
    const usages =
      ai === 'claude'
        ? claudeUsage(jsonlUnder(join(home, '.claude', 'projects')))
        : codexUsage(jsonlUnder(join(home, '.codex', 'sessions')));
    const row = ledgerRow(budget, {
      time: new Date().toISOString(),
      run: opt('--run') ?? 'local',
      ai,
      part: opt('--part') ?? 's0',
      journeys: Number(opt('--journeys') ?? 0),
      usages,
    });
    console.log(row);
    return 0;
  }
  if (argv[0] === 'check' && argv[1]) {
    const ledger = existsSync(argv[1]) ? readFileSync(argv[1], 'utf8') : '';
    console.log(JSON.stringify(monthSpend(budget, ledger)));
    return 0;
  }
  console.error('usage: real-ai-budget.ts measure --ai claude|chatgpt --journeys N --run ID --part P | check <ledger.tsv>');
  return 2;
}

if (process.argv[1]?.endsWith('real-ai-budget.ts')) process.exit(main(process.argv.slice(2)));
