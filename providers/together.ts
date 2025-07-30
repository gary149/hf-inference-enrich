import { BaseProviderFetcher } from './base';
import { ProviderEntry, TogetherModel } from './types';

export class TogetherFetcher extends BaseProviderFetcher {
  name = 'together';

  constructor(apiKey?: string) {
    super('https://api.together.ai', apiKey, {
      requestsPerMinute: 600  // Together rate limit from spec
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await this.fetchWithRetry<TogetherModel[]>(
        `${this.baseUrl}/v1/models`
      );

      return response.map(model => this.mapModelToProviderEntry(model));
    } catch (error) {
      console.error(`Failed to fetch Together models: ${error}`);
      return [];
    }
  }

  private mapModelToProviderEntry(model: TogetherModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_length,
      pricing: this.normalizePricing(
        model.pricing.input,
        model.pricing.output,
        'per_million'
      ),
      status: 'live', // Together doesn't provide status
      owned_by: model.organization,
      model_type: model.type
    };

    // Parse supported parameters from config if available
    if (model.config) {
      const configParams = this.parseConfigParameters(model.config);
      Object.assign(entry, configParams);
    }

    // Together models support standard OpenAI parameters
    entry.supports_streaming = true;
    entry.supports_temperature = true;
    entry.supports_top_p = true;
    entry.supports_max_tokens = true;
    entry.supports_stop_sequences = true;
    entry.supports_seed = true;
    entry.supports_frequency_penalty = true;
    entry.supports_presence_penalty = true;

    // Chat models support additional features
    if (model.type === 'chat') {
      entry.supports_tools = true;
      entry.supports_function_calling = true;
      entry.supports_structured_output = true;
      entry.supports_response_format = true;
    }

    // Set supported parameters
    entry.supported_parameters = [
      'temperature',
      'top_p',
      'max_tokens',
      'stop',
      'seed',
      'frequency_penalty',
      'presence_penalty',
      'stream'
    ];

    if (model.type === 'chat') {
      entry.supported_parameters.push('tools', 'tool_choice', 'response_format');
    }

    return entry;
  }

  private parseConfigParameters(config: TogetherModel['config']): Partial<ProviderEntry> {
    const result: Partial<ProviderEntry> = {};

    // Check for stop sequences support
    if (config.stop && config.stop.length > 0) {
      result.supports_stop_sequences = true;
    }

    return result;
  }
}