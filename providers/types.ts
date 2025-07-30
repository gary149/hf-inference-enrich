// Core provider data structure based on provider-api-spec.md
export interface ProviderEntry {
  provider: string;
  status?: "live" | "offline" | "deprecated";
  context_length?: number;
  pricing?: {
    input: number;   // $ per 1M tokens
    output: number;  // $ per 1M tokens
  };
  quantization?: string;
  max_completion_tokens?: number;
  supported_parameters?: string[];
  
  // Model identification
  model_id?: string;
  created?: number;
  
  // Capability flags
  supports_tools?: boolean;
  supports_function_calling?: boolean;
  supports_structured_output?: boolean;
  supports_response_format?: boolean;
  supports_streaming?: boolean;
  supports_logprobs?: boolean;
  supports_stop_sequences?: boolean;
  supports_seed?: boolean;
  supports_temperature?: boolean;
  supports_top_p?: boolean;
  supports_frequency_penalty?: boolean;
  supports_presence_penalty?: boolean;
  supports_repetition_penalty?: boolean;
  supports_top_k?: boolean;
  supports_min_p?: boolean;
  supports_max_tokens?: boolean;
  supports_logit_bias?: boolean;
  supports_top_logprobs?: boolean;
  supports_image_input?: boolean;
  
  // Performance metrics
  latency_s?: number;
  throughput_tps?: number;
  performance_error?: string;
  performance_tested_at?: string;
  
  // Additional metadata
  owned_by?: string;
  model_type?: string;
  description?: string;
  deprecated_at?: string;
  model_class?: string;
  is_gated?: boolean;
}

// Provider-specific response types
export interface GroqModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  active: boolean;
  context_window: number;
  public_apps: any;
  max_completion_tokens: number;
}

export interface CohereModel {
  name: string;
  endpoints: string[];
  finetuned: boolean;
  context_length: number;
  tokenizer_url: string;
  supports_vision: boolean;
  features: string[];
  default_endpoints: string[];
  is_deprecated?: boolean;
}

export interface FireworksModel {
  id: string;
  object: string;
  owned_by: string;
  created: number;
  kind: string;
  supports_chat: boolean;
  supports_image_input: boolean;
  supports_tools: boolean;
  context_length: number;
}

export interface FireworksDetailedModel {
  name: string;
  displayName: string;
  description: string;
  contextLength: number;
  baseModelDetails: {
    checkpointFormat: string;
    defaultPrecision: string;
    modelType: string;
    moe: boolean;
    parameterCount: string;
    supportsFireattention: boolean;
    tunable: boolean;
    worldSize: number;
  };
  defaultSamplingParams: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    [key: string]: any;
  };
  supportsImageInput: boolean;
  supportsLora: boolean;
  supportsTools: boolean;
  state: string;
  deprecationDate: string | null;
  huggingFaceUrl: string;
  supportedPrecisions: string[];
  deployedModelRefs: any[];
}

export interface TogetherModel {
  id: string;
  object: string;
  created: number;
  type: string;
  display_name: string;
  organization: string;
  context_length: number;
  pricing: {
    input: number;    // $ per million tokens
    output: number;   // $ per million tokens
    hourly: number;
    base: number;
    finetune: number;
  };
  config: {
    chat_template: string;
    stop: string[];
    bos_token: string;
    eos_token: string;
  };
}

export interface SambaNovaModel {
  id: string;
  object: string;
  owned_by: string;
  context_length: number;
  max_completion_tokens: number;
  pricing: {
    prompt: string;      // $ per token
    completion: string;  // $ per token
  };
  sn_metadata: any;
}

export interface NovitaModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  input_token_price_per_m: number;     // Cents per million tokens
  output_token_price_per_m: number;    // Cents per million tokens
  title: string;
  description: string;
  context_size: number;
  max_output_tokens: number;
  model_type: string;
  features: string[];
  endpoints: string[];
  status: number;
  display_name: string;
}

export interface FeatherlessModel {
  id: string;
  is_gated: boolean;
  created: number;
  model_class: string;
  owned_by: string;
  context_length: number;
  max_completion_tokens: number;
  available_on_current_plan: boolean;
}

// Minimal response types
export interface CerebrasModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface NebiusModel {
  id: string;
  created: number;
  object: string;
  owned_by: string;
}

export interface LambdaModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

// Base provider fetcher interface
export interface ProviderFetcher {
  name: string;
  fetchModels(): Promise<ProviderEntry[]>;
}

// Configuration for rate limiting
export interface RateLimitConfig {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  retryAttempts?: number;
  initialBackoffMs?: number;
}

// Feature mapping types
export interface FeatureMapping {
  [key: string]: keyof ProviderEntry | string[] | null;
}

// Static pricing data structure
export interface StaticPricing {
  [provider: string]: {
    [modelId: string]: {
      input: number;   // $ per 1M tokens
      output: number;  // $ per 1M tokens
    };
  };
}