-- Spec: CR-0059 (X-216) row 1, 04 §17.1 "Try again" (the old text stays reachable through "Show earlier answer"); 08-1 §4.2
-- (forward-only migrations). One nullable column, no rebuild: the answer's text before its last rewrite (redacted, §4.6).
ALTER TABLE messages ADD COLUMN earlier_text TEXT;
