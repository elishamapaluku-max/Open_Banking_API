/**
 * KipaAPI — Claude Prompt Engineering
 * ======================================
 * System prompts and prompt builders for all Claude API calls in KipaAPI.
 *
 * Three prompt contexts:
 *   1. TRANSACTION CATEGORIZATION  — categorize + flag transactions
 *   2. INCOME ESTIMATION           — detect income patterns, estimate monthly income
 *   3. BORROWER PROFILE            — generate human-readable credit narrative
 *
 * Used exclusively by: services/claude.service.js
 * Never call Claude directly from controllers or routes.
 */

// ─────────────────────────────────────────────
// 1. TRANSACTION CATEGORIZATION PROMPT
// ─────────────────────────────────────────────

/**
 * System prompt for transaction categorization.
 * Claude receives an array of normalized transactions and returns
 * the same array with category, merchant, and flags populated.
 */
const CATEGORIZATION_SYSTEM_PROMPT = `
You are a financial data analyst specializing in East African and Kenyan banking transactions.
You will receive an array of normalized financial transactions from Kenyan sources including
M-Pesa, KCB, Equity Bank, and Co-operative Bank.

Your job is to analyze each transaction and return structured JSON with:
1. The correct category for each transaction
2. The merchant name where identifiable
3. Flags for recurring payments, income signals, and anomalies

KENYAN FINANCIAL CONTEXT:
- M-Pesa is Kenya's dominant mobile money platform (Safaricom)
- Paybill numbers are used to pay utilities, loans, and services (e.g. 000300 = Kenya Power)
- Till numbers are used for retail purchases (Buy Goods)
- Fuliza is an M-Pesa overdraft product — repayments indicate short-term borrowing
- M-Shwari and KCB M-Pesa are mobile savings/loan products
- NHIF = National Hospital Insurance Fund (mandatory health insurance)
- NSSF = National Social Security Fund (mandatory pension contribution)
- Salary payments in Kenya typically arrive on the 25th-31st or 1st-5th of each month
- Common Kenyan supermarkets: Naivas, Carrefour, Quickmart, Cleanshelf, Chandarana
- Common Kenyan fuel stations: Shell, Total, Kenol, OilLibya, Rubis

VALID CATEGORIES (use exactly these strings):
Income: SALARY, BUSINESS_INCOME, MOBILE_TRANSFER, LOAN_DISBURSEMENT, INTEREST_EARNED
Expenses: FOOD_GROCERIES, TRANSPORT, UTILITIES, RENT, AIRTIME_BUNDLES, LOAN_REPAYMENT,
          INSURANCE, SAVINGS, ENTERTAINMENT, SHOPPING, EDUCATION, HEALTH,
          WITHDRAWAL, PAYBILL, TILL, TRANSFER_OUT, OTHER

FLAGGING RULES:
- is_recurring: true if this type of transaction appears 2+ times in the dataset at regular intervals
- is_income_signal: true if CREDIT transaction that looks like salary, business income, or regular payment from an employer
- is_anomaly: true if the amount is unusually large (3x+ the average for that category) OR the transaction pattern breaks significantly from the norm

OUTPUT FORMAT:
Return ONLY a valid JSON object. No explanation, no markdown, no code fences. Exactly this structure:

{
  "transactions": [
    {
      "id": "<original transaction id>",
      "category": "<CATEGORY>",
      "merchant": "<merchant name or null>",
      "merchant_type": "<type or null>",
      "is_recurring": <true|false>,
      "is_income_signal": <true|false>,
      "is_anomaly": <false|true>
    }
  ]
}

RULES:
- Return every transaction in the input — do not skip any
- Preserve the original transaction id exactly
- If you cannot determine the category, use OTHER
- merchant should be a clean business name (e.g. "Kenya Power", "Naivas Westlands") or null
- Analyze the full dataset before flagging recurring and anomaly — they require cross-transaction context
`.trim();

/**
 * Build the user message for transaction categorization.
 * @param {Array} transactions - Array of normalized transactions (category=null)
 * @returns {string} - Formatted user message
 */
const buildCategorizationPrompt = (transactions) => {
  // Send only the fields Claude needs — strip noise
  const slim = transactions.map(t => ({
    id:          t.id,
    date:        t.date,
    amount:      t.amount,
    type:        t.type,
    source:      t.source,
    description: t.raw_description,
    category:    t.category, // may be pre-filled by keyword matching
  }));

  return `Categorize these ${slim.length} Kenyan financial transactions:\n\n${JSON.stringify(slim, null, 2)}`;
};


// ─────────────────────────────────────────────
// 2. INCOME ESTIMATION PROMPT
// ─────────────────────────────────────────────

/**
 * System prompt for income estimation.
 * Claude analyzes transaction patterns to estimate monthly income,
 * identify income sources, and assess income stability.
 */
const INCOME_ESTIMATION_SYSTEM_PROMPT = `
You are a credit analyst specializing in informal and formal income assessment
for East African borrowers. You will receive a set of categorized financial transactions
from a Kenyan bank or M-Pesa account.

Your job is to estimate the borrower's monthly income based on transaction patterns.

INCOME DETECTION RULES:
1. SALARY: Look for regular CREDIT transactions from the same source on similar dates each month
2. BUSINESS INCOME: Irregular CREDIT transactions with descriptions suggesting business payments
3. MOBILE TRANSFERS: Frequent small-to-medium CREDIT transfers that may indicate business activity
4. LOAN DISBURSEMENTS: Large one-off CREDIT transactions — do NOT count as income
5. Ignore interest credits under KES 1,000 — not significant income

KENYAN INCOME CONTEXT:
- Minimum wage in Kenya (2026): ~KES 15,000/month
- Median formal sector salary: ~KES 45,000-80,000/month  
- Many Kenyans have multiple income streams (salary + business + casual work)
- M-Pesa "Received from" entries may be salary from informal employers
- Regular round-number credits (e.g. 50,000 exactly, same day monthly) strongly indicate salary

CONFIDENCE LEVELS:
- HIGH: Clear salary pattern visible (same source, same amount ±10%, same date ±5 days, 2+ months)
- MEDIUM: Income visible but irregular or from multiple sources
- LOW: Insufficient data or highly irregular credits only

OUTPUT FORMAT:
Return ONLY valid JSON. No explanation, no markdown, no code fences:

{
  "estimated_monthly_income": <number in KES>,
  "income_confidence": "HIGH" | "MEDIUM" | "LOW",
  "income_sources": ["SALARY", "BUSINESS_INCOME"],
  "income_breakdown": [
    {
      "source_type": "SALARY",
      "estimated_amount": <number>,
      "frequency": "MONTHLY",
      "employer_hint": "<name if detectable or null>",
      "first_seen": "<YYYY-MM-DD>",
      "last_seen": "<YYYY-MM-DD>",
      "consistency": "CONSISTENT" | "IRREGULAR"
    }
  ],
  "data_period_months": <number>,
  "total_credits_analyzed": <number>,
  "notes": "<brief analyst note — 1 sentence max>"
}
`.trim();

/**
 * Build the user message for income estimation.
 * @param {Array} transactions - Categorized transactions
 * @param {Object} period - { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * @returns {string}
 */
const buildIncomePrompt = (transactions, period = {}) => {
  // Send only CREDIT transactions for income analysis
  const credits = transactions
    .filter(t => t.type === 'CREDIT')
    .map(t => ({
      id:       t.id,
      date:     t.date,
      amount:   t.amount,
      source:   t.source,
      description: t.raw_description,
      category: t.category,
    }));

  const periodStr = period.from && period.to
    ? `Data period: ${period.from} to ${period.to}`
    : `Total transactions: ${transactions.length}`;

  return `Estimate monthly income from these ${credits.length} credit transactions.\n${periodStr}\n\n${JSON.stringify(credits, null, 2)}`;
};


// ─────────────────────────────────────────────
// 3. BORROWER PROFILE PROMPT
// ─────────────────────────────────────────────

/**
 * System prompt for borrower profile generation.
 * Claude generates a plain-English summary suitable for a loan officer
 * who does not have time to interpret raw transaction data.
 */
const BORROWER_PROFILE_SYSTEM_PROMPT = `
You are a credit analyst writing borrower financial profiles for Kenyan lending institutions —
SACCOs, microfinance institutions, and digital lenders.

You will receive a financial summary including categorized transactions, income estimates,
spending patterns, and flagged signals. Your job is to write a clear, factual borrower profile
that a loan officer can read in under 30 seconds and use to make a lending decision.

WRITING RULES:
1. Write 4-6 sentences maximum — no more
2. Lead with income: amount, source, consistency
3. Mention top 2-3 expense categories with approximate amounts
4. Flag any risk signals: Fuliza usage, loan repayments, irregular income, anomalies
5. End with a one-sentence risk assessment (LOW / MEDIUM / HIGH risk)
6. Write in plain English — no financial jargon, no abbreviations the officer won't know
7. Be factual — do not make assumptions beyond what the data shows
8. Do not use bullet points — write in flowing prose
9. Use Kenyan context: mention M-Pesa, SACCO, etc. naturally

TONE: Professional, concise, neutral. Like a bank statement summary written by a human analyst.

RISK SIGNAL KEYWORDS TO WATCH FOR:
- Fuliza repayments → liquidity pressure
- Multiple loan repayments → over-indebtedness risk
- Declining balance trend → financial stress
- Irregular income → unstable cash flow
- Large unexplained cash withdrawals → transparency concern
- No savings activity → low financial resilience

OUTPUT FORMAT:
Return ONLY a JSON object. No markdown, no code fences:

{
  "borrower_narrative": "<4-6 sentence profile>",
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "risk_factors": ["<factor1>", "<factor2>"],
  "positive_signals": ["<signal1>", "<signal2>"],
  "recommended_max_loan_multiple": <number>
}

The recommended_max_loan_multiple is a multiplier of monthly income
(e.g. 3 means recommend maximum loan of 3x monthly income).
Use conservative values: LOW risk = up to 5x, MEDIUM = up to 3x, HIGH = up to 1x.
`.trim();

/**
 * Build the user message for borrower profile generation.
 * @param {Object} summary - Aggregated financial summary
 * @param {Array}  transactions - Full categorized transaction array
 * @returns {string}
 */
const buildBorrowerProfilePrompt = (summary, transactions) => {
  // Build spending breakdown by category
  const spending = {};
  transactions.forEach(t => {
    if (t.type === 'DEBIT' && t.category) {
      spending[t.category] = (spending[t.category] || 0) + t.amount;
    }
  });

  // Sort by amount descending
  const topExpenses = Object.entries(spending)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, amount]) => ({ category: cat, total: Math.round(amount) }));

  // Count recurring and anomalies
  const recurringCount = transactions.filter(t => t.is_recurring).length;
  const anomalyCount   = transactions.filter(t => t.is_anomaly).length;
  const loanRepayments = transactions.filter(t => t.category === 'LOAN_REPAYMENT');
  const hasFuliza      = transactions.some(t =>
    t.raw_description && /fuliza/i.test(t.raw_description)
  );

  const profileInput = {
    period:                  summary.period,
    estimated_monthly_income: summary.estimated_monthly_income,
    income_confidence:        summary.income_confidence,
    income_sources:           summary.income_sources,
    total_credits:            summary.total_credits,
    total_debits:             summary.total_debits,
    net_cashflow:             summary.net_cashflow,
    top_expenses:             topExpenses,
    loan_repayments_count:    loanRepayments.length,
    loan_repayment_total:     Math.round(loanRepayments.reduce((s, t) => s + t.amount, 0)),
    has_fuliza_activity:      hasFuliza,
    has_savings_activity:     transactions.some(t => t.category === 'SAVINGS'),
    recurring_transactions:   recurringCount,
    anomalies_detected:       anomalyCount,
    transaction_count:        transactions.length,
  };

  return `Generate a borrower profile from this financial summary:\n\n${JSON.stringify(profileInput, null, 2)}`;
};


// ─────────────────────────────────────────────
// 4. DEVELOPER ASSISTANT PROMPT
// ─────────────────────────────────────────────

/**
 * System prompt for the developer portal chat assistant.
 * This is a separate Claude instance focused on API documentation help.
 */
const DEVELOPER_ASSISTANT_SYSTEM_PROMPT = `
You are KipaAPI's developer assistant. You help software engineers integrate
with the KipaAPI open banking platform.

You have deep knowledge of:
- KipaAPI's REST API endpoints and request/response formats
- OAuth 2.0 consent flow for connecting user bank accounts
- The normalized transaction schema and what each field means
- Common integration errors and how to fix them
- M-Pesa Daraja API basics (since KipaAPI uses it as a data source)
- The KipaAPI transaction categories and how Claude assigns them

KipaAPI ENDPOINTS:
- POST /auth/connect — initiate OAuth flow for a user + institution
- GET /accounts/{id}/balance — get current balance
- GET /accounts/{id}/transactions — get paginated transaction history
- POST /analyze/profile — generate Claude borrower profile from transactions
- POST /analyze/income — estimate monthly income from transaction patterns
- POST /parse/statement — upload PDF/CSV bank statement
- GET /institutions — list supported banks and mobile money operators

RESPONSE FORMAT (all endpoints):
Success: { "success": true, "message": "...", "data": {}, "timestamp": "" }
Error:   { "success": false, "message": "...", "details": null, "timestamp": "" }

TONE: Helpful, technical, concise. Like a senior engineer on the KipaAPI team.
If you don't know something specific about the API, say so honestly.
Never make up endpoint behavior — only describe what is documented above.
`.trim();


// ─────────────────────────────────────────────
// RESPONSE VALIDATORS
// ─────────────────────────────────────────────

/**
 * Validate Claude's categorization response.
 * Returns { valid: true, data } or { valid: false, error }
 */
const validateCategorizationResponse = (raw, expectedCount) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
      return { valid: false, error: 'Response missing transactions array' };
    }
    if (parsed.transactions.length !== expectedCount) {
      return {
        valid: false,
        error: `Expected ${expectedCount} transactions, got ${parsed.transactions.length}`,
      };
    }

    const validCategories = [
      'SALARY','BUSINESS_INCOME','MOBILE_TRANSFER','LOAN_DISBURSEMENT','INTEREST_EARNED',
      'FOOD_GROCERIES','TRANSPORT','UTILITIES','RENT','AIRTIME_BUNDLES','LOAN_REPAYMENT',
      'INSURANCE','SAVINGS','ENTERTAINMENT','SHOPPING','EDUCATION','HEALTH',
      'WITHDRAWAL','PAYBILL','TILL','TRANSFER_OUT','OTHER',
    ];

    for (const t of parsed.transactions) {
      if (!t.id)       return { valid: false, error: `Transaction missing id` };
      if (!t.category) return { valid: false, error: `Transaction ${t.id} missing category` };
      if (!validCategories.includes(t.category)) {
        return { valid: false, error: `Invalid category: ${t.category}` };
      }
    }

    return { valid: true, data: parsed };
  } catch (err) {
    return { valid: false, error: `JSON parse error: ${err.message}` };
  }
};

/**
 * Validate Claude's income estimation response.
 */
const validateIncomeResponse = (raw) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (typeof parsed.estimated_monthly_income !== 'number') {
      return { valid: false, error: 'Missing or invalid estimated_monthly_income' };
    }
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(parsed.income_confidence)) {
      return { valid: false, error: `Invalid income_confidence: ${parsed.income_confidence}` };
    }
    if (!Array.isArray(parsed.income_sources)) {
      return { valid: false, error: 'Missing income_sources array' };
    }

    return { valid: true, data: parsed };
  } catch (err) {
    return { valid: false, error: `JSON parse error: ${err.message}` };
  }
};

/**
 * Validate Claude's borrower profile response.
 */
const validateBorrowerProfileResponse = (raw) => {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!parsed.borrower_narrative || typeof parsed.borrower_narrative !== 'string') {
      return { valid: false, error: 'Missing borrower_narrative' };
    }
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(parsed.risk_level)) {
      return { valid: false, error: `Invalid risk_level: ${parsed.risk_level}` };
    }
    if (typeof parsed.recommended_max_loan_multiple !== 'number') {
      return { valid: false, error: 'Missing recommended_max_loan_multiple' };
    }

    return { valid: true, data: parsed };
  } catch (err) {
    return { valid: false, error: `JSON parse error: ${err.message}` };
  }
};

/**
 * Strip markdown code fences from Claude's response.
 * Claude sometimes wraps JSON in ```json ... ``` despite instructions.
 * Always sanitize before parsing.
 */
const stripCodeFences = (raw = '') => {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};


// ─────────────────────────────────────────────
// FALLBACK RESPONSES
// ─────────────────────────────────────────────
// Used when Claude times out or returns invalid JSON.
// The API must never break because of an AI failure.

const CATEGORIZATION_FALLBACK = (transactions) => ({
  transactions: transactions.map(t => ({
    id:            t.id,
    category:      t.category || 'OTHER',
    merchant:      t.merchant || null,
    merchant_type: t.merchant_type || null,
    is_recurring:  false,
    is_income_signal: false,
    is_anomaly:    false,
  })),
});

const INCOME_FALLBACK = {
  estimated_monthly_income: 0,
  income_confidence:        'LOW',
  income_sources:           [],
  income_breakdown:         [],
  data_period_months:       0,
  total_credits_analyzed:   0,
  notes:                    'Income estimation unavailable — AI service timeout.',
};

const BORROWER_PROFILE_FALLBACK = {
  borrower_narrative:             'Borrower profile could not be generated at this time. Please review transaction history manually.',
  risk_level:                     'MEDIUM',
  risk_factors:                   ['Profile generation failed — manual review required'],
  positive_signals:               [],
  recommended_max_loan_multiple:  1,
};


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  // System prompts
  CATEGORIZATION_SYSTEM_PROMPT,
  INCOME_ESTIMATION_SYSTEM_PROMPT,
  BORROWER_PROFILE_SYSTEM_PROMPT,
  DEVELOPER_ASSISTANT_SYSTEM_PROMPT,

  // Prompt builders
  buildCategorizationPrompt,
  buildIncomePrompt,
  buildBorrowerProfilePrompt,

  // Validators
  validateCategorizationResponse,
  validateIncomeResponse,
  validateBorrowerProfileResponse,
  stripCodeFences,

  // Fallbacks
  CATEGORIZATION_FALLBACK,
  INCOME_FALLBACK,
  BORROWER_PROFILE_FALLBACK,
};


// ─────────────────────────────────────────────
// SELF-TESTS
// ─────────────────────────────────────────────

if (require.main === module) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`FAIL: ${message}`);
    console.log(`  ✓ ${message}`);
  };

  console.log('\nRunning prompt engineering self-tests...\n');

  // Test prompt builders don't crash
  const sampleTxns = [
    { id: 'txn_001', date: '2026-05-15', amount: 85000, type: 'CREDIT',
      source: 'KCB', raw_description: 'SALARY CREDIT SAFARICOM', category: 'SALARY',
      merchant: null, merchant_type: 'employer', is_recurring: false,
      is_income_signal: false, is_anomaly: false },
    { id: 'txn_002', date: '2026-05-16', amount: 4500, type: 'DEBIT',
      source: 'MPESA', raw_description: 'Pay Bill 000300 KPLC', category: 'UTILITIES',
      merchant: 'Kenya Power', merchant_type: 'utility', is_recurring: true,
      is_income_signal: false, is_anomaly: false },
  ];

  const catPrompt = buildCategorizationPrompt(sampleTxns);
  assert(catPrompt.includes('txn_001'), 'buildCategorizationPrompt includes transaction ids');
  assert(catPrompt.includes('2 Kenyan'), 'buildCategorizationPrompt includes count');

  const incomePrompt = buildIncomePrompt(sampleTxns, { from: '2026-01-01', to: '2026-05-31' });
  assert(incomePrompt.includes('txn_001'), 'buildIncomePrompt includes CREDIT transactions');
  assert(!incomePrompt.includes('txn_002'), 'buildIncomePrompt excludes DEBIT transactions');

  const summary = {
    period: { from: '2026-01-01', to: '2026-05-31' },
    estimated_monthly_income: 85000,
    income_confidence: 'HIGH',
    income_sources: ['SALARY'],
    total_credits: 425000,
    total_debits: 310000,
    net_cashflow: 115000,
  };
  const profilePrompt = buildBorrowerProfilePrompt(summary, sampleTxns);
  assert(profilePrompt.includes('85000'), 'buildBorrowerProfilePrompt includes income');

  // Test validators
  const goodCatResponse = JSON.stringify({
    transactions: [
      { id: 'txn_001', category: 'SALARY', merchant: null, merchant_type: 'employer',
        is_recurring: true, is_income_signal: true, is_anomaly: false },
      { id: 'txn_002', category: 'UTILITIES', merchant: 'Kenya Power', merchant_type: 'utility',
        is_recurring: true, is_income_signal: false, is_anomaly: false },
    ]
  });
  const catResult = validateCategorizationResponse(goodCatResponse, 2);
  assert(catResult.valid === true, 'validateCategorizationResponse accepts valid response');

  const badCatResponse = JSON.stringify({ transactions: [{ id: 'txn_001', category: 'INVALID_CAT' }] });
  const badCatResult = validateCategorizationResponse(badCatResponse, 1);
  assert(badCatResult.valid === false, 'validateCategorizationResponse rejects invalid category');

  const goodIncomeResponse = JSON.stringify({
    estimated_monthly_income: 85000,
    income_confidence: 'HIGH',
    income_sources: ['SALARY'],
    income_breakdown: [],
    data_period_months: 5,
    total_credits_analyzed: 1,
    notes: 'Consistent salary pattern detected.',
  });
  const incResult = validateIncomeResponse(goodIncomeResponse);
  assert(incResult.valid === true, 'validateIncomeResponse accepts valid response');

  const goodProfileResponse = JSON.stringify({
    borrower_narrative: 'The applicant receives a consistent monthly salary of KES 85,000.',
    risk_level: 'LOW',
    risk_factors: [],
    positive_signals: ['Consistent salary'],
    recommended_max_loan_multiple: 4,
  });
  const profResult = validateBorrowerProfileResponse(goodProfileResponse);
  assert(profResult.valid === true, 'validateBorrowerProfileResponse accepts valid response');

  // Test stripCodeFences
  const fenced = '```json\n{"key": "value"}\n```';
  assert(stripCodeFences(fenced) === '{"key": "value"}', 'stripCodeFences removes markdown fences');
  assert(stripCodeFences('{"key": "value"}') === '{"key": "value"}', 'stripCodeFences leaves clean JSON alone');

  // Test fallbacks are valid shapes
  const fallbackCat = CATEGORIZATION_FALLBACK(sampleTxns);
  assert(fallbackCat.transactions.length === 2, 'CATEGORIZATION_FALLBACK returns correct count');
  assert(INCOME_FALLBACK.income_confidence === 'LOW', 'INCOME_FALLBACK has LOW confidence');
  assert(BORROWER_PROFILE_FALLBACK.risk_level === 'MEDIUM', 'BORROWER_PROFILE_FALLBACK has MEDIUM risk');

  console.log('\nAll prompt engineering self-tests passed.\n');
}
