// ART-24a (10-2 §D, Article 24): no raw hex, rgb(), px, ms or font family in styles and components outside the token file.
// Allowed literals: 0, 1px and 1.5px borders (02 F4), 100 %, 50 %. A one-component local value needs `/* local: … */` (02-3 §F29.5).
import { describe, expect, it } from 'vitest';
import { files, read } from './scan';

const TOKEN_FILE = 'src/renderer/styles/tokens.css';
const sources = files('src/renderer', /\.(css|tsx?)$/).filter((p) => !p.replaceAll('\\', '/').endsWith(TOKEN_FILE));

const RAW = [
  { name: 'hex colour', re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()/hsl()', re: /\b(?:rgba?|hsla?)\(/g },
  { name: 'px', re: /(?<![\w.-])(?!1px\b|1\.5px\b|0px\b)\d+(?:\.\d+)?px\b/g },
  { name: 'ms/s duration', re: /(?<![\w.-])\d+(?:\.\d+)?m?s\b/g },
  { name: 'font family', re: /font-family\s*:|fontFamily\s*:/g },
];

describe('ART-24a token scan', () => {
  it('finds the renderer sources', () => expect(sources.length).toBeGreaterThan(3));
  it.each(sources)('%s uses tokens only', (file) => {
    const hits: string[] = [];
    read(file)
      .split('\n')
      .forEach((line, i) => {
        if (/\/\* local: /.test(line) || /^\s*(\/\/|\/\*|\*)/.test(line)) return;
        for (const { name, re } of RAW) for (const m of line.matchAll(re)) hits.push(`${file}:${i + 1} ${name}: ${m[0]}`);
      });
    expect(hits).toEqual([]);
  });
});
