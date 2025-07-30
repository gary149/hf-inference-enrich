import { ProviderEntry, ProviderFetcher, RateLimitConfig } from "./types";

export abstract class BaseProviderFetcher implements ProviderFetcher {
  abstract name: string;
  protected apiKey?: string;
  protected baseUrl: string;
  protected rateLimitConfig: RateLimitConfig;

  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private requestWindowStart: number = Date.now();

  constructor(
    baseUrl: string,
    apiKey?: string,
    rateLimitConfig: RateLimitConfig = {}
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.rateLimitConfig = {
      requestsPerMinute: rateLimitConfig.requestsPerMinute || 60,
      retryAttempts: rateLimitConfig.retryAttempts || 3,
      initialBackoffMs: rateLimitConfig.initialBackoffMs || 1000,
      ...rateLimitConfig,
    };
  }

  abstract fetchModels(): Promise<ProviderEntry[]>;

  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {},
    retries: number = this.rateLimitConfig.retryAttempts || 3
  ): Promise<T> {
    // Apply rate limiting
    await this.enforceRateLimit();

    for (let i = 0; i < retries; i++) {
      try {
        const headers: HeadersInit = {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        };

        if (this.apiKey) {
          headers["Authorization"] = `Bearer ${this.apiKey}`;
        }

        const response = await fetch(url, {
          ...options,
          headers,
        });

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Handle rate limit errors
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const waitTime = retryAfter
            ? parseInt(retryAfter) * 1000
            : Math.pow(2, i) * (this.rateLimitConfig.initialBackoffMs || 1000);

          console.log(`Rate limited by ${this.name}, waiting ${waitTime}ms...`);
          await this.sleep(waitTime);
          continue;
        }

        // Handle other errors
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorBody}`
        );
      } catch (error) {
        if (i === retries - 1) {
          console.error(
            `Failed to fetch from ${this.name} after ${retries} attempts:`,
            error
          );
          throw error;
        }

        // Exponential backoff for other errors
        const waitTime =
          Math.pow(2, i) * (this.rateLimitConfig.initialBackoffMs || 1000);
        console.log(`Retrying ${this.name} request in ${waitTime}ms...`);
        await this.sleep(waitTime);
      }
    }

    throw new Error(
      `Failed to fetch from ${this.name} after ${retries} attempts`
    );
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const windowDuration = 60000; // 1 minute in milliseconds

    // Reset window if needed
    if (now - this.requestWindowStart >= windowDuration) {
      this.requestCount = 0;
      this.requestWindowStart = now;
    }

    // Check if we've hit the rate limit
    if (this.requestCount >= (this.rateLimitConfig.requestsPerMinute || 60)) {
      const waitTime = windowDuration - (now - this.requestWindowStart);
      console.log(
        `Rate limit reached for ${this.name}, waiting ${waitTime}ms...`
      );
      await this.sleep(waitTime);

      // Reset after waiting
      this.requestCount = 0;
      this.requestWindowStart = Date.now();
    }

    // Ensure minimum time between requests (100ms default)
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 100;
    if (timeSinceLastRequest < minInterval) {
      await this.sleep(minInterval - timeSinceLastRequest);
    }

    this.requestCount++;
    this.lastRequestTime = Date.now();
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Helper method to convert various price formats to $ per 1M tokens
  protected normalizePricing(
    input: number | string,
    output: number | string,
    unit: "per_token" | "per_million" | "cents_per_million" = "per_million"
  ): { input: number; output: number } {
    let inputPrice = typeof input === "string" ? parseFloat(input) : input;
    let outputPrice = typeof output === "string" ? parseFloat(output) : output;

    switch (unit) {
      case "per_token":
        // Convert from $ per token to $ per million tokens
        inputPrice = inputPrice * 1_000_000;
        outputPrice = outputPrice * 1_000_000;
        break;
      case "cents_per_million":
        // Convert from cents per million to $ per million
        inputPrice = inputPrice / 100;
        outputPrice = outputPrice / 100;
        break;
      case "per_million":
        // Already in the correct format
        break;
    }

    return {
      input: inputPrice,
      output: outputPrice,
    };
  }

  // Helper to parse supported parameters from various formats
  protected parseSupportedParameters(
    params: string[] | object
  ): Partial<ProviderEntry> {
    const result: Partial<ProviderEntry> = {};
    const paramList = Array.isArray(params) ? params : Object.keys(params);

    const paramMapping: { [key: string]: keyof ProviderEntry } = {
      temperature: "supports_temperature",
      top_p: "supports_top_p",
      top_k: "supports_top_k",
      max_tokens: "supports_max_tokens",
      stop: "supports_stop_sequences",
      seed: "supports_seed",
      frequency_penalty: "supports_frequency_penalty",
      presence_penalty: "supports_presence_penalty",
      repetition_penalty: "supports_repetition_penalty",
      min_p: "supports_min_p",
      logit_bias: "supports_logit_bias",
      logprobs: "supports_logprobs",
      top_logprobs: "supports_top_logprobs",
      stream: "supports_streaming",
    };

    for (const param of paramList) {
      const mappedKey = paramMapping[param];
      if (mappedKey) {
        result[mappedKey] = true;
      }
    }

    result.supported_parameters = paramList;
    return result;
  }
}
