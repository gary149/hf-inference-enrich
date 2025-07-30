import { BaseProviderFetcher } from "./base";
import { ProviderEntry, FeatherlessModel } from "./types";

export class FeatherlessFetcher extends BaseProviderFetcher {
  name = "featherless";

  constructor(apiKey?: string) {
    super("https://api.featherless.ai", apiKey, {
      requestsPerMinute: 60, // Conservative default
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await this.fetchWithRetry<{ data: FeatherlessModel[] }>(
        `${this.baseUrl}/v1/models`
      );

      return response.data.map((model) => this.mapModelToProviderEntry(model));
    } catch (error) {
      console.error(`Failed to fetch Featherless models: ${error}`);
      return [];
    }
  }

  private mapModelToProviderEntry(model: FeatherlessModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_length,
      max_completion_tokens: model.max_completion_tokens,
      status: model.available_on_current_plan ? "live" : "offline",
      owned_by: model.owned_by,
      model_class: model.model_class,
      is_gated: model.is_gated,
    };

    // Featherless models are OpenAI-compatible
    // Since they don't expose capability flags, we'll assume standard OpenAI capabilities
    entry.supports_streaming = true;
    entry.supports_temperature = true;
    entry.supports_top_p = true;
    entry.supports_max_tokens = true;
    entry.supports_stop_sequences = true;
    entry.supports_seed = true;
    entry.supports_frequency_penalty = true;
    entry.supports_presence_penalty = true;

    // Set supported parameters based on OpenAI compatibility
    entry.supported_parameters = [
      "temperature",
      "top_p",
      "max_tokens",
      "stop",
      "seed",
      "frequency_penalty",
      "presence_penalty",
      "stream",
    ];

    return entry;
  }
}
