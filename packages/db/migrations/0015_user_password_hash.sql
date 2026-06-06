-- Short-term password login (testing); hash stored server-side only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at timestamp;
