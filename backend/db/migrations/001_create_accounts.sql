-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  institution VARCHAR NOT NULL,
  account_type VARCHAR,
  currency VARCHAR DEFAULT 'KES',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Create index on institution for filtering
CREATE INDEX IF NOT EXISTS idx_accounts_institution ON accounts(institution);
