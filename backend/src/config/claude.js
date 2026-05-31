const Anthropic = require('@anthropic-ai/sdk');
const config = require('./env');

const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey
});

module.exports = anthropic;
