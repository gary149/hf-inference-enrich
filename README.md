# LLM Pricing

A tool to fetch and compare LLM pricing and capabilities across multiple providers.

## Data Sources

This tool uses two primary data sources:
1. **HuggingFace Router API** (https://router.huggingface.co/v1/models) - Primary source for model pricing, context length, and capability flags
2. **Provider-specific APIs** - Fallback source for additional metadata and capabilities

The HuggingFace Router API now provides comprehensive data including:
- Pricing (input/output costs per million tokens)
- Context length
- supports_tools flag
- supports_structured_output flag
- Provider status

When data is available from both sources, the HuggingFace Router data takes priority.

## Installation

```bash
bun install
```

## Usage

```bash
# Fetch all models and enrich with provider data
bun run get-metrics-new.ts

# Skip specific providers
bun run get-metrics-new.ts --skip-providers novita featherless

# Test performance for models (requires HF_TOKEN)
HF_TOKEN=your_token bun run get-metrics-new.ts --test-performance

# Test specific number of models
HF_TOKEN=your_token bun run get-metrics-new.ts --test-performance --test-limit 10
```

## Supported Providers

- **novita** - Full API support
- **sambanova** - Full API support  
- **groq** - Full API support
- **featherless** - Full API support
- **together** - Full API support
- **cohere** - Full API support
- **fireworks** - Full API support
- **nebius** - HF Router data only
- **hyperbolic** - HF Router data only
- **cerebras** - HF Router data only
- **nscale** - HF Router data only

## Output Files

- `enriched_models_enhanced.json` - Complete enriched model data
- `provider_models_raw.json` - Raw provider API responses for debugging

## Environment Variables

Optional API keys for fetching provider-specific data:
- `NOVITA_API_KEY`
- `SAMBANOVA_API_KEY`
- `GROQ_API_KEY`
- `FEATHERLESS_API_KEY`
- `TOGETHER_API_KEY`
- `COHERE_API_KEY`
- `FIREWORKS_API_KEY`
- `HF_TOKEN` - Required for performance testing

This project was created using `bun init` in bun v1.2.4. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
