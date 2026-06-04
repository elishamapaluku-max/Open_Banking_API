/**
 * KipaAPI — Normalized Transaction Schema
 * =========================================
 * Every transaction ingested from any source (M-Pesa, KCB, Equity, Co-op, NCBA)
 * is normalized into this structure before being stored or sent to Claude.
 *
 * Sources: MPESA | KCB | EQUITY | COOP | NCBA | STANBIC | ABSA
 * Types:   CREDIT | DEBIT
 * Categories (Claude-assigned): see TRANSACTION_CATEGORIES below
 */

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

const TRANSACTION_SOURCES = {
  MPESA:   'MPESA',    // Safaricom M-Pesa (Daraja API or PDF statement)
  KCB:     'KCB',      // Kenya Commercial Bank
  EQUITY:  'EQUITY',   // Equity Bank
  COOP:    'COOP',     // Co-operative Bank
  NCBA:    'NCBA',     // NCBA Bank
  STANBIC: 'STANBIC',  // Stanbic Bank Kenya
  ABSA:    'ABSA',     // Absa Bank Kenya
};

const TRANSACTION_TYPES = {
  CREDIT: 'CREDIT',  // Money coming in
  DEBIT:  'DEBIT',   // Money going out
};

const TRANSACTION_CATEGORIES = {
  // Income
  SALARY:           'SALARY',           // Regular employer payments
  BUSINESS_INCOME:  'BUSINESS_INCOME',  // Business/self-employment receipts
  MOBILE_TRANSFER:  'MOBILE_TRANSFER',  // P2P M-Pesa sends received
  LOAN_DISBURSEMENT:'LOAN_DISBURSEMENT',// Loan received from lender
  INTEREST_EARNED:  'INTEREST_EARNED',  // Bank interest credited

  // Expenses
  FOOD_GROCERIES:   'FOOD_GROCERIES',   // Supermarkets, food vendors
  TRANSPORT:        'TRANSPORT',         // Uber, Bolt, matatu, fuel
  UTILITIES:        'UTILITIES',         // KPLC, Nairobi Water, internet
  RENT:             'RENT',              // Landlord payments
  AIRTIME_BUNDLES:  'AIRTIME_BUNDLES',   // Safaricom, Airtel recharges
  LOAN_REPAYMENT:   'LOAN_REPAYMENT',    // Fuliza, M-Shwari, bank loan repayments
  INSURANCE:        'INSURANCE',         // NHIF, NSSF, private insurance
  SAVINGS:          'SAVINGS',           // M-Shwari lock, Sacco deposits
  ENTERTAINMENT:    'ENTERTAINMENT',     // Restaurants, DSTV, streaming
  SHOPPING:         'SHOPPING',          // Retail, clothing, electronics
  EDUCATION:        'EDUCATION',         // School fees, training
  HEALTH:           'HEALTH',            // Pharmacy, hospital, clinic
  WITHDRAWAL:       'WITHDRAWAL',        // M-Pesa cash out / ATM
  PAYBILL:          'PAYBILL',           // Generic paybill (utilities/services)
  TILL:             'TILL',              // Buy Goods till number
  TRANSFER_OUT:     'TRANSFER_OUT',      // Outgoing P2P transfer

  // Fallback
  OTHER:            'OTHER',             // Unclassified
};

const INGESTION_METHODS = {
  DARAJA_API: 'DARAJA_API',  // Live pull from Safaricom Daraja
  PDF_PARSE:  'PDF_PARSE',   // Extracted from uploaded PDF statement
  CSV_IMPORT: 'CSV_IMPORT',  // Imported from CSV export
  BANK_API:   'BANK_API',    // Direct bank API (post-CBK compliance)
};

// ─────────────────────────────────────────────
// CORE SCHEMA
// ─────────────────────────────────────────────

/**
 * NormalizedTransaction
 *
 * @typedef {Object} NormalizedTransaction
 * @property {string}   id               - Unique KipaAPI transaction ID (txn_<uuid>)
 * @property {string}   account_id       - KipaAPI account ID this transaction belongs to
 * @property {string}   date             - ISO 8601 date string (YYYY-MM-DD)
 * @property {string}   datetime         - Full ISO 8601 datetime if available (YYYY-MM-DDTHH:mm:ssZ)
 * @property {number}   amount           - Absolute value in KES (always positive)
 * @property {string}   currency         - ISO 4217 currency code (default: "KES")
 * @property {string}   type             - CREDIT or DEBIT
 * @property {string}   source           - Originating institution (MPESA, KCB, etc.)
 * @property {string}   ingestion_method - How data entered KipaAPI (DARAJA_API, PDF_PARSE, etc.)
 * @property {string}   raw_description  - Original description string from source, unmodified
 * @property {string}   description      - Cleaned/normalized description
 * @property {string|null} category      - Claude-assigned category (null until AI processed)
 * @property {string|null} merchant      - Merchant or counterparty name (null if unknown)
 * @property {string|null} merchant_type - Type of merchant (e.g. "supermarket", "employer")
 * @property {string|null} reference     - Transaction reference/receipt number from source
 * @property {number|null} running_balance - Account balance after transaction (if available)
 * @property {boolean}  is_recurring     - Claude-flagged as recurring payment
 * @property {boolean}  is_income_signal - Claude-flagged as likely income
 * @property {boolean}  is_anomaly       - Claude-flagged as unusual/anomalous
 * @property {Object}   source_metadata  - Raw source-specific fields (preserved for audit)
 * @property {string}   created_at       - When KipaAPI ingested this record
 */

const NormalizedTransaction = {
  id:               null,  // "txn_abc123"
  account_id:       null,  // "acc_xyz789"
  date:             null,  // "2026-05-15"
  datetime:         null,  // "2026-05-15T14:32:00+03:00" (null if source has date only)
  amount:           null,  // 4500.00  (always positive; use `type` for direction)
  currency:         'KES',
  type:             null,  // "CREDIT" | "DEBIT"
  source:           null,  // "MPESA" | "KCB" | "EQUITY" ...
  ingestion_method: null,  // "DARAJA_API" | "PDF_PARSE" ...
  raw_description:  null,  // "Pay Bill Online 000300 - KPLC PREPAID KCB 1234567890"
  description:      null,  // "KPLC Prepaid Payment"
  category:         null,  // null until Claude processes
  merchant:         null,  // "Kenya Power" | null
  merchant_type:    null,  // "utility" | null
  reference:        null,  // "QK12ABC456" (M-Pesa receipt / bank ref)
  running_balance:  null,  // 12450.00 | null
  is_recurring:     false,
  is_income_signal: false,
  is_anomaly:       false,
  source_metadata:  {},    // Raw source fields preserved as-is
  created_at:       null,  // "2026-05-30T08:00:00Z"
};

// ─────────────────────────────────────────────
// SOURCE-SPECIFIC RAW FORMATS
// (what we receive BEFORE normalization)
// ─────────────────────────────────────────────

/**
 * M-Pesa raw transaction (from Daraja API or PDF parse)
 * Reference: M-Pesa statement / Daraja C2B callback
 */
const RawMpesaTransaction = {
  receipt_no:          'QK12ABC456',       // M-Pesa receipt number
  completion_time:     '15/05/2026 14:32', // DD/MM/YYYY HH:mm
  transaction_status:  'Completed',
  details:             'Pay Bill Online 000300',
  paid_in:             '',                 // Amount credited (empty string if debit)
  withdrawn:           '4,500.00',         // Amount debited (empty string if credit)
  transaction_amount:  '4,500.00',
  transaction_cost:    '0.00',
  balance:             '12,450.00',
};

/**
 * KCB raw transaction (from PDF statement parse)
 */
const RawKcbTransaction = {
  date:           '15-May-2026',
  value_date:     '15-May-2026',
  description:    'MPESA PAYMENT FROM 254712XXXXXX - JOHN DOE',
  debit:          '',
  credit:         '5000.00',
  balance:        '67,320.50',
  branch:         'ONLINE',
  cheque_no:      '',
};

/**
 * Equity Bank raw transaction (from PDF statement parse)
 */
const RawEquityTransaction = {
  posting_date:   '15/05/2026',
  value_date:     '15/05/2026',
  narrative:      'EFT CREDIT - EMPLOYER PAYROLL - SAFARICOM LTD',
  debit_amount:   '',
  credit_amount:  '85,000.00',
  running_balance:'102,450.75',
  transaction_id: 'EQ20260515001234',
};

/**
 * Co-op Bank raw transaction (from PDF statement parse)
 */
const RawCoopTransaction = {
  trans_date:     '15/05/2026',
  value_date:     '15/05/2026',
  transaction_ref:'RTGS/0001/150526',
  description:    'SALARY CREDIT - MINISTRY OF EDUCATION',
  dr_amount:      '',
  cr_amount:      '45,000.00',
  balance:        '48,200.00',
};

// ─────────────────────────────────────────────
// NORMALIZATION EXAMPLES
// (what each raw format maps to)
// ─────────────────────────────────────────────

const NORMALIZATION_EXAMPLES = [
  {
    source: 'M-Pesa Paybill (KPLC)',
    raw: {
      receipt_no: 'QK12ABC456',
      completion_time: '15/05/2026 14:32',
      details: 'Pay Bill Online 000300 - KPLC PREPAID',
      withdrawn: '4,500.00',
      paid_in: '',
      balance: '12,450.00',
    },
    normalized: {
      id: 'txn_abc123',
      account_id: 'acc_xyz789',
      date: '2026-05-15',
      datetime: '2026-05-15T14:32:00+03:00',
      amount: 4500.00,
      currency: 'KES',
      type: 'DEBIT',
      source: 'MPESA',
      ingestion_method: 'PDF_PARSE',
      raw_description: 'Pay Bill Online 000300 - KPLC PREPAID',
      description: 'KPLC Prepaid Payment',
      category: 'UTILITIES',
      merchant: 'Kenya Power',
      merchant_type: 'utility',
      reference: 'QK12ABC456',
      running_balance: 12450.00,
      is_recurring: true,
      is_income_signal: false,
      is_anomaly: false,
      source_metadata: {
        receipt_no: 'QK12ABC456',
        transaction_cost: '0.00',
        paybill_number: '000300',
      },
      created_at: '2026-05-30T08:00:00Z',
    },
  },
  {
    source: 'Equity Bank Salary',
    raw: {
      posting_date: '15/05/2026',
      narrative: 'EFT CREDIT - EMPLOYER PAYROLL - SAFARICOM LTD',
      credit_amount: '85,000.00',
      running_balance: '102,450.75',
      transaction_id: 'EQ20260515001234',
    },
    normalized: {
      id: 'txn_def456',
      account_id: 'acc_xyz789',
      date: '2026-05-15',
      datetime: null,
      amount: 85000.00,
      currency: 'KES',
      type: 'CREDIT',
      source: 'EQUITY',
      ingestion_method: 'PDF_PARSE',
      raw_description: 'EFT CREDIT - EMPLOYER PAYROLL - SAFARICOM LTD',
      description: 'Salary Payment from Safaricom Ltd',
      category: 'SALARY',
      merchant: 'Safaricom Ltd',
      merchant_type: 'employer',
      reference: 'EQ20260515001234',
      running_balance: 102450.75,
      is_recurring: true,
      is_income_signal: true,
      is_anomaly: false,
      source_metadata: {
        transaction_id: 'EQ20260515001234',
        value_date: '15/05/2026',
      },
      created_at: '2026-05-30T08:00:00Z',
    },
  },
];

// ─────────────────────────────────────────────
// CLAUDE INPUT PAYLOAD
// (what gets sent to the AI layer)
// ─────────────────────────────────────────────

/**
 * The array Claude receives for analysis.
 * category, merchant, is_recurring, is_income_signal, is_anomaly
 * are all null/false at this point — Claude fills them in.
 */
const ClaudeInputPayload = {
  account_id: 'acc_xyz789',
  period: {
    from: '2026-01-01',
    to:   '2026-05-31',
  },
  transactions: [
    // Array of NormalizedTransaction objects (category=null, flags=false)
  ],
};

/**
 * What Claude returns after analysis
 */
const ClaudeOutputSchema = {
  account_id: 'acc_xyz789',
  summary: {
    total_credits:       250000.00,
    total_debits:        185000.00,
    net_cashflow:         65000.00,
    estimated_monthly_income: 85000.00,
    income_confidence:   'HIGH',   // HIGH | MEDIUM | LOW
    income_sources:      ['SALARY', 'BUSINESS_INCOME'],
    top_expense_categories: ['RENT', 'FOOD_GROCERIES', 'UTILITIES'],
    loan_repayment_detected: true,
    savings_detected:    false,
    anomalies_detected:  1,
  },
  transactions: [
    // Same array with category, merchant, flags now populated
  ],
  borrower_narrative: 
    'The applicant receives a consistent monthly salary of KES 85,000 from Safaricom Ltd, ' +
    'credited on or around the 15th of each month. Major recurring expenses include rent ' +
    '(KES 25,000), utility payments to KPLC, and weekly grocery purchases at Naivas. ' +
    'An active Fuliza repayment pattern suggests short-term liquidity pressure at month-end. ' +
    'Overall financial behaviour indicates a stable-income borrower with moderate expense discipline.',
};

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  TRANSACTION_SOURCES,
  TRANSACTION_TYPES,
  TRANSACTION_CATEGORIES,
  INGESTION_METHODS,
  NormalizedTransaction,
  RawMpesaTransaction,
  RawKcbTransaction,
  RawEquityTransaction,
  RawCoopTransaction,
  NORMALIZATION_EXAMPLES,
  ClaudeInputPayload,
  ClaudeOutputSchema,
};