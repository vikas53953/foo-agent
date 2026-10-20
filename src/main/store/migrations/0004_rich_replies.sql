-- foo:foreign-keys-off
-- Spec: CR-0022 (X-180) §(b) 08-1 §4.3 and 08-0 §G.1; 08-1 §4.2 (forward-only migrations). Three changes:
-- 1. cards.type gains 'kit' and 'ai_page' (25 → 27 card types). SQLite cannot alter a CHECK, so cards is rebuilt the way
--    0002 rebuilt jobs and steps (https://sqlite.org/lang_altertable.html §7): foreign keys off, new table, copy, drop,
--    rename, indexes back, then PRAGMA foreign_key_check (migrate()) before commit. Every other column, default, check,
--    foreign key and index is the 0001 text unchanged.
-- 2. messages.side (pick 6): 1 marks a side question ("Ask about this") and foo's answer to it; reply_to_id says what it is
--    about. One NOT NULL column with a default, no rebuild.
-- 3. kept_items (pick 9): a kit surface or AI page the user kept. The body file holds the A2UI JSON or the `.foopage` blob,
--    the PNG is its snapshot; both live under {DATA}. A kept page reopens only in the sealed box.
CREATE TABLE cards_new (
  id            TEXT PRIMARY KEY,                          -- k_…
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  type          TEXT NOT NULL CHECK (type IN ('brief','checklist','choice','tiles','approval','payment','bill','draft','secret','signin',
                  'connect','plan','routine','routine_offer','stuck','error','spend_cap','table','file','link_preview','job_link','place',
                  'face_explainer','catch_up','setup','kit','ai_page')),   -- CardType, exactly the 27 values of 08-0 §G.1 (X-56, X-119, X-180)
  state         TEXT NOT NULL,                             -- exactly 08-0 §G.2 for the type (approval/payment: ApprovalState); zod-checked on every write (§4.5.1)
  payload       TEXT NOT NULL,                             -- JSON CardPayload for the type (§4.5); never a secret value
  answer        TEXT,                                      -- JSON CardAnswer
  nonce         TEXT NOT NULL,
  expires_at    INTEGER,
  resolved_by   TEXT CHECK (resolved_by IN ('tap','keyboard','toast','typed','reaction','auto','system') OR resolved_by IS NULL),
  resolved_at   INTEGER,
  supersedes_id TEXT REFERENCES cards(id) ON DELETE RESTRICT,   -- the card this one replaces (that card's state becomes superseded)
  rev           INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
INSERT INTO cards_new SELECT * FROM cards;
DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;
CREATE INDEX cards_open ON cards(state, expires_at);
CREATE INDEX cards_chat ON cards(chat_id, created_at DESC);
CREATE INDEX cards_message ON cards(message_id);
CREATE INDEX cards_job ON cards(job_id);                   -- X-129

ALTER TABLE messages ADD COLUMN side INTEGER NOT NULL DEFAULT 0 CHECK (side IN (0, 1));

CREATE TABLE kept_items (
  id          TEXT PRIMARY KEY,                            -- ki_…
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  message_id  TEXT REFERENCES messages(id) ON DELETE RESTRICT,   -- an inline surface or page in a reply
  card_id     TEXT REFERENCES cards(id) ON DELETE RESTRICT,      -- a `kit` or `ai_page` card
  kind        TEXT NOT NULL CHECK (kind IN ('kit','page')),
  title       TEXT NOT NULL,
  body_path   TEXT NOT NULL,                               -- absolute, under {DATA}: A2UI JSON or the .foopage blob, never .html
  png_path    TEXT,                                        -- absolute, under {DATA}: the snapshot
  created_at  INTEGER NOT NULL,
  CHECK ((message_id IS NULL) <> (card_id IS NULL))
);
CREATE INDEX kept_items_chat ON kept_items(chat_id, created_at DESC);
