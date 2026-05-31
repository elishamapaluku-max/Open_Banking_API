import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './env.js';

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});

export default anthropic;
