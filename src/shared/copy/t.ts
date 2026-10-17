// Spec: 08-0 §D (copy storage, X-59). Same function in renderer, main and engine.
import { IntlMessageFormat } from 'intl-messageformat';
import copy from './en-IN.json';

export type CopyKey = keyof typeof copy;
export type CopyVars = Record<string, string | number>;

const cache = new Map<CopyKey, IntlMessageFormat>();

export function t(key: CopyKey, vars?: CopyVars): string {
  let fmt = cache.get(key);
  if (!fmt) {
    const source = (copy as Record<string, string>)[key];
    if (source === undefined) throw new Error(`Missing copy key: ${key}`);
    fmt = new IntlMessageFormat(source, 'en-IN');
    cache.set(key, fmt);
  }
  return String(fmt.format(vars));
}
