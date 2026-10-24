-- Spec: CR-0057 (X-214) 08-0 §B.2 SecretKind and 08-1 §4.3 secrets_index; 08-1 §4.2 (forward-only migrations).
-- secrets_index.kind gains 'user_key' (a key the user names from the Secret box, `foo/user_key/{name}`). SQLite cannot alter
-- a CHECK, so the table is rebuilt (https://sqlite.org/lang_altertable.html §7): new table, copy, drop, rename. No foreign key
-- or index points at it. Every other column, check and constraint is the 0001 text unchanged.
CREATE TABLE secrets_index_new (
  target     TEXT PRIMARY KEY,                              -- 'foo/{kind}/{name}' exactly per 08-0 §E.8; WhatsApp: 'vault\wa-session.bin'
  kind       TEXT NOT NULL CHECK (kind IN ('ai_key','login','card','conn_token','wa_session','web_key','hub_key','user_key')),   -- SecretKind
  name       TEXT NOT NULL,                                 -- the {name} part: providerId | host | last4 | google | outlook | exa… | composio | whatsapp | user key name
  label      TEXT NOT NULL,                                 -- user-facing, e.g. "Visa ••4242", "OpenAI key", "GitHub key"
  domain TEXT, brand TEXT, last4 TEXT,
  storage    TEXT NOT NULL CHECK (storage IN ('credman','blob')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used_at INTEGER,
  UNIQUE (kind, name)
);   -- NEVER a value column (Art. 8)
INSERT INTO secrets_index_new SELECT target, kind, name, label, domain, brand, last4, storage, created_at, updated_at, last_used_at
  FROM secrets_index;
DROP TABLE secrets_index;
ALTER TABLE secrets_index_new RENAME TO secrets_index;
