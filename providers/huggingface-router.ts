import type { ProviderEntry, ProviderFetcher } from './types';

interface HFRouterModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  providers?: HFRouterProvider[];
}

interface HFRouterProvider {
  provider: string;
  status?: "live" | "offline" | "staging" | "deprecated";
  context_length?: number;
  pricing?: {
    input: number;   // cents per million tokens
    output: number;  // cents per million tokens
  };
  supports_tools?: boolean;
  supports_structured_output?: boolean;
}

export class HuggingFaceRouterFetcher implements ProviderFetcher {
  name = 'huggingface-router';
  
  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await fetch('https://router.huggingface.co/v1/models');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json() as { data: HFRouterModel[] };
      return this.normalizeModels(data.data);
    } catch (error) {
      console.error('Failed to fetch HuggingFace router models:', error);
      throw error;
    }
  }
  
  private normalizeModels(models: HFRouterModel[]): ProviderEntry[] {
    const entries: ProviderEntry[] = [];
    
    for (const model of models) {
      if (!model.providers) continue;
      
      for (const provider of model.providers) {
        const entry: ProviderEntry = {
          provider: this.normalizeProviderName(provider.provider),
          model_id: model.id,
          owned_by: model.owned_by,
          created: model.created,
        };
        
        // Set status
        if (provider.status) {
          entry.status = provider.status === "staging" ? "offline" : provider.status;
        }
        
        // Convert pricing from cents to dollars per million tokens
        if (provider.pricing) {
          entry.pricing = {
            input: provider.pricing.input / 100,   // cents to dollars
            output: provider.pricing.output / 100, // cents to dollars
          };
        }
        
        // Copy context length
        if (provider.context_length) {
          entry.context_length = provider.context_length;
        }
        
        // Copy capability flags
        if (provider.supports_tools !== undefined) {
          entry.supports_tools = provider.supports_tools;
        }
        
        if (provider.supports_structured_output !== undefined) {
          entry.supports_structured_output = provider.supports_structured_output;
        }
        
        entries.push(entry);
      }
    }
    
    return entries;
  }
  
  private normalizeProviderName(providerName: string): string {
    // Map HF router provider names to our standard names
    const providerMap: Record<string, string> = {
      'featherless-ai': 'featherless',
      'fireworks-ai': 'fireworks',
      'hf-inference': 'huggingface',
      // Keep others as-is
    };
    
    return providerMap[providerName] || providerName;
  }
}

// Helper function to extract HF router data from a model
export function extractHFRouterData(model: any): Map<string, ProviderEntry> {
  const providerMap = new Map<string, ProviderEntry>();
  
  if (!model.providers || !Array.isArray(model.providers)) {
    return providerMap;
  }
  
  for (const provider of model.providers) {
    if (!provider.provider) continue;
    
    const entry: ProviderEntry = {
      provider: provider.provider,
    };
    
    // Set status
    if (provider.status) {
      entry.status = provider.status === "staging" ? "offline" : provider.status;
    }
    
    // Convert pricing from cents to dollars if needed
    if (provider.pricing) {
      // Check if pricing is already in dollars (values < 100 likely dollars)
      const needsConversion = provider.pricing.input >= 100 || provider.pricing.output >= 100;
      entry.pricing = {
        input: needsConversion ? provider.pricing.input / 100 : provider.pricing.input,
        output: needsConversion ? provider.pricing.output / 100 : provider.pricing.output,
      };
    }
    
    // Copy other fields
    if (provider.context_length) {
      entry.context_length = provider.context_length;
    }
    
    if (provider.supports_tools !== undefined) {
      entry.supports_tools = provider.supports_tools;
    }
    
    if (provider.supports_structured_output !== undefined) {
      entry.supports_structured_output = provider.supports_structured_output;
    }
    
    providerMap.set(provider.provider, entry);
  }
  
  return providerMap;
}