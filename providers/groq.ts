import { BaseProviderFetcher } from "./base";
import { ProviderEntry, GroqModel } from "./types";

export class GroqFetcher extends BaseProviderFetcher {
  name = "groq";

  constructor(apiKey?: string) {
    super("https://api.groq.com", apiKey, {
      requestsPerMinute: 100, // Groq rate limit from spec
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await this.fetchWithRetry<{ data: GroqModel[] }>(
        `${this.baseUrl}/openai/v1/models`
      );

      return response.data.map((model) => this.mapModelToProviderEntry(model));
    } catch (error) {
      console.error(`Failed to fetch Groq models: ${error}`);
      return [];
    }
  }

  async fetchModel(modelId: string): Promise<ProviderEntry | null> {
    try {
      const response = await this.fetchWithRetry<GroqModel>(
        `${this.baseUrl}/openai/v1/models/${encodeURIComponent(modelId)}`
      );

      return this.mapModelToProviderEntry(response);
    } catch (error) {
      console.error(`Failed to fetch Groq model ${modelId}: ${error}`);
      return null;
    }
  }

  private mapModelToProviderEntry(model: GroqModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_window,
      max_completion_tokens: model.max_completion_tokens,
      status: model.active ? "live" : "offline",
      owned_by: model.owned_by,
    };

    // Store the model ID for matching
    (entry as any).id = model.id;

    // Add static pricing from Groq's website if not provided by API
    if (!entry.pricing) {
      const staticPricing = this.getStaticPricing(model.id);
      if (staticPricing) {
        entry.pricing = staticPricing;
      }
    }

    // According to the spec, Groq assumes OpenAI-compatible parameters
    // All capability flags = true except supports_logprobs
    entry.supports_tools = true;
    entry.supports_function_calling = true;
    entry.supports_structured_output = true;
    entry.supports_streaming = true;
    entry.supports_temperature = true;
    entry.supports_top_p = true;
    entry.supports_max_tokens = true;
    entry.supports_stop_sequences = true;
    entry.supports_seed = true;
    entry.supports_frequency_penalty = true;
    entry.supports_presence_penalty = true;
    entry.supports_logit_bias = true;
    entry.supports_top_logprobs = true;
    entry.supports_logprobs = false; // Not supported by Groq according to spec

    // Response format support
    entry.supports_response_format = true;

    // Set supported parameters
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
      "logit_bias",
      "top_logprobs",
      "response_format",
    ];

    return entry;
  }

  private getStaticPricing(modelId: string): { input: number; output: number } | null {
    // Import static pricing data
    const { getStaticPricing } = require('./static-pricing');
    return getStaticPricing('groq', modelId);
  }
}
