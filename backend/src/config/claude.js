const Anthropic = require('@anthropic-ai/sdk');
const { ANTHROPIC_API_KEY } = require('./env');

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});

module.exports = anthropic;
