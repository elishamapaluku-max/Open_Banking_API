/**
 * KipaAPI — Claude Service
 * =========================
 * All Anthropic API calls go through this file exclusively.
 * No other file in the codebase should import the Anthropic SDK directly.
 *
 * Exposes three functions:
 *   categorizeTransactions(transactions)
 *   estimateIncome(transactions, period)
 *   generateBorrowerProfile(summary, transactions)
 *
 * Each function:
 *   - Builds the prompt using prompts.js
 *   - Calls Claude API
 *   - Validates the response
 *   - Returns a fallback if Claude fails
 *   - Never throws — the API must not break because of AI failure
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../utils/logger');
const {
  CATEGORIZATION_SYSTEM_PROMPT,
  INCOME_ESTIMATION_SYSTEM_PROMPT,
  BORROWER_PROFILE_SYSTEM_PROMPT,
  DEVELOPER_ASSISTANT_SYSTEM_PROMPT,
  buildCategorizationPrompt,
  buildIncomePrompt,
  buildBorrowerProfilePrompt,
  validateCategorizationResponse,
  validateIncomeResponse,
  validateBorrowerProfileResponse,
  stripCodeFences,
  CATEGORIZATION_FALLBACK,
  INCOME_FALLBACK,
  BORROWER_PROFILE_FALLBACK,
} = require('./prompts');

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

// API key is injected via config/env.js — never hardcoded
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL   = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 30000; // 30 seconds — fail fast for demo reliability

// Max transactions to send in one Claude call
// Larger batches = better cross-transaction context for recurring/anomaly detection
const BATCH_SIZE = 100;


// ─────────────────────────────────────────────
// CORE CALLER
// ─────────────────────────────────────────────

/**
 * Make a single Claude API call with timeout protection.
 * Returns the raw text response or throws on failure.
 */
const callClaude = async (systemPrompt, userMessage) => {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }, { signal: controller.signal });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

  } finally {
    clearTimeout(timeout);
  }
};


// ─────────────────────────────────────────────
// PUBLIC FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Categorize transactions and flag recurring, income signals, and anomalies.
 *
 * @param {Array} transactions - Normalized transactions (category may be pre-filled)
 * @returns {Array} - Same transactions with category, merchant, flags populated
 */
const categorizeTransactions = async (transactions) => {
  if (!transactions || transactions.length === 0) return transactions;

  // Process in batches — Claude has a context window limit
  const batches = [];
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    batches.push(transactions.slice(i, i + BATCH_SIZE));
  }

  const allCategorized = [];

  for (const batch of batches) {
    try {
      const userMessage = buildCategorizationPrompt(batch);
      const rawResponse = await callClaude(CATEGORIZATION_SYSTEM_PROMPT, userMessage);
      const cleaned     = stripCodeFences(rawResponse);
      const { valid, data, error } = validateCategorizationResponse(cleaned, batch.length);

      if (!valid) {
        logger.warn(`[claude.service] Categorization validation failed: ${error}. Using fallback.`);
        allCategorized.push(...CATEGORIZATION_FALLBACK(batch).transactions);
        continue;
      }

      // Merge Claude's output back onto the original transactions
      const claudeMap = new Map(data.transactions.map(t => [t.id, t]));
      const merged = batch.map(txn => {
        const claudeData = claudeMap.get(txn.id);
        if (!claudeData) return txn;
        return {
          ...txn,
          category:         claudeData.category      || txn.category || 'OTHER',
          merchant:         claudeData.merchant      ?? txn.merchant,
          merchant_type:    claudeData.merchant_type ?? txn.merchant_type,
          is_recurring:     claudeData.is_recurring     ?? false,
          is_income_signal: claudeData.is_income_signal ?? false,
          is_anomaly:       claudeData.is_anomaly        ?? false,
        };
      });

      allCategorized.push(...merged);

    } catch (err) {
      logger.error(`[claude.service] categorizeTransactions error: ${err.message}`);
      allCategorized.push(...CATEGORIZATION_FALLBACK(batch).transactions);
    }
  }

  return allCategorized;
};

/**
 * Estimate monthly income from transaction patterns.
 *
 * @param {Array}  transactions - Categorized transactions
 * @param {Object} period       - { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 * @returns {Object}            - Income estimation result
 */
const estimateIncome = async (transactions, period = {}) => {
  try {
    const userMessage = buildIncomePrompt(transactions, period);
    const rawResponse = await callClaude(INCOME_ESTIMATION_SYSTEM_PROMPT, userMessage);
    const cleaned     = stripCodeFences(rawResponse);
    const { valid, data, error } = validateIncomeResponse(cleaned);

    if (!valid) {
      logger.warn(`[claude.service] Income validation failed: ${error}. Using fallback.`);
      return INCOME_FALLBACK;
    }

    return data;

  } catch (err) {
    logger.error(`[claude.service] estimateIncome error: ${err.message}`);
    return INCOME_FALLBACK;
  }
};

/**
 * Generate a plain-English borrower profile for loan officers.
 *
 * @param {Object} summary      - Aggregated financial summary
 * @param {Array}  transactions - Categorized transactions
 * @returns {Object}            - Borrower profile with narrative and risk level
 */
const generateBorrowerProfile = async (summary, transactions) => {
  try {
    const userMessage = buildBorrowerProfilePrompt(summary, transactions);
    const rawResponse = await callClaude(BORROWER_PROFILE_SYSTEM_PROMPT, userMessage);
    const cleaned     = stripCodeFences(rawResponse);
    const { valid, data, error } = validateBorrowerProfileResponse(cleaned);

    if (!valid) {
      logger.warn(`[claude.service] Profile validation failed: ${error}. Using fallback.`);
      return BORROWER_PROFILE_FALLBACK;
    }

    return data;

  } catch (err) {
    logger.error(`[claude.service] generateBorrowerProfile error: ${err.message}`);
    return BORROWER_PROFILE_FALLBACK;
  }
};

/**
 * Developer portal assistant — conversational API help.
 * Maintains conversation history for multi-turn Q&A.
 *
 * @param {Array}  messages - Full conversation history [{ role, content }]
 * @returns {string}        - Assistant reply text
 */
const developerAssistant = async (messages) => {
  try {
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     DEVELOPER_ASSISTANT_SYSTEM_PROMPT,
      messages,
    });

    return response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

  } catch (err) {
    logger.error(`[claude.service] developerAssistant error: ${err.message}`);
    return 'Sorry, the assistant is temporarily unavailable. Please check the documentation at /docs.';
  }
};


// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  categorizeTransactions,
  estimateIncome,
  generateBorrowerProfile,
  developerAssistant,
};
