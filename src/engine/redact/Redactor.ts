// Spec: 08-0 §G.6 / 08-2 §11.4 (X-72, G-M5-06): the Redactor is one module, src/shared/redactor.ts, instantiated in main and
// in the engine. The engine keeps no copy of its own; this file only gives the engine's callers their old import path.
export { HIDDEN, normalisedForms, Redactor, SecretRegistry, extraSpans, type LogFn, type RegistryEntry } from '../../shared/redactor';
