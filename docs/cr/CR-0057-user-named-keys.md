# CR-0057: a key or password the user names is saved as `foo/user_key/{name}`

- **Asked by:** Vikas, 2026-10-24 09:06Z, on the decision card "How should 'Password or key' save a key you type in?". He picked "Add a Name field, new vault slot".
- **Why:** the Secret box from "Password or key" in the + menu (04-2) opened, but its Save said "I don't have a safe place
  for this one yet, so I didn't save it." This was journey U13 in the real-AI runs on main c17269d and 3bfb97a. A password
  or unknown key moved from the composer (04-2 §22.4) hit the same wall. 04-2 says the box has "an empty name field", but
  no vault name existed for a key the user names, because 08-0 §E.8 names keys by provider and logins by host.
- **Spec sections:** 08-0 §B.2 `SecretKind`, §E.8 vault names, §G.1 `secret.secretKind`; 08-1 §4.3 `secrets_index`
  (migration 0005) and the `secret` card payload; 08-2 §11.2 storage table and `secretKind` → storage; 05-2 §5.8.4 variants
  and field errors; 04-2 "Password or key" row; 10-acceptance-2 new AT-447; `spec/trace.csv` one row; DECISIONS X-214.
- **Status:** Approved by Vikas, DECISIONS X-214 (his pick on the decision card, 2026-10-24 09:06Z).
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-447` → `test/unit/vault/secretIpc.test.ts` (M9, live). The offer and save tests failed before this change: the box was
`ai_key` with no vault name, and `secret:save` refused `user_key`. They pass after it. `test/e2e/m5-secret.spec.ts` drives
the + menu and the moved password through the real window. Before this change its moved-password test asserted the refusal.

## (b) Spec before → after

| #   | Where                    | Before                                  | After                                                                                                                 |
| --- | ------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | 08-0 §B.2 `SecretKind`   | 7 kinds                                 | adds `user_key`                                                                                                       |
| 2   | 08-0 §E.8                | `… foo/login/{host}, foo/card/{last4}`  | adds `foo/user_key/{name}`: the typed name, 1 to 40 characters, made safe, lower case, spaces and dots → `-`          |
| 3   | 08-0 §G.1                | `secret.secretKind` ∈ 7 values          | adds `user_key`                                                                                                       |
| 4   | 08-1 §4.3                | `secrets_index.kind` CHECK with 7 kinds | adds `'user_key'` (migration 0005 rebuilds the table, as 0002 and 0004 did for theirs); `secret` payload union too    |
| 5   | 08-2 §11.2               | no row for a user-named key             | row: Credential Manager only, `foo/user_key/{name}`, UTF-8, no `vault.use` purpose reads it                           |
| 6   | 05-2 §5.8.4              | no variant for a named key              | Your key (`user_key`): Name + masked value; saved line "{GitHub key} saved securely. {agentName}'s AI never sees it." |
| 7   | 05-2 §5.8.4 field errors | three errors                            | adds "Give it a name, like GitHub key." and "Keep the name to 40 characters."                                         |
| 8   | 04-2 "Password or key"   | "… with an empty name field."           | "… with an empty name field (the Your key variant, 05-2 §5.8.4, CR-0057)."                                            |
| 9   | 10-2                     | (none)                                  | AT-447                                                                                                                |

## (c) Picks where the spec is silent

1. **Field order.** Name first, then the masked value. 04-2 §22.4 already says focus moves to the card's name field after
   Move to secret box, and the + menu box reads top to bottom.
2. **Name rules.** 1 to 40 characters with a letter or digit. The vault name is `safeName` of the typed name, lower case,
   with spaces and dots turned into `-` ("GitHub key" → `github-key`). The label keeps the name as typed (inner spaces
   collapsed), so the saved row and the activity line read "GitHub key".
3. **Same name again replaces.** Like every kind except cards (X-129), it logs "Replaced your {name}".
4. **Credential Manager only.** A blob file is named by `{name}` alone (09 §9.18), so a user name like `exa` could clash
   with another kind's blob. A value over 2,560 bytes is refused, which no typed password or key reaches.
5. **No reader yet.** No `vault.use` purpose maps to `user_key`, so a saved key is stored and listed but never used. Using
   one in a job (for example, a GitHub key for a GitHub step) needs its own CR. Until then the AI sees only the name
   (05-2 §5.8.5 rule 2).
6. **Copy.** Six new keys in `en-IN.json`: the Name and "Password or key" field labels, the placeholder, the two field
   errors and the saved line. The real-PC journey U13 types a name ("Test key") before the key.

## (d) Review

Two independent reviews before merge (secrets need two). Findings and fixes are listed in the PR.
