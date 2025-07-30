import { StaticPricing } from './types';

// Static pricing data for providers without API pricing endpoints
// Prices are in $ per 1M tokens
// Last updated: January 2025
export const staticPricing: StaticPricing = {
  groq: {
    // Groq pricing from their website
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama-3.2-1b-preview': { input: 0.04, output: 0.04 },
    'llama-3.2-3b-preview': { input: 0.06, output: 0.06 },
    'llama-3.2-11b-vision-preview': { input: 0.18, output: 0.18 },
    'llama-3.2-90b-vision-preview': { input: 0.90, output: 0.90 },
    'llama3-70b-8192': { input: 0.59, output: 0.79 },
    'llama3-8b-8192': { input: 0.05, output: 0.08 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    'gemma-7b-it': { input: 0.07, output: 0.07 },
    'gemma2-9b-it': { input: 0.20, output: 0.20 }
  },
  
  featherless: {
    // Featherless pricing - typically uses pay-per-request model
    // Converting to per-million-token estimates based on average usage
    'default': { input: 0.10, output: 0.10 }  // Default pricing for all models
  },
  
  cohere: {
    // Cohere pricing from their website
    'command-r-plus': { input: 2.50, output: 10.00 },
    'command-r': { input: 0.15, output: 0.60 },
    'command': { input: 0.50, output: 1.50 },
    'command-light': { input: 0.15, output: 0.60 },
    'c4ai-aya-expanse-8b': { input: 0.15, output: 0.60 },
    'c4ai-aya-expanse-32b': { input: 0.50, output: 2.00 }
  },
  
  fireworks: {
    // Fireworks pricing from their documentation
    'qwen2.5-coder-32b-instruct': { input: 0.25, output: 0.25 },
    'qwen2.5-72b-instruct': { input: 0.50, output: 0.50 },
    'llama-v3p3-70b-instruct': { input: 0.50, output: 0.50 },
    'llama-v3p2-11b-vision-instruct': { input: 0.20, output: 0.20 },
    'llama-v3p2-90b-vision-instruct': { input: 1.00, output: 1.00 },
    'llama-v3p1-405b-instruct': { input: 3.00, output: 3.00 },
    'llama-v3p1-70b-instruct': { input: 0.50, output: 0.50 },
    'llama-v3p1-8b-instruct': { input: 0.10, output: 0.10 },
    'mixtral-8x7b-instruct': { input: 0.50, output: 0.50 },
    'mixtral-8x22b-instruct': { input: 0.90, output: 0.90 },
    'deepseek-v3': { input: 0.30, output: 0.30 },
    'mythomax-l2-13b': { input: 0.10, output: 0.10 }
  },
  
  cerebras: {
    // Cerebras pricing - very competitive
    'llama3.1-8b': { input: 0.10, output: 0.10 },
    'llama3.1-70b': { input: 0.60, output: 0.60 }
  },
  
  nebius: {
    // Nebius pricing estimates
    'llama-3.1-70b-instruct': { input: 0.50, output: 0.50 },
    'llama-3.1-8b-instruct': { input: 0.10, output: 0.10 },
    'llama-3.1-405b-instruct': { input: 2.50, output: 2.50 },
    'mistral-7b-instruct': { input: 0.10, output: 0.10 }
  },
  
  lambdalabs: {
    // Lambda Labs pricing - typically hourly GPU pricing
    // These are estimates based on typical usage patterns
    'hermes-3-llama-3.1-405b-fp8': { input: 3.00, output: 3.00 },
    'hermes-3-llama-3.1-70b-fp8': { input: 0.50, output: 0.50 }
  },
  
  lepton: {
    // Lepton AI pricing
    'llama3.1-8b': { input: 0.10, output: 0.10 },
    'llama3.1-70b': { input: 0.50, output: 0.50 },
    'llama3.1-405b': { input: 2.50, output: 2.50 },
    'qwen2.5-72b': { input: 0.50, output: 0.50 },
    'mixtral-8x7b': { input: 0.30, output: 0.30 }
  },
  
  octoai: {
    // OctoAI pricing
    'meta-llama-3.1-8b-instruct': { input: 0.05, output: 0.10 },
    'meta-llama-3.1-70b-instruct': { input: 0.50, output: 0.50 },
    'meta-llama-3.1-405b-instruct': { input: 2.50, output: 2.50 },
    'qwen2.5-72b-instruct': { input: 0.30, output: 0.30 },
    'mixtral-8x7b-instruct': { input: 0.30, output: 0.30 },
    'mixtral-8x22b-instruct': { input: 0.90, output: 0.90 }
  }
};

// Helper function to get pricing for a model
export function getStaticPricing(provider: string, modelId: string): { input: number; output: number } | null {
  const providerPricing = staticPricing[provider];
  if (!providerPricing) return null;
  
  // Check for exact match
  if (providerPricing[modelId]) {
    return providerPricing[modelId];
  }
  
  // Check for default pricing
  if (providerPricing['default']) {
    return providerPricing['default'];
  }
  
  return null;
}