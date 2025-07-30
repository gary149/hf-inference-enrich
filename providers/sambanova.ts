import { BaseProviderFetcher } from "./base";
import { ProviderEntry, SambaNovaModel } from "./types";

export class SambaNovaFetcher extends BaseProviderFetcher {
  name = "sambanova";

  constructor(apiKey?: string) {
    super("https://api.sambanova.ai", apiKey, {
      requestsPerMinute: 60, // Conservative default
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await this.fetchWithRetry<{ data: SambaNovaModel[] }>(
        `${this.baseUrl}/v1/models`
      );

      return response.data.map((model) => this.mapModelToProviderEntry(model));
    } catch (error) {
      console.error(`Failed to fetch SambaNova models: ${error}`);
      return [];
    }
  }

  private mapModelToProviderEntry(model: SambaNovaModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_length,
      max_completion_tokens: model.max_completion_tokens,
      pricing: this.normalizePricing(
        model.pricing.prompt,
        model.pricing.completion,
        "per_token"
      ),
      status: "live", // SambaNova doesn't provide status, assume live
      owned_by: model.owned_by,
    };

    // Store the model ID for matching
    (entry as any).id = model.id;

    // SambaNova models are OpenAI-compatible, so we can infer common capabilities
    // They don't expose capability flags in their API
    entry.supports_streaming = true;
    entry.supports_temperature = true;
    entry.supports_top_p = true;
    entry.supports_max_tokens = true;
    entry.supports_stop_sequences = true;
    entry.supports_seed = true;
    entry.supports_frequency_penalty = true;
    entry.supports_presence_penalty = true;
    entry.supports_tools = true;
    entry.supports_function_calling = true;

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
      "tools",
      "tool_choice",
    ];

    return entry;
  }
}
