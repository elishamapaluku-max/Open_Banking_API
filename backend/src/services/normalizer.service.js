/**
 * KipaAPI — Normalization Engine
 * ================================
 * Converts raw transaction data from any source into the
 * KipaAPI normalized transaction schema.
 *
 * Sources handled:
 *   - M-Pesa (Daraja API callback / live pull)
 *   - KCB Bank (API response)
 *   - Equity Bank (API response)
 *   - Co-operative Bank (API response)
 *   - Pre-normalized (from PDF/CSV parsers — pass-through with validation)
 *
 * Usage:
 *   const { normalize } = require('./normalizer.service');
 *   const txn = normalize(rawTransaction, 'MPESA', 'acc_xyz789');
 *   const txns = normalizeMany(rawTransactions, 'KCB', 'acc_xyz789');
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const VALID_SOURCES = ['MPESA', 'KCB', 'EQUITY', 'COOP', 'NCBA', 'STANBIC', 'ABSA'];
const VALID_TYPES   = ['CREDIT', 'DEBIT'];

const PAYBILL_MERCHANTS = {
  '000300': { merchant: 'Kenya Power',       category: 'UTILITIES'       },
  '888880': { merchant: 'Nairobi Water',      category: 'UTILITIES'       },
  '400200': { merchant: 'DSTV',               category: 'ENTERTAINMENT'   },
  '200999': { merchant: 'Zuku',               category: 'UTILITIES'       },
  '247247': { merchant: 'Equity Bank',        category: 'LOAN_REPAYMENT'  },
  '522533': { merchant: 'Safaricom Postpaid', category: 'AIRTIME_BUNDLES' },
  '777777': { merchant: 'M-Shwari',           category: 'SAVINGS'         },
  '333333': { merchant: 'KCB M-Pesa',         category: 'LOAN_REPAYMENT'  },
  '603045': { merchant: 'NHIF',               category: 'INSURANCE'       },
  '195195': { merchant: 'NSSF',               category: 'INSURANCE'       },
};

const KEYWORD_CATEGORIES = [
  { pattern: /salary|payroll|pay\s?slip/i,                merchantType: 'employer',      category: 'SALARY'            },
  { pattern: /kplc|kenya power|prepaid token/i,           merchantType: 'utility',       category: 'UTILITIES'         },
  { pattern: /nairobi water|nwsc/i,                       merchantType: 'utility',       category: 'UTILITIES'         },
  { pattern: /zuku|safaricom home|faiba/i,                merchantType: 'utility',       category: 'UTILITIES'         },
  { pattern: /naivas|carrefour|quickmart|cleanshelf/i,    merchantType: 'supermarket',   category: 'FOOD_GROCERIES'    },
  { pattern: /uber|bolt|little cab|matatu|fuel|shell|total|kenol/i, merchantType: 'transport', category: 'TRANSPORT'  },
  { pattern: /fuliza|m-shwari|kcb mpesa|tala|branch/i,   merchantType: 'lender',        category: 'LOAN_REPAYMENT'    },
  { pattern: /school|university|college|tuition|fees/i,  merchantType: 'education',     category: 'EDUCATION'         },
  { pattern: /pharmacy|hospital|clinic|medical/i,        merchantType: 'health',        category: 'HEALTH'            },
  { pattern: /nhif/i,                                    merchantType: 'insurance',     category: 'INSURANCE'         },
  { pattern: /nssf/i,                                    merchantType: 'insurance',     category: 'INSURANCE'         },
  { pattern: /dstv|netflix|showmax|youtube/i,            merchantType: 'entertainment', category: 'ENTERTAINMENT'     },
  { pattern: /airtime|safaricom|airtel|telkom/i,         merchantType: 'telco',         category: 'AIRTIME_BUNDLES'   },
  { pattern: /rent|landlord|caretaker|bedsitter/i,       merchantType: 'landlord',      category: 'RENT'              },
  { pattern: /withdraw|cash out|agent/i,                 merchantType: 'agent',         category: 'WITHDRAWAL'        },
  { pattern: /loan disbursement|loan credit/i,           merchantType: 'lender',        category: 'LOAN_DISBURSEMENT' },
  { pattern: /interest earned|interest credit/i,         merchantType: 'bank',          category: 'INTEREST_EARNED'   },
  { pattern: /business|invoice|payment received/i,       merchantType: 'business',      category: 'BUSINESS_INCOME'   },
  { pattern: /sent to|transfer to|paid to/i,             merchantType: 'peer',          category: 'TRANSFER_OUT'      },
  { pattern: /received from|transfer from/i,             merchantType: 'peer',          category: 'MOBILE_TRANSFER'   },
  { pattern: /savings|lock savings|fixed deposit/i,      merchantType: 'bank',          category: 'SAVINGS'           },
  { pattern: /till|buy goods/i,                          merchantType: 'merchant',      category: 'TILL'              },
  { pattern: /pay bill|paybill/i,                        merchantType: 'merchant',      category: 'PAYBILL'           },
];


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Generate a unique KipaAPI transaction ID
 */
const generateTxnId = () => `txn_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

/**
 * Parse a numeric string like "4,500.00" → 4500.00
 * Returns null if unparseable or zero
 */
const parseAmount = (raw) => {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[,\s]/g, '').trim();
  const val = parseFloat(cleaned);
  return (!isNaN(val) && val > 0) ? Math.round(val * 100) / 100 : null;
};

/**
 * Normalize a date string to ISO 8601 YYYY-MM-DD
 * Handles DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY, YYYY-MM-DD
 */
const parseDate = (raw) => {
  if (!raw) return null;
  const str = String(raw).trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-Mon-YYYY
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const dmonY = str.match(/^(\d{1,2})[\-\s]([a-zA-Z]{3})[\-\s](\d{4})/);
  if (dmonY) {
    const [, d, mon, y] = dmonY;
    const m = months[mon.toLowerCase()];
    if (m) return `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
};

/**
 * Infer category and merchant type from description text
 */
const inferCategory = (description = '') => {
  // Try paybill number first
  const paybillMatch = description.match(/\b(\d{5,7})\b/);
  if (paybillMatch) {
    const entry = PAYBILL_MERCHANTS[paybillMatch[1]];
    if (entry) return { category: entry.category, merchantType: 'merchant' };
  }

  // Keyword matching
  for (const { pattern, merchantType, category } of KEYWORD_CATEGORIES) {
    if (pattern.test(description)) return { category, merchantType };
  }

  return { category: 'OTHER', merchantType: 'unknown' };
};

/**
 * Clean a raw description string
 */
const cleanDescription = (raw = '') => {
  return raw
    .replace(/\b(Pay Bill Online|OBI|Mpesa|MPESA)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[-\s]+|[-\s]+$/g, '') || raw.trim();
};

/**
 * Validate that a normalized transaction has all required fields
 * Throws if invalid
 */
const validateNormalized = (txn) => {
  const required = ['id', 'account_id', 'date', 'amount', 'currency', 'type', 'source', 'ingestion_method', 'raw_description'];
  for (const field of required) {
    if (txn[field] === null || txn[field] === undefined || txn[field] === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  if (!VALID_TYPES.includes(txn.type)) {
    throw new Error(`Invalid transaction type: ${txn.type}`);
  }
  if (!VALID_SOURCES.includes(txn.source)) {
    throw new Error(`Invalid source: ${txn.source}`);
  }
  if (typeof txn.amount !== 'number' || txn.amount <= 0) {
    throw new Error(`Invalid amount: ${txn.amount}`);
  }
};


// ─────────────────────────────────────────────
// SOURCE-SPECIFIC NORMALIZERS
// ─────────────────────────────────────────────

/**
 * Normalize a raw M-Pesa Daraja API transaction
 *
 * Daraja C2B/B2C callback shape:
 * {
 *   TransID, TransTime, TransAmount, MSISDN,
 *   FirstName, MiddleName, LastName,
 *   TransactionType, OrgAccountBalance
 * }
 */
const normalizeMpesa = (raw, accountId) => {
  const paidIn    = parseAmount(raw.PaidIn    || raw.paid_in    || (raw.TransactionType === 'Pay Bill' ? null : raw.TransAmount));
  const withdrawn = parseAmount(raw.Withdrawn || raw.withdrawn  || (raw.TransactionType === 'Pay Bill' ? raw.TransAmount : null));

  const amount   = paidIn || withdrawn;
  const txnType  = paidIn ? 'CREDIT' : 'DEBIT';

  if (!amount) throw new Error('M-Pesa transaction has no parseable amount');

  const rawDesc = raw.Details || raw.details ||
    [raw.TransactionType, raw.OrgAccountBalance ? `Acc: ${raw.OrgAccountBalance}` : '']
      .filter(Boolean).join(' - ') || 'M-Pesa Transaction';

  const { category, merchantType } = inferCategory(rawDesc);
  const description = cleanDescription(rawDesc);

  // Parse datetime from Daraja format: "20260515143200" or "15/05/2026 14:32"
  let date = null;
  let datetime = null;
  const transTime = String(raw.TransTime || raw.CompletionTime || raw.completion_time || '');
  if (/^\d{14}$/.test(transTime)) {
    date     = `${transTime.slice(0,4)}-${transTime.slice(4,6)}-${transTime.slice(6,8)}`;
    datetime = `${date}T${transTime.slice(8,10)}:${transTime.slice(10,12)}:${transTime.slice(12,14)}+03:00`;
  } else {
    date     = parseDate(transTime.split(' ')[0]);
    const timePart = transTime.split(' ')[1];
    if (date && timePart) datetime = `${date}T${timePart}:00+03:00`;
  }

  if (!date) throw new Error(`Could not parse M-Pesa date: ${transTime}`);

  return {
    id:               generateTxnId(),
    account_id:       accountId,
    date,
    datetime,
    amount,
    currency:         'KES',
    type:             txnType,
    source:           'MPESA',
    ingestion_method: raw._ingestion_method || 'DARAJA_API',
    raw_description:  rawDesc,
    description,
    category,
    merchant:         PAYBILL_MERCHANTS[rawDesc.match(/\b(\d{5,7})\b/)?.[1]]?.merchant || null,
    merchant_type:    merchantType,
    reference:        raw.TransID || raw.receipt_no || raw.ReceiptNo || null,
    running_balance:  parseAmount(raw.OrgAccountBalance || raw.Balance || raw.balance),
    is_recurring:     false,
    is_income_signal: false,
    is_anomaly:       false,
    source_metadata:  {
      trans_id:   raw.TransID   || null,
      trans_time: raw.TransTime || null,
      msisdn:     raw.MSISDN    || null,
    },
    created_at: new Date().toISOString(),
  };
};

/**
 * Normalize a raw KCB Bank API transaction
 *
 * KCB API shape:
 * {
 *   transactionDate, valueDate, description,
 *   debitAmount, creditAmount, runningBalance,
 *   transactionReference
 * }
 */
const normalizeKcb = (raw, accountId) => {
  const creditAmt = parseAmount(raw.creditAmount || raw.credit || raw.Credit);
  const debitAmt  = parseAmount(raw.debitAmount  || raw.debit  || raw.Debit);

  const amount  = creditAmt || debitAmt;
  const txnType = creditAmt ? 'CREDIT' : 'DEBIT';

  if (!amount) throw new Error('KCB transaction has no parseable amount');

  const rawDesc = raw.description || raw.Description || raw.narrative || '';
  const { category, merchantType } = inferCategory(rawDesc);

  const date = parseDate(raw.transactionDate || raw.date || raw.Date);
  if (!date) throw new Error(`Could not parse KCB date: ${raw.transactionDate}`);

  // Extract reference from description if not provided
  const refFromDesc = rawDesc.match(/\b([A-Z0-9]{8,20})\b/)?.[1];

  return {
    id:               generateTxnId(),
    account_id:       accountId,
    date,
    datetime:         null,
    amount,
    currency:         'KES',
    type:             txnType,
    source:           'KCB',
    ingestion_method: raw._ingestion_method || 'BANK_API',
    raw_description:  rawDesc,
    description:      cleanDescription(rawDesc),
    category,
    merchant:         null,
    merchant_type:    merchantType,
    reference:        raw.transactionReference || raw.reference || refFromDesc || null,
    running_balance:  parseAmount(raw.runningBalance || raw.balance),
    is_recurring:     false,
    is_income_signal: false,
    is_anomaly:       false,
    source_metadata: {
      value_date: raw.valueDate || null,
      branch:     raw.branch    || null,
    },
    created_at: new Date().toISOString(),
  };
};

/**
 * Normalize a raw Equity Bank API transaction
 *
 * Equity API shape:
 * {
 *   postingDate, valueDate, narrative,
 *   debitAmount, creditAmount, runningBalance,
 *   transactionId
 * }
 */
const normalizeEquity = (raw, accountId) => {
  const creditAmt = parseAmount(raw.creditAmount || raw.CreditAmount || raw.credit);
  const debitAmt  = parseAmount(raw.debitAmount  || raw.DebitAmount  || raw.debit);

  const amount  = creditAmt || debitAmt;
  const txnType = creditAmt ? 'CREDIT' : 'DEBIT';

  if (!amount) throw new Error('Equity transaction has no parseable amount');

  const rawDesc = raw.narrative || raw.Narrative || raw.description || '';
  const { category, merchantType } = inferCategory(rawDesc);

  const date = parseDate(raw.postingDate || raw.PostingDate || raw.date);
  if (!date) throw new Error(`Could not parse Equity date: ${raw.postingDate}`);

  return {
    id:               generateTxnId(),
    account_id:       accountId,
    date,
    datetime:         null,
    amount,
    currency:         'KES',
    type:             txnType,
    source:           'EQUITY',
    ingestion_method: raw._ingestion_method || 'BANK_API',
    raw_description:  rawDesc,
    description:      cleanDescription(rawDesc),
    category,
    merchant:         null,
    merchant_type:    merchantType,
    reference:        raw.transactionId || raw.TransactionId || raw.reference || null,
    running_balance:  parseAmount(raw.runningBalance || raw.RunningBalance),
    is_recurring:     false,
    is_income_signal: false,
    is_anomaly:       false,
    source_metadata: {
      value_date:     raw.valueDate     || null,
      transaction_id: raw.transactionId || null,
    },
    created_at: new Date().toISOString(),
  };
};

/**
 * Normalize a raw Co-op Bank API transaction
 *
 * Co-op API shape:
 * {
 *   transDate, valueDate, transactionRef,
 *   description, drAmount, crAmount, balance
 * }
 */
const normalizeCoop = (raw, accountId) => {
  const creditAmt = parseAmount(raw.crAmount || raw.CrAmount || raw.credit);
  const debitAmt  = parseAmount(raw.drAmount || raw.DrAmount || raw.debit);

  const amount  = creditAmt || debitAmt;
  const txnType = creditAmt ? 'CREDIT' : 'DEBIT';

  if (!amount) throw new Error('Co-op transaction has no parseable amount');

  const rawDesc = raw.description || raw.Description || raw.narrative || '';
  const { category, merchantType } = inferCategory(rawDesc);

  const date = parseDate(raw.transDate || raw.TransDate || raw.date);
  if (!date) throw new Error(`Could not parse Co-op date: ${raw.transDate}`);

  return {
    id:               generateTxnId(),
    account_id:       accountId,
    date,
    datetime:         null,
    amount,
    currency:         'KES',
    type:             txnType,
    source:           'COOP',
    ingestion_method: raw._ingestion_method || 'BANK_API',
    raw_description:  rawDesc,
    description:      cleanDescription(rawDesc),
    category,
    merchant:         null,
    merchant_type:    merchantType,
    reference:        raw.transactionRef || raw.TransactionRef || raw.reference || null,
    running_balance:  parseAmount(raw.balance || raw.Balance),
    is_recurring:     false,
    is_income_signal: false,
    is_anomaly:       false,
    source_metadata: {
      value_date: raw.valueDate || null,
      trans_ref:  raw.transactionRef || null,
    },
    created_at: new Date().toISOString(),
  };
};

/**
 * Pass-through normalizer for transactions already normalized by
 * the PDF/CSV parsers. Validates and fills any missing fields.
 */
const normalizePreParsed = (raw, accountId) => {
  // Already in our schema — just validate and ensure account_id is set
  const txn = {
    ...raw,
    account_id: accountId || raw.account_id,
    id:         raw.id || generateTxnId(),
    created_at: raw.created_at || new Date().toISOString(),
  };
  validateNormalized(txn);
  return txn;
};


// ─────────────────────────────────────────────
// MAIN ENTRY POINTS
// ─────────────────────────────────────────────

/**
 * Normalize a single raw transaction from any source.
 *
 * @param {Object} raw        - Raw transaction object from source
 * @param {string} source     - 'MPESA' | 'KCB' | 'EQUITY' | 'COOP' | 'PRE_PARSED'
 * @param {string} accountId  - KipaAPI account ID
 * @returns {Object}          - Normalized transaction
 */
const normalize = (raw, source, accountId = 'acc_unknown') => {
  const normalizers = {
    MPESA:      normalizeMpesa,
    KCB:        normalizeKcb,
    EQUITY:     normalizeEquity,
    COOP:       normalizeCoop,
    PRE_PARSED: normalizePreParsed,
  };

  const normalizer = normalizers[source];
  if (!normalizer) {
    throw new Error(`Unsupported source: ${source}. Must be one of: ${Object.keys(normalizers).join(', ')}`);
  }

  const txn = normalizer(raw, accountId);
  validateNormalized(txn);
  return txn;
};

/**
 * Normalize an array of raw transactions from the same source.
 * Skips invalid rows and logs errors rather than crashing.
 *
 * @param {Array}  rawArray   - Array of raw transaction objects
 * @param {string} source     - Source identifier
 * @param {string} accountId  - KipaAPI account ID
 * @returns {{ transactions: Array, errors: Array, skipped: number }}
 */
const normalizeMany = (rawArray, source, accountId = 'acc_unknown') => {
  const transactions = [];
  const errors       = [];

  for (let i = 0; i < rawArray.length; i++) {
    try {
      const txn = normalize(rawArray[i], source, accountId);
      transactions.push(txn);
    } catch (err) {
      errors.push({ index: i, error: err.message, raw: rawArray[i] });
      logger.warn(`[normalizer] Skipped row ${i}: ${err.message}`);
    }
  }

  return {
    transactions,
    errors,
    skipped: errors.length,
    total:   transactions.length,
  };
};

/**
 * Normalize the output of the PDF/CSV parsers.
 * Those parsers already return normalized transactions,
 * so this just validates and ensures account_id is set.
 *
 * @param {Object} parserResult - Result object from parse_statement() or ingest_csv()
 * @param {string} accountId    - KipaAPI account ID to assign
 * @returns {{ transactions: Array, errors: Array, skipped: number, total: number }}
 */
const normalizeParserOutput = (parserResult, accountId) => {
  const { transactions: raw = [], source } = parserResult;
  return normalizeMany(raw, 'PRE_PARSED', accountId);
};


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  normalize,
  normalizeMany,
  normalizeParserOutput,
  // Exported for testing
  parseAmount,
  parseDate,
  inferCategory,
  cleanDescription,
  validateNormalized,
};


// ─────────────────────────────────────────────
// SELF-TESTS (run with: node normalizer.service.js)
// ─────────────────────────────────────────────

if (require.main === module) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`  ✓ ${message}`);
  };

  console.log('\nRunning normalizer self-tests...\n');

  // Test helpers
  assert(parseAmount('4,500.00') === 4500,    'parseAmount handles comma-formatted string');
  assert(parseAmount('85000')    === 85000,   'parseAmount handles plain number string');
  assert(parseAmount('')         === null,    'parseAmount returns null for empty string');
  assert(parseAmount('-500')     === null,    'parseAmount returns null for negative');

  assert(parseDate('15/05/2026') === '2026-05-15', 'parseDate handles DD/MM/YYYY');
  assert(parseDate('15-May-2026') === '2026-05-15','parseDate handles DD-Mon-YYYY');
  assert(parseDate('2026-05-15') === '2026-05-15', 'parseDate handles ISO format');

  const { category: cat1 } = inferCategory('EFT CREDIT EMPLOYER PAYROLL SAFARICOM LTD');
  assert(cat1 === 'SALARY', 'inferCategory detects SALARY');

  const { category: cat2 } = inferCategory('Pay Bill Online 000300 KPLC PREPAID');
  assert(cat2 === 'UTILITIES', 'inferCategory detects UTILITIES via paybill');

  const { category: cat3 } = inferCategory('Withdraw Cash Agent 12345');
  assert(cat3 === 'WITHDRAWAL', 'inferCategory detects WITHDRAWAL');

  // Test M-Pesa Daraja normalization
  const mpesaRaw = {
    TransID:          'QK12ABC456',
    TransTime:        '20260515143200',
    TransAmount:      '4500',
    TransactionType:  'Pay Bill',
    Details:          'Pay Bill Online 000300 - KPLC PREPAID',
    Withdrawn:        '4500',
    PaidIn:           '',
    Balance:          '12450.00',
  };
  const mpesaTxn = normalize(mpesaRaw, 'MPESA', 'acc_test');
  assert(mpesaTxn.type    === 'DEBIT',     'M-Pesa: DEBIT detected correctly');
  assert(mpesaTxn.amount  === 4500,        'M-Pesa: amount parsed correctly');
  assert(mpesaTxn.source  === 'MPESA',     'M-Pesa: source set correctly');
  assert(mpesaTxn.date    === '2026-05-15','M-Pesa: date parsed from TransTime');
  assert(mpesaTxn.category === 'UTILITIES','M-Pesa: UTILITIES category inferred');

  // Test KCB normalization
  const kcbRaw = {
    transactionDate:      '15-May-2026',
    description:          'EFT CREDIT EMPLOYER PAYROLL SAFARICOM LTD',
    creditAmount:         '85000.00',
    debitAmount:          '',
    runningBalance:       '102450.75',
    transactionReference: 'KCB20260515001',
  };
  const kcbTxn = normalize(kcbRaw, 'KCB', 'acc_test');
  assert(kcbTxn.type     === 'CREDIT',  'KCB: CREDIT detected correctly');
  assert(kcbTxn.amount   === 85000,     'KCB: amount parsed correctly');
  assert(kcbTxn.category === 'SALARY',  'KCB: SALARY category inferred');

  // Test Equity normalization
  const equityRaw = {
    postingDate:   '15/05/2026',
    narrative:     'NAIVAS SUPERMARKET WESTLANDS PURCHASE',
    debitAmount:   '2300.00',
    creditAmount:  '',
    runningBalance:'95650.75',
  };
  const equityTxn = normalize(equityRaw, 'EQUITY', 'acc_test');
  assert(equityTxn.type     === 'DEBIT',          'Equity: DEBIT detected correctly');
  assert(equityTxn.category === 'FOOD_GROCERIES', 'Equity: FOOD_GROCERIES inferred');

  // Test Co-op normalization
  const coopRaw = {
    transDate:      '15/05/2026',
    description:    'SALARY CREDIT MINISTRY OF EDUCATION',
    crAmount:       '45000.00',
    drAmount:       '',
    balance:        '48200.00',
    transactionRef: 'RTGS/001/150526',
  };
  const coopTxn = normalize(coopRaw, 'COOP', 'acc_test');
  assert(coopTxn.type     === 'CREDIT', 'Co-op: CREDIT detected correctly');
  assert(coopTxn.category === 'SALARY', 'Co-op: SALARY inferred');

  // Test normalizeMany skips bad rows without crashing
  const mixed = [kcbRaw, { bad: 'data' }, equityRaw];
  const result = normalizeMany(mixed, 'KCB', 'acc_test');
  assert(result.total   === 2, 'normalizeMany: processes valid rows');
  assert(result.skipped === 1, 'normalizeMany: skips invalid rows');
  assert(result.errors.length === 1, 'normalizeMany: records errors');

  console.log('\nAll normalizer self-tests passed.\n');
}