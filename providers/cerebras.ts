import type { ProviderEntry, ProviderFetcher } from './types';
import { BaseProviderFetcher } from './base';

export class CerebrasFetcher extends BaseProviderFetcher implements ProviderFetcher {
  name = 'cerebras';
  
  constructor(apiKey?: string) {
    super('https://api.cerebras.ai/v1', apiKey);
  }
  
  async fetchModels(): Promise<ProviderEntry[]> {
    // Cerebras doesn't provide detailed model information via their API
    // Data will come from HuggingFace router API
    console.log('Cerebras API limited - using HuggingFace router data');
    return [];
  }
}