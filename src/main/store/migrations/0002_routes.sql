-- foo:foreign-keys-off
-- Spec: 08-0 §B.2 Route (5 values, X-125), 08-4 §25.1 PlanStep.route; 08-1 §4.2 (forward-only migrations). CR-0008 G-M4-03:
-- jobs.route and steps.route accept 'email' and 'handback'. SQLite cannot alter a CHECK, so both tables are rebuilt the
-- way https://sqlite.org/lang_altertable.html §7 says: foreign keys off (the first line tells migrate() to do that outside
-- the transaction), new table, copy, drop, rename, indexes back, then PRAGMA foreign_key_check (migrate()) before commit.
-- Every other column, default, check, foreign key and index is the 0001 text unchanged.
CREATE TABLE jobs_new (
  id                TEXT PRIMARY KEY,                      -- j_…
  chat_id           TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,   -- chat where it runs (helper chat after handoff)
  origin_chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,   -- where the user asked (job_link card lives there)
  owner_kind        TEXT NOT NULL CHECK (owner_kind IN ('foo','helper')),
  owner_id          TEXT REFERENCES helpers(id) ON DELETE RESTRICT,          -- owner_kind='helper' only
  title             TEXT NOT NULL,                          -- engine-built, ≤ 40 chars, e.g. "Booking Goa stay" (08-4 §26.2)
  origin            TEXT NOT NULL CHECK (origin IN ('user','routine','handoff','brief','setup','retry','system')),
  origin_ref        TEXT,                                   -- message id / routine id / parent job id (polymorphic, no FK)
  user_message_id   TEXT REFERENCES messages(id) ON DELETE RESTRICT,         -- bubble carrying the C1 badge
  intent            TEXT NOT NULL CHECK (intent IN ('read_only','do')),       -- Art. 3 (08-2 §5.3)
  do_verbs          TEXT NOT NULL DEFAULT '[]',             -- JSON Verb[] the user actually said: send, book, buy, pay, post, delete, add_calendar (X-55)
  state             TEXT NOT NULL CHECK (state IN ('queued','working','needs_you','waiting','done','done_unverified','failed','cancelled')),
  waiting_reason    TEXT CHECK (waiting_reason IN ('ai_offline','ai_down','ai_signed_out','ai_limit','spend_cap','net_offline','asleep','app_quit','windows_shutdown','opens_at') OR waiting_reason IS NULL),   -- WaitingReason (08-0 §B.2)
  wake_at           INTEGER,  -- epoch ms; set only when waiting_reason='opens_at'; the runner's tick moves the job to WORKING at wake_at (G1-1)
  needs_you_card_id TEXT REFERENCES cards(id) ON DELETE RESTRICT,
  plan_version      INTEGER NOT NULL DEFAULT 0,
  current_step_idx  INTEGER,
  step_count        INTEGER NOT NULL DEFAULT 0,
  route             TEXT CHECK (route IN ('api','browser','screen','email','handback') OR route IS NULL),   -- Route (08-0 §B.2)
  site_domain       TEXT,                                   -- current acting site (Art. 9)
  uses_browser      INTEGER NOT NULL DEFAULT 0,
  est_minutes       REAL, est_tokens INTEGER, est_cost_paise INTEGER,
  spent_tokens_in   INTEGER NOT NULL DEFAULT 0, spent_tokens_out INTEGER NOT NULL DEFAULT 0,
  spent_cost_paise  INTEGER NOT NULL DEFAULT 0, cost_unknown INTEGER NOT NULL DEFAULT 0,
  provider_id       TEXT,  ai_session_id TEXT,             -- ai_session_id never leaves main/engine (JobRow drops it)
  fail_streak       INTEGER NOT NULL DEFAULT 0,             -- consecutive failed tool calls (Art. 13)
  stuck_count       INTEGER NOT NULL DEFAULT 0,             -- times stuck card shown (J19.4 step 2)
  proof             TEXT,                                   -- JSON Proof (08-2 §5.8 union plus read_source, 08-0 §B.3); the proof chip renders from it
  result_message_id TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  stop_reason       TEXT CHECK (stop_reason IN ('user_word','user_button','stop_all','window_closed','stuck_stop','choice_timeout','signin_timeout',
                      'approval_expired','approval_declined','helper_deleted','chat_deleted','wipe','system') OR stop_reason IS NULL),   -- StopReason
  rev               INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, started_at INTEGER, last_progress_at INTEGER, finished_at INTEGER
);
INSERT INTO jobs_new SELECT * FROM jobs;
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX jobs_state ON jobs(state);
CREATE INDEX jobs_chat_state ON jobs(chat_id, state);

CREATE TABLE steps_new (
  id          TEXT PRIMARY KEY,                             -- s_…
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  idx         INTEGER NOT NULL,
  phrase_key  TEXT NOT NULL,                                -- from the step phrase catalogue (08-2 §5.4.3)
  slots       TEXT NOT NULL DEFAULT '{}',                   -- JSON, validated per phrase
  state       TEXT NOT NULL CHECK (state IN ('pending','running','done','failed','skipped','waiting_user')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  route       TEXT CHECK (route IN ('api','browser','screen','email','handback') OR route IS NULL),
  rev         INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER, finished_at INTEGER,
  UNIQUE (job_id, idx)
);
INSERT INTO steps_new SELECT * FROM steps;
DROP TABLE steps;
ALTER TABLE steps_new RENAME TO steps;
