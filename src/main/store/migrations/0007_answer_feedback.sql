-- Spec: CR-0062 (X-219), 04 §17.1 (👍 "toggles a local note on this answer"), §17.2 (👎 "saved on this PC as a preference
-- note"); 08-1 §4.2 (forward-only migrations). Three nullable columns, no rebuild: the vote, the 👎 chips (JSON array of
-- chip ids) and the optional words (redacted, §4.6 rule 2).
ALTER TABLE messages ADD COLUMN feedback TEXT CHECK (feedback IN ('good','bad'));
ALTER TABLE messages ADD COLUMN feedback_chips TEXT;
ALTER TABLE messages ADD COLUMN feedback_note TEXT;
