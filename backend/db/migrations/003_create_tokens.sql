-- Create oauth_tokens table
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  institution VARCHAR NOT NULL,
  access_token TEXT NOT NULL,
  scope VARCHAR,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);

-- Create index on institution for filtering
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_institution ON oauth_tokens(institution);

-- Create index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);
