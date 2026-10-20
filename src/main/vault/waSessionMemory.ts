// Spec: 08-3 §16.4 (each `wa.creds` is encrypted by main to `{DATA}\vault\wa-session.bin`; decrypted at bridge start),
// 08-1 §2.4 (`vault.encrypt` / `vault.decrypt` with blobRef 'wa-session'), 08-0 §E.8, 06-3 C-11 (Unlink deletes the file).
// Until M5's SecretVault lands, the WhatsApp session is held in memory behind this interface and never written to disk (a
// restart means scanning again); the swap to safeStorage + wa-session.bin is a "needs M5" line in the M8 ticket map.
export interface WaSessionStore {
  read(): Uint8Array | null;
  write(bytes: Uint8Array): void;
  delete(): void;
}

export function memoryWaSession(): WaSessionStore {
  let bytes: Uint8Array | null = null;
  return {
    read: () => bytes,
    write: (b) => {
      bytes = new Uint8Array(b);
    },
    delete: () => {
      bytes = null;
    },
  };
}
