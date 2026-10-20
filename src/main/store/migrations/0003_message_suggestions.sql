-- Spec: CR-0021 pick 10 (X-179): up to 3 follow-up suggestions the AI gave with a reply (JSON string[] or NULL), shown as
-- composer chips; 08-1 §4.2 (forward-only migrations). One nullable column, no rebuild.
ALTER TABLE messages ADD COLUMN suggestions TEXT CHECK (suggestions IS NULL OR json_valid(suggestions));
