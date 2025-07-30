import { BaseProviderFetcher } from './base';
import { ProviderEntry, FireworksModel, FireworksDetailedModel } from './types';

export class FireworksFetcher extends BaseProviderFetcher {
  name = 'fireworks';

  constructor(apiKey?: string) {
    super('https://api.fireworks.ai', apiKey, {
      requestsPerMinute: 60  // Conservative default
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await this.fetchWithRetry<{ data: FireworksModel[] }>(
        `${this.baseUrl}/inference/v1/models`
      );

      // Map basic model data
      const basicEntries = response.data.map(model => this.mapBasicModelToProviderEntry(model));

      // Optionally enrich with detailed data for important models
      // This can be done selectively to avoid too many API calls
      const enrichedEntries = await this.enrichModels(basicEntries, response.data);

      return enrichedEntries;
    } catch (error) {
      console.error(`Failed to fetch Fireworks models: ${error}`);
      return [];
    }
  }

  private async enrichModels(
    basicEntries: ProviderEntry[], 
    models: FireworksModel[]
  ): Promise<ProviderEntry[]> {
    // For now, we'll return basic entries
    // In production, you might want to selectively enrich important models
    // to avoid hitting rate limits
    return basicEntries;
  }

  async fetchDetailedModel(accountId: string, modelId: string): Promise<ProviderEntry | null> {
    try {
      const response = await this.fetchWithRetry<FireworksDetailedModel>(
        `${this.baseUrl}/v1/accounts/${accountId}/models/${modelId}`
      );

      return this.mapDetailedModelToProviderEntry(response);
    } catch (error) {
      console.error(`Failed to fetch detailed Fireworks model ${modelId}: ${error}`);
      return null;
    }
  }

  private mapBasicModelToProviderEntry(model: FireworksModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_length,
      status: 'live',  // Fireworks doesn't provide status in basic response
      owned_by: model.owned_by,
      supports_image_input: model.supports_image_input,
      supports_tools: model.supports_tools,
      supports_function_calling: model.supports_tools
    };

    // Basic capability assumptions based on model type
    if (model.supports_chat) {
      entry.model_type = 'chat';
      entry.supports_streaming = true;
      entry.supports_temperature = true;
      entry.supports_top_p = true;
      entry.supports_max_tokens = true;
      entry.supports_stop_sequences = true;
      entry.supports_seed = true;
      entry.supports_frequency_penalty = true;
      entry.supports_presence_penalty = true;
    }

    return entry;
  }

  private mapDetailedModelToProviderEntry(model: FireworksDetailedModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.contextLength,
      status: model.state === 'READY' ? 'live' : 'offline',
      description: model.description,
      quantization: model.baseModelDetails.defaultPrecision,
      supports_image_input: model.supportsImageInput,
      supports_tools: model.supportsTools,
      supports_function_calling: model.supportsTools
    };

    // Check deprecation
    if (model.deprecationDate) {
      entry.status = 'deprecated';
      entry.deprecated_at = model.deprecationDate;
    }

    // Parse parameter count if available
    if (model.baseModelDetails.parameterCount) {
      // Store as metadata - you might want to parse this into a number
      entry.owned_by = model.displayName;
    }

    // Parse supported parameters from defaultSamplingParams
    if (model.defaultSamplingParams) {
      const paramCapabilities = this.parseSupportedParameters(model.defaultSamplingParams);
      Object.assign(entry, paramCapabilities);
    }

    // Additional capabilities from model details
    if (model.supportsLora) {
      // Custom capability - not in standard ProviderEntry but could be added
      // entry.supports_lora = true;
    }

    // Map supported precisions
    if (model.supportedPrecisions && model.supportedPrecisions.length > 0) {
      // Could store as metadata or custom field
    }

    return entry;
  }

  // Helper to extract model ID parts from Fireworks model ID format
  private parseModelId(id: string): { accountId: string; modelId: string } | null {
    // Format: "accounts/fireworks/models/qwen3-235b-a22b-thinking-2507"
    const match = id.match(/accounts\/([^\/]+)\/models\/([^\/]+)/);
    if (match) {
      return {
        accountId: match[1],
        modelId: match[2]
      };
    }
    return null;
  }
}