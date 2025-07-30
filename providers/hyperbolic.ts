import type { ProviderEntry, ProviderFetcher } from './types';
import { BaseProviderFetcher } from './base';

export class HyperbolicFetcher extends BaseProviderFetcher implements ProviderFetcher {
  name = 'hyperbolic';
  
  constructor(apiKey?: string) {
    super('https://api.hyperbolic.ai/v1', apiKey);
  }
  
  async fetchModels(): Promise<ProviderEntry[]> {
    // Hyperbolic doesn't provide a public API for model listing
    // Data will come from HuggingFace router API
    console.log('Hyperbolic API not available - using HuggingFace router data');
    return [];
  }
}