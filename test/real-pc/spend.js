// Spec: project testing rule §4–10; test spend guards (Vikas 13 Nov 2026, "go with all 5"). Adds up what foo's real-AI
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS run by node on the CI runner, no bundler */
// turns cost in a runs folder, from the ai-turns.jsonl each journey leaves (foo-drive.js copyAiTurns). foo's own cost
// (cost_paise: reported by the Claude CLI, or priced from pricing.json) is used when it has one; otherwise the tokens are
// priced from the table below, and an unknown model is priced like the dearest one, so the cap errs on the safe side.
// Usage: node spend.js <runs dir> [--cap <usd>]   prints the USD spent; exit 4 when it is at or above the cap.
const fs = require('fs');
const path = require('path');

// USD per million tokens (input, output). Cache reads at a tenth of input, cache writes at 1.25× input.
const PRICE = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-4-5': [3, 15],
  'claude-haiku-4-5': [1, 5],
  'claude-opus-5-5': [4, 20],
};
const DEAREST = [4, 20];
const USD_TO_INR = Number(process.env.FOO_USD_INR || 88); // resources/pricing.json usdToInr

const priceOf = (model) => {
  if (!model) return DEAREST;
  const hit = Object.keys(PRICE).find((k) => String(model).startsWith(k));
  return hit ? PRICE[hit] : DEAREST;
};

/** USD for one ai_turns row. Pure, so a unit test can feed it rows. */
function turnUsd(r) {
  if (typeof r.cost_paise === 'number' && r.cost_source !== 'free') return r.cost_paise / (USD_TO_INR * 100);
  if (r.cost_source === 'free') return 0;
  const [i, o] = priceOf(r.model_reported);
  const tin = (r.tokens_in || 0) + (r.tokens_cache_read || 0) * 0.1 + (r.tokens_cache_write || 0) * 1.25;
  return (tin * i + (r.tokens_out || 0) * o) / 1e6;
}

function spentUsd(runsDir) {
  let usd = 0;
  if (!fs.existsSync(runsDir)) return 0;
  for (const d of fs.readdirSync(runsDir)) {
    const f = path.join(runsDir, d, 'ai-turns.jsonl');
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        usd += turnUsd(JSON.parse(line));
      } catch {
        // a torn line counts nothing; the next journey's file is still read
      }
    }
  }
  return usd;
}

module.exports = { turnUsd, spentUsd, priceOf };

if (require.main === module) {
  const [dir, flag, cap] = process.argv.slice(2);
  const usd = spentUsd(dir);
  console.log(usd.toFixed(4));
  if (flag === '--cap' && usd >= Number(cap)) process.exit(4);
}
