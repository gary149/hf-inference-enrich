import type { ProviderEntry, ProviderFetcher } from './types';
import { BaseProviderFetcher } from './base';

export class NebiusFetcher extends BaseProviderFetcher implements ProviderFetcher {
  name = 'nebius';
  
  constructor(apiKey?: string) {
    super('https://api.nebius.ai/v1', apiKey);
  }
  
  async fetchModels(): Promise<ProviderEntry[]> {
    // Nebius doesn't provide a public API for model listing
    // Data will come from HuggingFace router API
    console.log('Nebius API not available - using HuggingFace router data');
    return [];
  }
}