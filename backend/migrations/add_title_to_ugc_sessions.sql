-- Add title column to ugc_sessions table
ALTER TABLE ugc_sessions ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT 'New Session';

-- Update the updated_at column for existing records
UPDATE ugc_sessions SET updated_at = NOW() WHERE title IS NULL;

