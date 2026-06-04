<<<<<<< HEAD
-- KipaAPI Migration: 002_create_transactions.sql
-- Creates the normalized transactions table

CREATE TYPE transaction_source AS ENUM (
  'MPESA', 'KCB', 'EQUITY', 'COOP', 'NCBA', 'STANBIC', 'ABSA'
);

CREATE TYPE transaction_type AS ENUM (
  'CREDIT', 'DEBIT'
);

CREATE TYPE transaction_category AS ENUM (
  'SALARY', 'BUSINESS_INCOME', 'MOBILE_TRANSFER', 'LOAN_DISBURSEMENT', 'INTEREST_EARNED',
  'FOOD_GROCERIES', 'TRANSPORT', 'UTILITIES', 'RENT', 'AIRTIME_BUNDLES',
  'LOAN_REPAYMENT', 'INSURANCE', 'SAVINGS', 'ENTERTAINMENT', 'SHOPPING',
  'EDUCATION', 'HEALTH', 'WITHDRAWAL', 'PAYBILL', 'TILL', 'TRANSFER_OUT', 'OTHER'
);

CREATE TYPE ingestion_method AS ENUM (
  'DARAJA_API', 'PDF_PARSE', 'CSV_IMPORT', 'BANK_API'
);

CREATE TABLE transactions (
  id                 VARCHAR(40) PRIMARY KEY,        -- "txn_<uuid>"
  account_id         VARCHAR(40) NOT NULL,
  date               DATE NOT NULL,
  datetime           TIMESTAMPTZ,                    -- NULL if source has date only
  amount             NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  currency           CHAR(3) NOT NULL DEFAULT 'KES',
  type               transaction_type NOT NULL,
  source             transaction_source NOT NULL,
  ingestion_method   ingestion_method NOT NULL,
  raw_description    TEXT NOT NULL,
  description        TEXT NOT NULL,
  category           transaction_category,           -- NULL until Claude processes
  merchant           VARCHAR(255),
  merchant_type      VARCHAR(100),
  reference          VARCHAR(100),
  running_balance    NUMERIC(15, 2),
  is_recurring       BOOLEAN NOT NULL DEFAULT FALSE,
  is_income_signal   BOOLEAN NOT NULL DEFAULT FALSE,
  is_anomaly         BOOLEAN NOT NULL DEFAULT FALSE,
  source_metadata    JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX idx_transactions_account_id   ON transactions(account_id);
CREATE INDEX idx_transactions_date         ON transactions(account_id, date DESC);
CREATE INDEX idx_transactions_category     ON transactions(account_id, category);
CREATE INDEX idx_transactions_type         ON transactions(account_id, type);
CREATE INDEX idx_transactions_source       ON transactions(source);
CREATE INDEX idx_transactions_income       ON transactions(account_id, is_income_signal) WHERE is_income_signal = TRUE;
CREATE INDEX idx_transactions_reference    ON transactions(reference) WHERE reference IS NOT NULL;
=======
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
>>>>>>> main
