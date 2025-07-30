import type { ProviderEntry, ProviderFetcher } from './types';
import { BaseProviderFetcher } from './base';

export class NScaleFetcher extends BaseProviderFetcher implements ProviderFetcher {
  name = 'nscale';
  
  constructor(apiKey?: string) {
    super('https://api.nscale.ai/v1', apiKey);
  }
  
  async fetchModels(): Promise<ProviderEntry[]> {
    // NScale doesn't provide a public API for model listing
    // Data will come from HuggingFace router API
    console.log('NScale API not available - using HuggingFace router data');
    return [];
  }
}