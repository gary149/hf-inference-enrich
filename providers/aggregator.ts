import { ProviderEntry, ProviderFetcher } from './types';
import { getStaticPricing } from './static-pricing';
import { NovitaFetcher } from './novita';
import { SambaNovaFetcher } from './sambanova';
import { GroqFetcher } from './groq';
import { FeatherlessFetcher } from './featherless';
import { TogetherFetcher } from './together';
import { CohereFetcher } from './cohere';
import { FireworksFetcher } from './fireworks';
import { NebiusFetcher } from './nebius';
import { HyperbolicFetcher } from './hyperbolic';
import { CerebrasFetcher } from './cerebras';
import { NScaleFetcher } from './nscale';

export interface AggregatorConfig {
  providers?: string[];  // Specific providers to fetch from
  apiKeys?: {
    [provider: string]: string;
  };
  concurrent?: number;   // Number of concurrent fetches
  includeStaticPricing?: boolean;
}

export class ProviderAggregator {
  private fetchers: Map<string, ProviderFetcher>;
  private config: AggregatorConfig;

  constructor(config: AggregatorConfig = {}) {
    this.config = {
      concurrent: 3,
      includeStaticPricing: true,
      ...config
    };
    
    this.fetchers = new Map();
    this.initializeFetchers();
  }

  private initializeFetchers() {
    const apiKeys = this.config.apiKeys || {};
    
    // Initialize all available fetchers
    this.fetchers.set('novita', new NovitaFetcher(apiKeys.novita));
    this.fetchers.set('sambanova', new SambaNovaFetcher(apiKeys.sambanova));
    this.fetchers.set('groq', new GroqFetcher(apiKeys.groq));
    this.fetchers.set('featherless', new FeatherlessFetcher(apiKeys.featherless));
    this.fetchers.set('together', new TogetherFetcher(apiKeys.together));
    this.fetchers.set('cohere', new CohereFetcher(apiKeys.cohere));
    this.fetchers.set('fireworks', new FireworksFetcher(apiKeys.fireworks));
    this.fetchers.set('nebius', new NebiusFetcher(apiKeys.nebius));
    this.fetchers.set('hyperbolic', new HyperbolicFetcher(apiKeys.hyperbolic));
    this.fetchers.set('cerebras', new CerebrasFetcher(apiKeys.cerebras));
    this.fetchers.set('nscale', new NScaleFetcher(apiKeys.nscale));
  }

  async fetchAllProviders(): Promise<Map<string, ProviderEntry[]>> {
    const results = new Map<string, ProviderEntry[]>();
    const providers = this.config.providers || Array.from(this.fetchers.keys());
    
    // Fetch in batches to respect rate limits
    const batches = this.createBatches(providers, this.config.concurrent || 3);
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (provider) => {
        const fetcher = this.fetchers.get(provider);
        if (!fetcher) {
          console.warn(`No fetcher found for provider: ${provider}`);
          return { provider, entries: [] };
        }
        
        try {
          console.log(`Fetching models from ${provider}...`);
          const entries = await fetcher.fetchModels();
          
          // Enrich with static pricing if needed
          const enrichedEntries = this.enrichWithStaticPricing(provider, entries);
          
          return { provider, entries: enrichedEntries };
        } catch (error) {
          console.error(`Failed to fetch from ${provider}:`, error);
          return { provider, entries: [] };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      for (const { provider, entries } of batchResults) {
        results.set(provider, entries);
      }
    }
    
    return results;
  }

  async fetchProvider(provider: string): Promise<ProviderEntry[]> {
    const fetcher = this.fetchers.get(provider);
    if (!fetcher) {
      throw new Error(`No fetcher found for provider: ${provider}`);
    }
    
    const entries = await fetcher.fetchModels();
    return this.enrichWithStaticPricing(provider, entries);
  }

  private enrichWithStaticPricing(provider: string, entries: ProviderEntry[]): ProviderEntry[] {
    if (!this.config.includeStaticPricing) {
      return entries;
    }
    
    return entries.map(entry => {
      // Only add static pricing if the entry doesn't already have pricing
      if (!entry.pricing) {
        const modelId = this.extractModelId(entry);
        const staticPrice = getStaticPricing(provider, modelId);
        if (staticPrice) {
          return {
            ...entry,
            pricing: staticPrice
          };
        }
      }
      return entry;
    });
  }

  private extractModelId(entry: ProviderEntry): string {
    // Extract model ID from various possible fields
    // This is a simplified version - in production you'd need provider-specific logic
    return (entry as any).id || (entry as any).model_id || 'unknown';
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  // Aggregate all provider data into a single array
  async aggregateAll(): Promise<ProviderEntry[]> {
    const providerMap = await this.fetchAllProviders();
    const allEntries: ProviderEntry[] = [];
    
    for (const [provider, entries] of providerMap) {
      allEntries.push(...entries);
    }
    
    return allEntries;
  }

  // Get a summary of available models per provider
  async getSummary(): Promise<{ [provider: string]: number }> {
    const providerMap = await this.fetchAllProviders();
    const summary: { [provider: string]: number } = {};
    
    for (const [provider, entries] of providerMap) {
      summary[provider] = entries.length;
    }
    
    return summary;
  }
}