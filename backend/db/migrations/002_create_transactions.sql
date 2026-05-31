-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency VARCHAR DEFAULT 'KES',
  type VARCHAR CHECK (type IN ('CREDIT', 'DEBIT')),
  source VARCHAR,
  description TEXT,
  category VARCHAR,
  merchant VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on account_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);

-- Create index on date for time-based queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

-- Create index on type for filtering
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
