import { BaseProviderFetcher } from './base';
import { ProviderEntry, CohereModel } from './types';

export class CohereFetcher extends BaseProviderFetcher {
  name = 'cohere';

  constructor(apiKey?: string) {
    super('https://api.cohere.ai', apiKey, {
      requestsPerMinute: 60  // Conservative default
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      // Fetch all models
      const response = await this.fetchWithRetry<{ models: CohereModel[] }>(
        `${this.baseUrl}/v1/models`
      );

      // Optionally filter by endpoint type
      const chatModels = response.models.filter(model => 
        model.endpoints.includes('chat') || model.endpoints.includes('generate')
      );

      return chatModels.map(model => this.mapModelToProviderEntry(model));
    } catch (error) {
      console.error(`Failed to fetch Cohere models: ${error}`);
      return [];
    }
  }

  async fetchModel(modelName: string): Promise<ProviderEntry | null> {
    try {
      const response = await this.fetchWithRetry<CohereModel>(
        `${this.baseUrl}/v1/models/${encodeURIComponent(modelName)}`
      );

      return this.mapModelToProviderEntry(response);
    } catch (error) {
      console.error(`Failed to fetch Cohere model ${modelName}: ${error}`);
      return null;
    }
  }

  private mapModelToProviderEntry(model: CohereModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_length,
      status: model.is_deprecated ? 'deprecated' : 'live',
      supports_image_input: model.supports_vision
    };

    // Map features to capability flags
    const featureMapping = this.mapFeatures(model.features);
    Object.assign(entry, featureMapping);

    // Map endpoints to capabilities
    const endpointCapabilities = this.mapEndpoints(model.endpoints);
    Object.assign(entry, endpointCapabilities);

    // Set supported parameters based on features
    entry.supported_parameters = model.features;

    return entry;
  }

  private mapFeatures(features: string[]): Partial<ProviderEntry> {
    const result: Partial<ProviderEntry> = {};

    // Feature mapping based on the spec
    const featureMap: { [key: string]: (keyof ProviderEntry)[] } = {
      'tools': ['supports_tools'],
      'strict_tools': ['supports_function_calling'],
      'json_mode': ['supports_structured_output'],
      'json_schema': ['supports_structured_output', 'supports_response_format'],
      'logprobs': ['supports_logprobs']
    };

    for (const feature of features) {
      const mappedKeys = featureMap[feature];
      if (mappedKeys) {
        for (const key of mappedKeys) {
          result[key] = true;
        }
      }
    }

    // Common parameters for Cohere models
    result.supports_streaming = true;
    result.supports_temperature = true;
    result.supports_top_p = true;
    result.supports_max_tokens = true;
    result.supports_stop_sequences = true;
    result.supports_seed = true;
    result.supports_frequency_penalty = true;
    result.supports_presence_penalty = true;
    result.supports_top_k = true;

    return result;
  }

  private mapEndpoints(endpoints: string[]): Partial<ProviderEntry> {
    const result: Partial<ProviderEntry> = {};

    // If the model supports chat or generate endpoints, it's a text generation model
    if (endpoints.includes('chat') || endpoints.includes('generate')) {
      result.model_type = 'chat';
    }

    return result;
  }
}