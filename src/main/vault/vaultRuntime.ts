// Spec: 08-3 §22.2 (injected dependencies: the Vault is in-memory in FOO_TEST runs, same API, same purpose checks), 08-2
// §11.7 (one SecretVault in main). Main builds the vault once at startup (src/main/index.ts) and the secret channels and the
// engine's `vault.use` read it from here.
import type { CardRow } from '../../shared/types';
import type { RegisterFn, SecretVault } from './SecretVault';

export interface VaultRuntime {
  vault: SecretVault;
  register: RegisterFn;
  now(): number;
  emitCard(row: CardRow): void;
  emitMessage(messageId: string): void;
  emitChat(chatId: string): void;
}

let current: VaultRuntime | null = null;

export function installVault(rt: VaultRuntime): void {
  current = rt;
}

export function vaultRuntime(): VaultRuntime | null {
  return current;
}
