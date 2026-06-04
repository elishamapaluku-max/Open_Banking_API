const anthropic = require('../config/claude');

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1000;

/**
 * Generate a comprehensive borrower profile from transaction data
 */
const generateBorrowerProfile = async (transactions) => {
  try {
    const systemPrompt = `You are a financial analyst specializing in East African lending contexts. Analyze the provided transaction data and generate a comprehensive borrower profile.

Your response must be a valid JSON object with the following structure:
{
  "categories": {
    "category_name": total_amount_in_kes,
    ...
  },
  "estimated_monthly_income": number (in KES),
  "risk_signals": [
    "signal_1",
    "signal_2",
    ...
  ],
  "narrative": "3-5 sentence plain English summary of the borrower's financial behavior"
}

Consider local context: common income sources (salary, business, remittances), typical expenses (rent, utilities, transport, mobile money), and risk factors relevant to East African markets.`;

    const userMessage = JSON.stringify(transactions, null, 2);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    console.error('Error generating borrower profile:', error.message);
    return null;
  }
};

/**
 * Categorize transactions using Claude
 */
const categorizeTransactions = async (transactions) => {
  try {
    const systemPrompt = `You are a financial transaction categorizer for East African markets. Categorize each transaction into one of these categories:
- Food & Groceries
- Transport
- Utilities
- Rent & Housing
- Healthcare
- Education
- Entertainment
- Shopping
- Transfer & Remittance
- Mobile Money (M-Pesa, Airtel Money, etc.)
- Salary & Income
- Business
- Other

Return the transactions array with a "category" field added to each transaction. Preserve all existing fields. Respond with valid JSON only.`;

    const userMessage = JSON.stringify(transactions, null, 2);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    console.error('Error categorizing transactions:', error.message);
    return null;
  }
};

/**
 * Estimate monthly income from transaction data
 */
const estimateIncome = async (transactions) => {
  try {
    const systemPrompt = `You are a financial analyst specializing in East African income estimation. Analyze the provided transaction data to estimate the borrower's monthly income.

Your response must be a valid JSON object with the following structure:
{
  "estimated_monthly_income": number (in KES),
  "confidence": "high" | "medium" | "low",
  "basis": "explanation of how the estimate was calculated (1-2 sentences)"
}

Consider salary deposits, business income, regular transfers, and other income patterns typical in East Africa. Be conservative in your estimates.`;

    const userMessage = JSON.stringify(transactions, null, 2);

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    const content = response.content[0].text;
    return JSON.parse(content);
  } catch (error) {
    console.error('Error estimating income:', error.message);
    return null;
  }
};

module.exports = {
  generateBorrowerProfile,
  categorizeTransactions,
  estimateIncome
};
