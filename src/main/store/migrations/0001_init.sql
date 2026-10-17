-- Spec: 08-functions-and-engine-1 §4.3, copied verbatim (the migration test compares it with the vendored spec). Forward-only: never edit; add 0002_*.sql.
-- 4.3.1 Chats
CREATE TABLE chats (
  id               TEXT PRIMARY KEY,                       -- c_…
  kind             TEXT NOT NULL CHECK (kind IN ('foo','helper','group','wa_mirror')),
  helper_id        TEXT REFERENCES helpers(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,   -- kind='helper' only
  title            TEXT NOT NULL,                          -- display name ({agentName}, helper name, group name, WA chat name)
  avatar_ref       TEXT,                                   -- FaceRef (§0.6); NULL = the kind's default face
  color_token      TEXT,                                   -- '--h-teal' etc (02 F2)
  wa_jid           TEXT,                                   -- kind='wa_mirror' only
  pinned           INTEGER NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0,             -- 1 only for a wa_mirror hidden with 06-3 C-8 (`chat:archive`)
  unread_count     INTEGER NOT NULL DEFAULT 0,
  pill             TEXT CHECK (pill IN ('needs_you','working','done','paused') OR pill IS NULL),  -- derived by main from the job/card writes (§4.6 rule 7, X-129; Art. 12)
  pill_until       INTEGER,                                -- 'done' fades after 24 h (J App. A)
  last_message_id  TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  last_activity_at INTEGER NOT NULL,
  next_seq         INTEGER NOT NULL DEFAULT 1,
  rev              INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  deleted_at       INTEGER,
  private          INTEGER NOT NULL DEFAULT 0,  -- R31; only with kind='foo'; at most one live row with private=1 (12-2 §12.30)
  helper_messages_since_user INTEGER NOT NULL DEFAULT 0,  -- group loop guard (08-3 §17.3.4)
  loop_paused      INTEGER NOT NULL DEFAULT 0,
  CHECK ((kind = 'helper') = (helper_id IS NOT NULL)),
  CHECK ((kind = 'wa_mirror') = (wa_jid IS NOT NULL))
);   -- no draft column (drafts table, X-69); no mute column (settings.notifications.mutedChats is the only mute store, 08-0 §A)
CREATE INDEX chats_activity ON chats(archived, pinned DESC, last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX chats_kind ON chats(kind);
CREATE UNIQUE INDEX chats_one_private ON chats(private) WHERE private = 1 AND deleted_at IS NULL;
-- Rule: "foo's chat" everywhere = kind='foo' AND private=0.

CREATE TABLE group_members (
  chat_id   TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  member_id TEXT NOT NULL,                                 -- helper id or 'foo' (no FK: 'foo' is not a row)
  role      TEXT NOT NULL CHECK (role IN ('owner','member')),
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (chat_id, member_id)
);

-- 4.3.2 Messages, reactions, composer drafts
CREATE TABLE messages (
  id            TEXT PRIMARY KEY,                          -- m_…
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  seq           INTEGER NOT NULL,                          -- per-chat order, from chats.next_seq
  author_kind   TEXT NOT NULL CHECK (author_kind IN ('user','foo','helper','system')),
  author_id     TEXT REFERENCES helpers(id) ON DELETE RESTRICT,   -- author_kind='helper' only
  kind          TEXT NOT NULL CHECK (kind IN ('text','voice','card','marker')),   -- 08-0 §G.1; brief, job link and error are cards
  marker_kind   TEXT CHECK (marker_kind IN ('start_of_chat','handoff','memory_chip','helper_notice','system_line') OR marker_kind IS NULL),
  client_id     TEXT,                                      -- message:send idempotency key (user messages only)
  text          TEXT NOT NULL DEFAULT '',                  -- REDACTED display text (Art. 8)
  text_for_ai   TEXT,                                      -- only when different, e.g. "[the user typed a secret; it was hidden]" (C8); never leaves main/engine
  status        TEXT NOT NULL CHECK (status IN ('queued','sent','streaming','complete','failed')),
  badge         TEXT CHECK (badge IN ('seen','working','waiting','done','done_unverified','failed','stopped') OR badge IS NULL),  -- BadgeValue, user msgs (08-0 §F)
  reply_to_id   TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,                          -- job this message started / belongs to
  card_id       TEXT REFERENCES cards(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,   -- kind='card' only
  lang          TEXT,                                      -- detected language tag of user text ('en','hi','pa','mixed'); written by main's Store with the 02-3 §F24 script rule (08-4 §25.7); the AI never sends it
  voice_path    TEXT, voice_ms INTEGER, transcript TEXT, transcript_conf REAL,
  attachments   TEXT,                                      -- JSON Attachment[] (id, name, mime, bytes, path); user attachments ride on 'text'
  prompted      INTEGER NOT NULL DEFAULT 1,                -- 0 = unprompted (counts toward budget)
  why           TEXT,                                      -- JSON { source: 'routine_asked'|'routine_suggested'|'suggestion'|'habit_offer'|'housekeeping'|'cap_warning'; routineId?; suggestionKey?; vars } (08-0 §G.17); drives the "Why am I getting this?" footer (Art. 19); 'cap_warning' is written when the 80 % cap warning is posted (money.warnAt80)
  pinned        INTEGER NOT NULL DEFAULT 0,                -- "Keep this voice note" (08-3 §18.3); voice retention skips pinned rows
  provider_note TEXT,                                      -- e.g. 'answered with ChatGPT while Claude rests' (J19.2)
  rev           INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  edited_at     INTEGER,
  deleted_at    INTEGER,
  UNIQUE (chat_id, seq),
  CHECK ((kind = 'marker') = (marker_kind IS NOT NULL)),
  CHECK ((kind = 'card') = (card_id IS NOT NULL)),
  CHECK (why IS NULL OR json_extract(why, '$.source') IN ('routine_asked','routine_suggested','suggestion','habit_offer','housekeeping','cap_warning'))
);
CREATE INDEX messages_job ON messages(job_id);
CREATE INDEX messages_chat_time ON messages(chat_id, created_at);
CREATE UNIQUE INDEX messages_client ON messages(chat_id, client_id) WHERE client_id IS NOT NULL;
CREATE VIRTUAL TABLE messages_fts USING fts5(text, transcript, content='messages', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-'");
CREATE TRIGGER messages_ai AFTER INSERT ON messages WHEN new.deleted_at IS NULL AND (SELECT private FROM chats WHERE id = new.chat_id) = 0 BEGIN
  INSERT INTO messages_fts(rowid, text, transcript) VALUES (new.rowid, new.text, new.transcript); END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text, transcript) VALUES ('delete', old.rowid, old.text, old.transcript); END;
CREATE TRIGGER messages_au AFTER UPDATE OF text, transcript, deleted_at ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text, transcript) SELECT 'delete', old.rowid, old.text, old.transcript WHERE old.deleted_at IS NULL
    AND (SELECT private FROM chats WHERE id = old.chat_id) = 0;
  INSERT INTO messages_fts(rowid, text, transcript) SELECT new.rowid, new.text, new.transcript WHERE new.deleted_at IS NULL
    AND (SELECT private FROM chats WHERE id = new.chat_id) = 0; END;   -- private chats are never indexed (08-0 §G.17)

CREATE TABLE reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  by         TEXT NOT NULL,                                -- 'user' | 'foo' | helper id
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, by, emoji)
);

CREATE TABLE drafts (                                      -- composer drafts, one row per chat (X-69, 08-0 §G.11, DB-05)
  id                   TEXT PRIMARY KEY,                   -- dr_…
  chat_id              TEXT NOT NULL UNIQUE REFERENCES chats(id) ON DELETE RESTRICT,
  text                 TEXT NOT NULL DEFAULT '',           -- REDACTED; mentions stored as @{helperId}
  attachments          TEXT NOT NULL DEFAULT '[]',         -- JSON Attachment[]; files under {DATA}\data\drafts\{chatId}\
  reply_to_id          TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  link_preview_removed INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL
);   -- written by main from composer:saveDraft; deleted (row + files) when the message is sent or the draft is emptied

-- 4.3.3 Cards (one row per card; the message row of kind 'card' points here)
-- Insert order in one db.tx: messages row (kind 'card', card_id = pre-generated k_ id) → cards row.
CREATE TABLE cards (
  id            TEXT PRIMARY KEY,                          -- k_…
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  type          TEXT NOT NULL CHECK (type IN ('brief','checklist','choice','tiles','approval','payment','bill','draft','secret','signin',
                  'connect','plan','routine','routine_offer','stuck','error','spend_cap','table','file','link_preview','job_link','place',
                  'face_explainer','catch_up','setup')),   -- CardType, exactly the 25 values of 08-0 §G.1 (X-56, X-119)
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
CREATE INDEX cards_open ON cards(state, expires_at);
CREATE INDEX cards_chat ON cards(chat_id, created_at DESC);
CREATE INDEX cards_message ON cards(message_id);
CREATE INDEX cards_job ON cards(job_id);                   -- X-129

-- 4.3.4 Jobs, steps, tool calls (08-2 §5)
CREATE TABLE jobs (
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
  route             TEXT CHECK (route IN ('api','browser','screen') OR route IS NULL),   -- Route (08-0 §B.2)
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
CREATE INDEX jobs_state ON jobs(state);
CREATE INDEX jobs_chat_state ON jobs(chat_id, state);

CREATE TABLE steps (
  id          TEXT PRIMARY KEY,                             -- s_…
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  idx         INTEGER NOT NULL,
  phrase_key  TEXT NOT NULL,                                -- from the step phrase catalogue (08-2 §5.4.3)
  slots       TEXT NOT NULL DEFAULT '{}',                   -- JSON, validated per phrase
  state       TEXT NOT NULL CHECK (state IN ('pending','running','done','failed','skipped','waiting_user')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  route       TEXT CHECK (route IN ('api','browser','screen') OR route IS NULL),
  rev         INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER, finished_at INTEGER,
  UNIQUE (job_id, idx)
);

CREATE TABLE tool_calls (
  id              TEXT PRIMARY KEY,                         -- tc_…
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  step_id         TEXT REFERENCES steps(id) ON DELETE RESTRICT,
  turn_id         TEXT REFERENCES ai_turns(id) ON DELETE RESTRICT,
  tool            TEXT NOT NULL,                            -- ToolName, 'browser.click' etc (08-2 §8.2)
  action_class    TEXT NOT NULL,                            -- 08-2 §9.2
  side_effect     INTEGER NOT NULL,                         -- 1 if not read-only
  idem_key        TEXT UNIQUE,                              -- side_effect=1 only; derivation below; UNIQUE(idem_key) (X-113)
  args            TEXT NOT NULL,                            -- JSON, REDACTED
  result          TEXT,                                     -- JSON summary, REDACTED, ≤ 16 KB
  observation_ref TEXT,                                     -- snapshot id / screenshot path
  gate            TEXT NOT NULL CHECK (gate IN ('auto','approved','rule','blocked','handed_back')),
  approval_id     TEXT REFERENCES approvals(id) ON DELETE RESTRICT,
  outcome         TEXT CHECK (outcome IN ('ok','error','cancelled','unknown') OR outcome IS NULL),
  error_kind      TEXT,                                     -- ErrorKind
  started_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE INDEX tool_calls_job ON tool_calls(job_id, started_at);
CREATE INDEX tool_calls_step ON tool_calls(step_id);
-- idem_key = sha256(jobId + '|' + stepId + '|' + tool + '|' + canonicalJson(args) + '|' + (approvalId ?? '')), hex, for every side_effect=1 call
-- (X-113; canonicalJson = §0.6.1). A replayed step reuses the stored row with outcome 'ok' (§4.6 rule 6).
-- Retention (X-129): 7 days after jobs.finished_at, args → '{}', result → NULL, observation_ref → NULL; hard-deleted by main's housekeeping
-- 90 days after finished_at (terminal jobs only, §4.6 rule 3).
-- The ToolLayer refuses a second call with the same idem_key in the same job (IDEMPOTENT_REPEAT, internal) unless a read tool has run
-- in that job since the first call (08-2 §5.9 step 5).

-- 4.3.5 AI turns (cost accounting, 08-2 §5.10)
CREATE TABLE ai_turns (
  id              TEXT PRIMARY KEY,                         -- t_…
  chat_id         TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  job_id          TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  routine_id      TEXT REFERENCES routines(id) ON DELETE RESTRICT,
  purpose         TEXT NOT NULL CHECK (purpose IN ('chat','intake','step','repair','second_look','memory_review','tidy','routine','brief','verify','classify','rewrite','voice','web','hub','catch_up','read_attachment')),   -- AiPurpose (08-0 §B.2)
                  -- voice = an OpenAI transcription (X-43, provider 'openai-voice'); local whisper writes no row; web/hub: X-46, X-49
  provider_id     TEXT NOT NULL,                            -- CostProviderId (08-0 §B.2), zod-checked
  model_reported  TEXT,                                     -- never guessed (OMB-03 §5.6)
  session_id      TEXT,
  tokens_in INTEGER, tokens_out INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,  -- NULL = unknown
  cost_paise      INTEGER,                                  -- NULL = unknown
  cost_source     TEXT NOT NULL CHECK (cost_source IN ('reported','priced','estimated','free','unknown')),
  billing         TEXT NOT NULL CHECK (billing IN ('plan','key','local')),
  duration_ms INTEGER, outcome TEXT NOT NULL CHECK (outcome IN ('ok','error','cancelled','timeout')),
  error_kind TEXT,
  started_at INTEGER NOT NULL
);
CREATE INDEX ai_turns_month ON ai_turns(billing, started_at);
CREATE INDEX ai_turns_chat ON ai_turns(chat_id, started_at);
CREATE INDEX ai_turns_job ON ai_turns(job_id);
CREATE INDEX ai_turns_routine ON ai_turns(routine_id, started_at);
-- Which chat_id / job_id / routine_id a turn carries is 08-4 §26.12.

-- 4.3.6 Approvals and payments (08-2 §9, §10)
CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,                           -- ap_…
  card_id       TEXT NOT NULL UNIQUE REFERENCES cards(id) ON DELETE RESTRICT,
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  verb          TEXT NOT NULL CHECK (verb IN ('send','book','buy','pay','post','delete','share','switch','use_app','calendar_write')),  -- ApprovalVerb (X-55); cancelling a booking is 'delete'
  hard_limit    INTEGER NOT NULL,                           -- 1 = G5 list; no scope chips, no rules
  fields        TEXT NOT NULL,                              -- JSON ApprovalFields (canonical, 08-2 §9.3)
  fields_hash   TEXT NOT NULL,                              -- sha256 of canonical JSON
  state         TEXT NOT NULL CHECK (state IN ('PENDING','APPROVED','HELD','RUNNING','CHECKING','COMPLETED','DECLINED','EXPIRED','SUPERSEDED','WITHDRAWN','FAILED')),  -- ApprovalState
  scope         TEXT CHECK (scope IN ('once','chat','always') OR scope IS NULL),
  approved_at   INTEGER,
  approved_via  TEXT CHECK (approved_via IN ('card','rule') OR approved_via IS NULL),   -- a Draft card's Send is 'card' (X-65); never 'toast' (09-windows)
  hello         TEXT CHECK (hello IN ('verified','typed_amount','not_needed') OR hello IS NULL),
  expires_at    INTEGER NOT NULL,                           -- draft approvals: created_at + 60 min (08-0 §G.7)
  superseded_by TEXT REFERENCES approvals(id) ON DELETE RESTRICT,
  second_look   TEXT,                                       -- JSON SecondLookResult
  undo_until    INTEGER,                                    -- draft sends only: approved_at + 5 s (08-0 §G.7)
  submitted_at  INTEGER,                                    -- WRITE-AHEAD before the irreversible click/call (08-2 §10.4)
  completed_at  INTEGER,
  proof         TEXT,
  failure_kind  TEXT,                                       -- ErrorKind
  created_at    INTEGER NOT NULL,
  CHECK (scope IS NULL OR scope = 'once' OR verb IN ('use_app','calendar_write'))   -- chat/always only where rules apply (08-0 §G.3)
);
CREATE INDEX approvals_state ON approvals(state, expires_at);
CREATE INDEX approvals_job ON approvals(job_id);

CREATE TABLE payments (
  id            TEXT PRIMARY KEY,                           -- py_…
  approval_id   TEXT NOT NULL UNIQUE REFERENCES approvals(id) ON DELETE RESTRICT,  -- one payment per approval, ever (Art. 7)
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  payee         TEXT NOT NULL, description TEXT NOT NULL,
  amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  method        TEXT NOT NULL CHECK (method IN ('card','upi')),
  method_label  TEXT NOT NULL,                              -- 'Visa ••4242' | 'UPI vik•••@okhdfc'
  site_domain   TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('submitted','checking','succeeded','failed')),   -- no 'ready', no 'unconfirmed' (DB-28)
  submitted_at  INTEGER NOT NULL, confirmed_at INTEGER,
  proof_kind TEXT, proof_ref TEXT, failure_kind TEXT,
  created_at    INTEGER NOT NULL
);
-- The payments row is INSERTED in the write-ahead transaction (08-2 §10.4) together with approvals.state='RUNNING' and submitted_at,
-- with state 'submitted'. Before that the amount lives only in the payment card's payload and approvals.fields. 'checking' while the
-- approval is CHECKING; 'succeeded' with COMPLETED; 'failed' with FAILED (decline, OTP/UPI timeout, or the 15-min CHECKING end, 08-2 §10.5).
-- Month purchase spend = SUM(amount_paise) WHERE state IN ('submitted','checking','succeeded') (08-0 §H, Art. 13).
CREATE INDEX payments_dupe ON payments(payee, amount_paise, created_at);
CREATE INDEX payments_job ON payments(job_id);
CREATE INDEX payments_state ON payments(state, created_at DESC);

-- 4.3.7 Routines (08-3 §13)
CREATE TABLE routines (
  id               TEXT PRIMARY KEY,                        -- r_…
  owner_chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  owner_helper_id  TEXT REFERENCES helpers(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL,                           -- "BTC below ₹55 lakh"
  builtin TEXT CHECK (builtin IN ('morning_brief','memory_tidy','pnr_watch','recharge_due','bill_watch') OR builtin IS NULL),   -- RoutineBuiltin (08-0 §B.2; bill_watch X-115)
  what_text        TEXT NOT NULL,                           -- plain words for the card ("Checks")
  task_spec        TEXT NOT NULL,                           -- JSON RoutineTask (08-3 §13.2)
  schedule         TEXT NOT NULL,                           -- JSON Schedule
  tz               TEXT NOT NULL,
  active_from      TEXT NOT NULL, active_to TEXT NOT NULL,  -- HHMM; copied from settings.routines.activeFrom/activeTo at creation (no SQL default)
  condition_text   TEXT,                                    -- "only if it's below ₹55 lakh"
  condition        TEXT,                                    -- JSON Condition (structured, optional)
  deliver_toast    INTEGER NOT NULL DEFAULT 1,
  urgent           INTEGER NOT NULL DEFAULT 0,              -- may notify in quiet hours (J20)
  state            TEXT NOT NULL CHECK (state IN ('on','paused','paused_away','paused_cap','deleted')),
  created_from     TEXT NOT NULL CHECK (created_from IN ('asked','habit','suggested','builtin','idea')),   -- RoutineCreatedFrom; 'idea' is prompted like 'asked' (08-3 §13.5)
  next_run_at INTEGER, last_run_at INTEGER, last_fired_at INTEGER,
  last_condition   INTEGER,                                 -- 1 true / 0 false / null unknown (hysteresis, J14)
  fail_streak      INTEGER NOT NULL DEFAULT 0,
  fired_ever_30d   INTEGER NOT NULL DEFAULT 0,              -- for the stale review (J14)
  est_month_paise  INTEGER, est_month_plan_pct REAL,
  rev              INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE routine_runs (
  id            TEXT PRIMARY KEY,                           -- rr_…
  routine_id    TEXT NOT NULL REFERENCES routines(id) ON DELETE RESTRICT,
  kind          TEXT NOT NULL CHECK (kind IN ('scheduled','catch_up','manual','first')),
  scheduled_for INTEGER, started_at INTEGER NOT NULL, finished_at INTEGER,
  outcome       TEXT CHECK (outcome IN ('nothing','fired','failed','skipped_cap','skipped_quiet','skipped_busy') OR outcome IS NULL),
  reason_short  TEXT,                                       -- plain words, ≤ 60 chars ("couldn't open CoinDCX")
  missed_count  INTEGER NOT NULL DEFAULT 0, gap_from INTEGER, gap_to INTEGER,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  cost_paise    INTEGER,
  observed      TEXT  -- JSON { metric, value, unit? } (RoutineStepAct.observed or fast path); 'changed' compares with the latest run that has one
);  -- pruned to the last 20 per routine (J14; hard delete)
CREATE INDEX routine_runs_routine ON routine_runs(routine_id, started_at DESC);

-- 4.3.8 Helpers
-- helper:create, in one db.tx: helpers row (with the pre-generated c_ id in chat_id) → chats row (kind 'helper', helper_id = the new h_ id).
CREATE TABLE helpers (
  id           TEXT PRIMARY KEY,                            -- h_…
  name         TEXT NOT NULL COLLATE NOCASE,                -- unique among live helpers: index helpers_name_live below (X-129)
  job_text     TEXT NOT NULL, good_result TEXT,
  face_ref     TEXT NOT NULL,                               -- FaceRef (§0.6)
  color_token  TEXT NOT NULL,
  allowed_apps TEXT NOT NULL,                               -- JSON = HelperForm.allowedApps: { gmail, gcal, contacts, whatsapp, x, outlook, browser, payments: boolean } (08-0 §B.3); the 06 screens omit the Outlook checkbox while `flags.outlook=false`
  chat_id      TEXT NOT NULL UNIQUE REFERENCES chats(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  paused       INTEGER NOT NULL DEFAULT 0,
  template     TEXT,
  rev          INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX helpers_name_live ON helpers(name COLLATE NOCASE) WHERE deleted_at IS NULL;

-- 4.3.9 Memory index (cache of the Markdown files, 08-3 §12)
CREATE TABLE memory_index (
  id          TEXT PRIMARY KEY,                             -- f_… (stored in the file line too, full UUIDv7)
  file        TEXT NOT NULL, line_no INTEGER NOT NULL,      -- path relative to {DATA} with forward slashes ('memory/about-you.md', 'helpers/{id}/notes.md'; the locator, X-112)
  scope       TEXT NOT NULL CHECK (scope IN ('global','chat','helper')),                         -- MemoryScope (08-0 §B.2); identity.md rows are 'global'
  chat_id     TEXT,                                         -- NULL unless scope='chat': read from the chat:{chatId} brace token of the line (08-3 §12.2, X-112)
  text        TEXT NOT NULL,
  provenance  TEXT NOT NULL CHECK (provenance IN ('said','guessed')),                            -- MemoryProvenance ("You said" / "I guessed")
  origin      TEXT NOT NULL,                                -- 'chat:{chatId}/{messageId}' | 'gmail:{msgId}' | 'whatsapp:{id}' | 'manual' | 'setup' | 'job:{jobId}'
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('chat','gmail','gcal','whatsapp','manual','setup','job')),   -- MemoryOrigin (= MemorySource)
  reason      TEXT,                                         -- for guessed: "from 4 bookings"
  category    TEXT CHECK (category IN ('food','travel','health','money','people','places','work','style','home','family','religion','politics','other') OR category IS NULL),  -- MemoryCategory
  kind        TEXT NOT NULL DEFAULT 'fact' CHECK (kind IN ('person','preference','place','fact')),   -- MemoryKind [settled: X-06]
  sensitive   INTEGER NOT NULL DEFAULT 0,
  private     INTEGER NOT NULL DEFAULT 0,                   -- never in groups (Art. 14)
  learned_at  INTEGER NOT NULL, last_used_at INTEGER, use_count INTEGER NOT NULL DEFAULT 0,
  hash        TEXT NOT NULL                                 -- sha256(normalised text) for tombstones/dedupe
);
CREATE INDEX memory_scope ON memory_index(scope, last_used_at DESC);
CREATE INDEX memory_hash ON memory_index(hash);
CREATE INDEX memory_file ON memory_index(file, line_no);   -- X-112
CREATE VIRTUAL TABLE memory_fts USING fts5(text, content='memory_index', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-'");
CREATE TRIGGER memory_index_ai AFTER INSERT ON memory_index BEGIN
  INSERT INTO memory_fts(rowid, text) VALUES (new.rowid, new.text); END;
CREATE TRIGGER memory_index_ad AFTER DELETE ON memory_index BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, text) VALUES ('delete', old.rowid, old.text); END;
CREATE TRIGGER memory_index_au AFTER UPDATE OF text ON memory_index BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO memory_fts(rowid, text) VALUES (new.rowid, new.text); END;

CREATE TABLE memory_tombstones (hash TEXT NOT NULL, origin_kind TEXT NOT NULL, forgotten_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY (hash, origin_kind));                         -- 90 days (J17); mirrored in memory\.tombstones

-- 4.3.10 Connections, contacts index, secrets index (X-73, X-74, 08-0 §E.8, §G.12)
CREATE TABLE connections (
  id             TEXT PRIMARY KEY,                          -- cn_…
  app            TEXT NOT NULL CHECK (app IN ('gmail','gcal','contacts','whatsapp','outlook','hub')),
  account_label  TEXT NOT NULL,                             -- masked 'v***@gmail.com' | '+91 98••• ••210'
  account_hash   TEXT NOT NULL,                             -- sha256 of the real account id, for dedupe
  granted        TEXT NOT NULL,                             -- JSON { read, draft, send, calendarWrite, contactsRead: boolean }
  status         TEXT NOT NULL CHECK (status IN ('connecting','connected','needs_signin','unlinked','error','disconnected')),
  vault_name     TEXT NOT NULL,                             -- 'foo/conn_token/google' (the same on the gmail, gcal and contacts rows) | 'foo/conn_token/outlook' | 'vault\wa-session.bin' (whatsapp)
                                                            -- v1.1 hub row (flags.hub): 'foo/hub_key/composio' (08-0 §E.8)
  connected_at   INTEGER NOT NULL, last_ok_at INTEGER, last_error_kind TEXT,
  history_id     TEXT,                                      -- Gmail users.history baseline; NULL except on the gmail row (08-3 §16.1.3)
  rev            INTEGER NOT NULL DEFAULT 1,
  UNIQUE (app, account_hash)
);
-- 'connecting' is never kept past exit: at startup every 'connecting' row becomes 'disconnected'. A vault target is deleted only when
-- the last row naming it is deleted. Calendar/Contacts "Turn off" changes settings.connections.google.calendarOn/contactsOn, not the row.

CREATE TABLE contacts_index (                               -- Google Contacts, read-only (X-48, 08-3 §16.7)
  id             TEXT PRIMARY KEY,                          -- Google resourceName
  connection_id  TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,   -- the 'contacts' row
  display_name   TEXT NOT NULL,
  emails         TEXT NOT NULL DEFAULT '[]',                -- JSON string[]
  phones         TEXT NOT NULL DEFAULT '[]',                -- JSON string[]
  synced_at      INTEGER NOT NULL
);   -- replaced wholesale on each sync; deleted on "Disconnect Google" and when contactsOn turns false; never exported; never in Ctrl+K
CREATE VIRTUAL TABLE contacts_fts USING fts5(display_name, emails, phones, content='contacts_index', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-+'");
CREATE TRIGGER contacts_index_ai AFTER INSERT ON contacts_index BEGIN
  INSERT INTO contacts_fts(rowid, display_name, emails, phones) VALUES (new.rowid, new.display_name, new.emails, new.phones); END;
CREATE TRIGGER contacts_index_ad AFTER DELETE ON contacts_index BEGIN
  INSERT INTO contacts_fts(contacts_fts, rowid, display_name, emails, phones) VALUES ('delete', old.rowid, old.display_name, old.emails, old.phones); END;
CREATE TRIGGER contacts_index_au AFTER UPDATE OF display_name, emails, phones ON contacts_index BEGIN
  INSERT INTO contacts_fts(contacts_fts, rowid, display_name, emails, phones) VALUES ('delete', old.rowid, old.display_name, old.emails, old.phones);
  INSERT INTO contacts_fts(rowid, display_name, emails, phones) VALUES (new.rowid, new.display_name, new.emails, new.phones); END;

CREATE TABLE secrets_index (
  target     TEXT PRIMARY KEY,                              -- 'foo/{kind}/{name}' exactly per 08-0 §E.8; WhatsApp: 'vault\wa-session.bin'
  kind       TEXT NOT NULL CHECK (kind IN ('ai_key','login','card','conn_token','wa_session','web_key','hub_key')),   -- SecretKind
  name       TEXT NOT NULL,                                 -- the {name} part: providerId | host | last4 | google | outlook | exa… | composio | whatsapp
  label      TEXT NOT NULL,                                 -- user-facing, e.g. "Visa ••4242", "OpenAI key"
  domain TEXT, brand TEXT, last4 TEXT,
  storage    TEXT NOT NULL CHECK (storage IN ('credman','blob')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used_at INTEGER,
  UNIQUE (kind, name)
);   -- NEVER a value column (Art. 8). secret:save with kind='card' and an existing (kind, name) → SECRET_EXISTS (nothing written);
     -- every other kind replaces the value and writes activity 'secret_replaced' (X-129)

-- 4.3.11 Activity log (Art. 15; X-62, 08-0 §G.4; owner Q2 default for private chats)
CREATE TABLE activity (
  id           TEXT PRIMARY KEY,                            -- act_…
  at           INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('sent','paid','booked','deleted','connected','stopped','changed')),
  event        TEXT NOT NULL,
  actor        TEXT NOT NULL,                               -- 'foo' | helper id | 'user'
  chat_id      TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  chat_title   TEXT,                                        -- chat title when written; exactly 'a private chat' for a private chat (R31)
  job_id       TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  approval_id  TEXT REFERENCES approvals(id) ON DELETE RESTRICT,
  payment_id   TEXT REFERENCES payments(id) ON DELETE RESTRICT,
  routine_id   TEXT REFERENCES routines(id) ON DELETE RESTRICT,
  summary      TEXT NOT NULL,                               -- redacted line 1 (06-3 §9.4 templates); for a private chat built only from the to, amount, payee and recipient labels, never message text (X-82)
  to_label     TEXT,                                        -- masked recipient / payee
  from_label   TEXT,
  amount_paise INTEGER,
  approved_how TEXT CHECK (approved_how IN ('card_once','card_chat','card_always','rule','hello','typed_amount','user','none') OR approved_how IS NULL),
  rule_text    TEXT,                                        -- the Rule.text when approved_how='rule'
  proof_kind   TEXT, proof_ref TEXT,
  outcome      TEXT NOT NULL CHECK (outcome IN ('done','failed','unknown')),
  fields       TEXT,                                        -- JSON, the event's named fields, redacted; never message text for a private chat
  CHECK (
       (kind = 'sent'      AND event IN ('sent_email','sent_whatsapp','opened_x_draft','shared_personal'))
    OR (kind = 'paid'      AND event = 'paid')
    OR (kind = 'booked'    AND event IN ('booked','cancelled_booking'))
    OR (kind = 'deleted'   AND event IN ('deleted_files','deleted_email','deleted_chats','deleted_messages'))
    OR (kind = 'connected' AND event IN ('connected','disconnected','signed_in_site','signed_out_site','saved_login','removed_login'))
    OR (kind = 'stopped'   AND event IN ('stopped_job','stopped_all','paused_routines','resumed_routines'))
    OR (kind = 'changed'   AND event IN ('permission_changed','cap_changed','setting_changed','rule_added','rule_removed','forgot_facts',
                                         'secret_saved','secret_replaced','secret_removed','switched_route','exported'))
  )
);
CREATE INDEX activity_job ON activity(job_id, at);
CREATE INDEX activity_at ON activity(kind, at DESC);
CREATE INDEX activity_actor ON activity(actor, at DESC);
CREATE INDEX activity_chat ON activity(chat_id, at DESC);  -- X-129
CREATE VIRTUAL TABLE activity_fts USING fts5(summary, content='activity', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-'");
CREATE TRIGGER activity_ai AFTER INSERT ON activity BEGIN
  INSERT INTO activity_fts(rowid, summary) VALUES (new.rowid, new.summary); END;
CREATE TRIGGER activity_ad AFTER DELETE ON activity BEGIN
  INSERT INTO activity_fts(activity_fts, rowid, summary) VALUES ('delete', old.rowid, old.summary); END;
CREATE TRIGGER activity_au AFTER UPDATE OF summary ON activity BEGIN
  INSERT INTO activity_fts(activity_fts, rowid, summary) VALUES ('delete', old.rowid, old.summary);
  INSERT INTO activity_fts(rowid, summary) VALUES (new.rowid, new.summary); END;
-- Only the events above are activity rows; every other 05 "Logged" event goes to the tech log, never here (08-0 §G.4).
-- Rows written from a private chat: chat_title = 'a private chat' and summary built only from to/amount/payee/recipient label,
-- never message text (X-82).
-- The stop report (08-2 §5.7) counts kinds sent, paid, booked, deleted. The 06-3 §9 kind chips filter on `kind`; the expanded row
-- reads to_label / from_label / amount_paise / approved_how + rule_text / proof_kind + proof_ref. Rows are never deleted except by
-- "Delete everything" (J23). settings:set writes one row per user-visible change (§4.4.2).

-- 4.3.12 Notifications ledger (budget + merge, 08-3 §15)
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,                              -- nt_…
  at         INTEGER NOT NULL,
  local_date TEXT NOT NULL,                                 -- 'YYYY-MM-DD' in the user's time zone
  chat_id    TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL CHECK (kind IN ('choice','approval','payment','signin','done','routine','brief','stuck','error','reply','reminder','summary')),  -- NotificationKind
  prompted   INTEGER NOT NULL,
  delivery   TEXT NOT NULL CHECK (delivery IN ('toast','held_quiet','held_quiet_item','held_budget','merged','suppressed_focus','suppressed_muted','suppressed_off','summary')),   -- NotificationDelivery
  ref        TEXT                                           -- the cardId or messageId the notification opens; also the Windows toast `tag`
);
CREATE INDEX notifications_day ON notifications(local_date, prompted, delivery);
CREATE INDEX notifications_chat ON notifications(chat_id); -- X-129

-- 4.3.13 Misc
CREATE TABLE site_notes (domain TEXT PRIMARY KEY, flags TEXT NOT NULL,  -- JSON { blocksAutomation, needsSignIn, captchaAlways, otpChannel, searchLoop, bookingWorks }
  updated_at INTEGER NOT NULL);
CREATE TABLE site_recipes (id TEXT PRIMARY KEY /* rcp_ */, domain TEXT NOT NULL, goal TEXT NOT NULL, url_pattern TEXT NOT NULL,  -- 08-2 §8.3.11 [X-46]
  steps_json TEXT NOT NULL /* [{instruction, role, name, fallbackSelector, variableName?}]; never values */, success_count INTEGER NOT NULL DEFAULT 0,
  last_ok_at INTEGER, last_fail_at INTEGER, UNIQUE (domain, goal));
CREATE TABLE suggestions (                                  -- Art. 20 "never offer twice" (X-76, 08-0 §G.13)
  id         TEXT PRIMARY KEY,                              -- sg_…
  key        TEXT NOT NULL UNIQUE,                          -- '{kind}:{subject}', derivation below
  kind       TEXT NOT NULL CHECK (kind IN ('helper_offer','habit_offer','routine_offer','connector_offer','brief_kind_stop','memory_conflict','memory_share','stale_routine','save_login','read_codes','voice_key')),   -- SuggestionKind
  text       TEXT NOT NULL,                                 -- the sentence shown, redacted (the "Dismissed suggestions" dialog lists it)
  state      TEXT NOT NULL CHECK (state IN ('offered','accepted','dismissed')),
  offered_at INTEGER NOT NULL,
  decided_at INTEGER                                        -- the "Dismissed {date}" in the dialog
);
-- subject per kind (AG-26): helper_offer → template id (trips, money, home, family); habit_offer → biller slug ('airtel-7741');
-- routine_offer → 'suggest:{first 8 hex of sha256(task_spec)}' | 'pnr_watch:{pnr}' | 'recharge_due:{billerSlug}-{last4}' (idea offers write no row);
-- connector_offer → ConnectorApp; brief_kind_stop → BriefKind; memory_conflict → the two fact ids sorted, joined by '-'; memory_share → '{factId}:{groupChatId}';
-- stale_routine → routine id; save_login → domain; read_codes → sender domain; voice_key → 'openai'.
-- A key in state 'dismissed' is never offered again. suggestions:restoreDismissed { key } sets that row to 'offered'; {} sets all.
CREATE INDEX suggestions_state ON suggestions(state, decided_at DESC);   -- X-129
CREATE TABLE outbox (id TEXT PRIMARY KEY /* ob_ */, approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE RESTRICT, created_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('waiting_online','sent','cancelled'))); -- J12 offline send with consent
CREATE TABLE brief_feedback (id TEXT PRIMARY KEY /* bf_ */, brief_card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  item_kind TEXT NOT NULL /* BriefKind */, vote INTEGER NOT NULL CHECK (vote IN (1, -1)), at INTEGER NOT NULL); -- J6, 08-3 §14.5
CREATE TABLE wa_messages (id TEXT PRIMARY KEY /* 'wa_' + chat_jid + ':' + Baileys key.id; ingest is INSERT OR IGNORE (X-129) */, chat_jid TEXT NOT NULL, from_me INTEGER NOT NULL, sender_label TEXT, text TEXT,
  at INTEGER NOT NULL, starred INTEGER NOT NULL DEFAULT 0, mentions_me INTEGER NOT NULL DEFAULT 0); -- pruned at 7 days (J16; hard delete)
CREATE INDEX wa_messages_chat ON wa_messages(chat_jid, at DESC);
CREATE TABLE wa_contacts (jid TEXT PRIMARY KEY, name TEXT, phone TEXT, updated_at INTEGER NOT NULL);
  -- names for JID resolution; deleted with wa_messages on unlink or read=false; never exported (08-0 §G.17)
CREATE TABLE held_items (
  id                    TEXT PRIMARY KEY,                   -- hi_…
  kind                  TEXT NOT NULL CHECK (kind IN ('routine_fire','habit_offer','helper_offer','stale_routine','away_notice','memory_conflict','cap_80','brief_kind_stop','suggestion')),   -- HeldItemKind
  chat_id               TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  payload               TEXT NOT NULL,                      -- JSON HeldItemPayload (08-5 §3.8)
  created_at            INTEGER NOT NULL,
  delivered_in_brief_id TEXT
);   -- 08-3 §15.6; undelivered rows older than 7 days deleted by the brief builder
CREATE INDEX held_items_chat ON held_items(chat_id);       -- X-129
CREATE TABLE memory_group_grants (
  fact_id TEXT NOT NULL,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  until   INTEGER NOT NULL,
  PRIMARY KEY (fact_id, chat_id)
);   -- 08-0 §G.17 (C-5)
CREATE TABLE memory_uses (fact_id TEXT NOT NULL, chat_id TEXT NOT NULL, job_id TEXT, at INTEGER NOT NULL);
CREATE INDEX memory_uses_chat ON memory_uses(chat_id, at);
  -- purged nightly after 90 days; read by the named query memoryUsedInChat
CREATE TABLE files (                                        -- file index (DB-16): 06-3 §12.3 Files group, helper profile files, export files-index.json
  id            TEXT PRIMARY KEY,                           -- fl_…
  kind          TEXT NOT NULL CHECK (kind IN ('made','received','downloaded','screenshot')),
  name          TEXT NOT NULL,
  mime          TEXT, bytes INTEGER,
  path          TEXT NOT NULL,                              -- absolute
  chat_id       TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  message_id    TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  helper_id     TEXT REFERENCES helpers(id) ON DELETE RESTRICT,
  created_at    INTEGER NOT NULL,
  missing_since INTEGER                                     -- set by housekeeping when the path no longer exists
);
CREATE INDEX files_chat ON files(chat_id, created_at DESC);
CREATE INDEX files_helper ON files(helper_id, created_at DESC);   -- X-129
CREATE INDEX files_job ON files(job_id);                   -- X-129
-- Written by files.write, browser.download, files:stage (on send) and the step-screenshot writer. Ctrl+K Files group =
-- kind IN ('made','received','downloaded') AND name LIKE ?; helper profile files = helper_id.
