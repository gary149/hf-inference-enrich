import { BaseProviderFetcher } from "./base";
import { ProviderEntry, NovitaModel } from "./types";

export class NovitaFetcher extends BaseProviderFetcher {
  name = "novita";

  constructor(apiKey?: string) {
    super("https://api.novita.ai", apiKey, {
      requestsPerMinute: 60, // Conservative default
    });
  }

  async fetchModels(): Promise<ProviderEntry[]> {
    try {
      const response = await this.fetchWithRetry<{ data: NovitaModel[] }>(
        `${this.baseUrl}/v3/openai/models`
      );

      return response.data.map((model) => this.mapModelToProviderEntry(model));
    } catch (error) {
      console.error(`Failed to fetch Novita models: ${error}`);
      return [];
    }
  }

  private mapModelToProviderEntry(model: NovitaModel): ProviderEntry {
    const entry: ProviderEntry = {
      provider: this.name,
      context_length: model.context_size,
      max_completion_tokens: model.max_output_tokens,
      pricing: this.normalizePricing(
        model.input_token_price_per_m,
        model.output_token_price_per_m,
        "cents_per_million"
      ),
      description: model.description,
      model_type: model.model_type,
      status: model.status === 1 ? "live" : "offline",
    };

    // Store the model ID for matching
    (entry as any).id = model.id;

    // Map features to capability flags if features exist
    if (model.features && Array.isArray(model.features)) {
      const featureMapping = this.mapFeatures(model.features);
      Object.assign(entry, featureMapping);
    }

    // Add additional metadata
    if (model.display_name) {
      entry.owned_by = model.owned_by || "unknown";
    }

    // Novita models typically support standard OpenAI parameters
    // Based on the model_type being 'chat', we can infer common capabilities
    if (entry.model_type === "chat") {
      entry.supports_streaming = true;
      entry.supports_temperature = true;
      entry.supports_top_p = true;
      entry.supports_max_tokens = true;
      entry.supports_stop_sequences = true;
      entry.supports_frequency_penalty = true;
      entry.supports_presence_penalty = true;
    }

    return entry;
  }

  private mapFeatures(features: string[]): Partial<ProviderEntry> {
    const result: Partial<ProviderEntry> = {};

    // Feature mapping based on the spec
    const featureMap: { [key: string]: (keyof ProviderEntry)[] } = {
      "function-calling": ["supports_tools", "supports_function_calling"],
      "structured-outputs": [
        "supports_structured_output",
        "supports_response_format",
      ],
    };

    for (const feature of features || []) {
      const mappedKeys = featureMap[feature];
      if (mappedKeys) {
        for (const key of mappedKeys) {
          result[key] = true;
        }
      }
    }

    return result;
  }

  // Optional: Fetch a single model with potentially more details
  async fetchModel(modelId: string): Promise<ProviderEntry | null> {
    try {
      const response = await this.fetchWithRetry<NovitaModel>(
        `${this.baseUrl}/v3/openai/models/${encodeURIComponent(modelId)}`
      );

      return this.mapModelToProviderEntry(response);
    } catch (error) {
      console.error(`Failed to fetch Novita model ${modelId}: ${error}`);
      return null;
    }
  }
}
