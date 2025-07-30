#!/usr/bin/env python3
import requests
import json
import copy
from typing import Dict, List, Any, Optional, Tuple
import time
import asyncio
import httpx
import uuid
import os
import argparse
from datetime import datetime, timezone


# API Endpoints
HUGGINGFACE_API = "https://router.huggingface.co/v1/models"
HUGGINGFACE_ROUTER_API = "https://router.huggingface.co/v1/chat/completions"
OPENROUTER_API = "https://openrouter.ai/api/v1/models"
OPENROUTER_ENDPOINTS_API = "https://openrouter.ai/api/v1/models/{model_id}/endpoints"


# Mapping configurations
PROVIDER_NAME_MAPPING = {
    # Direct matches
    "cerebras": "cerebras",
    "groq": "groq",
    "hyperbolic": "hyperbolic",
    "nebius": "nebius",
    "novita": "novita",
    "sambanova": "sambanova",
    "together": "together",
    "cohere": "cohere",
    # Normalized mappings
    "fireworks-ai": "fireworks",
    "nscale": "lambda",
    "featherless-ai": "featherless",
    "hf-inference": "huggingface",
    "fireworks": "fireworks",
}

PARAMETER_TO_CAPABILITY_MAPPING = {
    # Direct mappings
    "tools": "supports_tools",
    "tool_choice": "supports_function_calling",
    "structured_outputs": "supports_structured_output",
    "response_format": "supports_response_format",
    "stream": "supports_streaming",
    "logprobs": "supports_logprobs",
    "stop": "supports_stop_sequences",
    "seed": "supports_seed",
    "temperature": "supports_temperature",
    "top_p": "supports_top_p",
    "frequency_penalty": "supports_frequency_penalty",
    "presence_penalty": "supports_presence_penalty",
    "repetition_penalty": "supports_repetition_penalty",
    "top_k": "supports_top_k",
    "min_p": "supports_min_p",
    "max_tokens": "supports_max_tokens",
    "logit_bias": "supports_logit_bias",
    "top_logprobs": "supports_top_logprobs",
}


def fetch_huggingface_models() -> List[Dict[str, Any]]:
    """Fetch models from Hugging Face API"""
    response = requests.get(HUGGINGFACE_API)
    response.raise_for_status()
    return response.json()["data"]


def fetch_openrouter_models() -> List[Dict[str, Any]]:
    """Fetch models from OpenRouter API"""
    response = requests.get(OPENROUTER_API)
    response.raise_for_status()
    return response.json()["data"]


def fetch_model_endpoints(openrouter_model_id: str) -> Optional[Dict[str, Any]]:
    """Fetch detailed endpoint pricing for a specific model"""
    try:
        response = requests.get(
            OPENROUTER_ENDPOINTS_API.format(model_id=openrouter_model_id)
        )
        if response.status_code == 200:
            return response.json()["data"]
        else:
            print(
                f"Failed to fetch endpoints for {openrouter_model_id}: {response.status_code}"
            )
            return None
    except Exception as e:
        print(f"Error fetching endpoints for {openrouter_model_id}: {e}")
        return None


def fetch_openrouter_models_with_endpoints() -> List[Dict[str, Any]]:
    """Fetch models from OpenRouter API and enrich with endpoint details"""
    print("Fetching OpenRouter models list...")
    models = fetch_openrouter_models()
    enriched_models = []

    for i, model in enumerate(models):
        model_id = model.get("id", "")
        if not model_id:
            continue

        print(f"Fetching endpoints for {i+1}/{len(models)}: {model_id}")

        # Start with the basic model data
        enriched_model = copy.deepcopy(model)

        # Fetch detailed endpoint data
        endpoint_data = fetch_model_endpoints(model_id)

        if endpoint_data:
            # Add the detailed endpoint data to the model
            enriched_model["endpoints"] = endpoint_data.get("endpoints", [])

            # Create providers array from endpoints data if it doesn't exist or is empty
            if "endpoints" in endpoint_data:
                if "providers" not in enriched_model or not enriched_model["providers"]:
                    enriched_model["providers"] = _create_providers_from_endpoints(
                        endpoint_data["endpoints"]
                    )

        enriched_models.append(enriched_model)

        # Small delay to avoid rate limiting
        time.sleep(0.1)

    return enriched_models


def _create_providers_from_endpoints(
    endpoints: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Create provider entries from endpoint data"""
    providers = []

    for endpoint in endpoints:
        provider_entry = {
            "provider": endpoint.get("provider_name", ""),
            "status": "-",  # Status will be determined by actual testing
        }

        # Copy relevant fields
        field_mappings = [
            "context_length",
            "pricing",
            "quantization",
            "max_completion_tokens",
            "supported_parameters",
            "uptime_last_30m",
            "tag",
        ]

        for field in field_mappings:
            if field in endpoint:
                provider_entry[field] = endpoint[field]

        # Parse supported parameters into capability flags
        if "supported_parameters" in endpoint:
            supports = parse_supported_parameters(endpoint["supported_parameters"])
            provider_entry.update(supports)

        providers.append(provider_entry)

    return providers


def build_hf_to_or_mapping(openrouter_models: List[Dict[str, Any]]) -> Dict[str, str]:
    """Build a mapping from HuggingFace ID to OpenRouter ID (excluding :free versions)"""
    mapping = {}

    for model in openrouter_models:
        hf_id = model.get("hugging_face_id", "")
        or_id = model.get("id", "")

        # Skip free versions
        if hf_id and not or_id.endswith(":free"):
            # If we haven't seen this HF ID yet, store it
            if hf_id not in mapping:
                mapping[hf_id] = or_id

                # Handle Meta-Llama vs Llama naming differences
                if hf_id.startswith("meta-llama/Meta-Llama-"):
                    alt_hf_id = hf_id.replace(
                        "meta-llama/Meta-Llama-", "meta-llama/Llama-"
                    )
                    if alt_hf_id not in mapping:
                        mapping[alt_hf_id] = or_id

    return mapping


def parse_supported_parameters(supported_params: List[str]) -> Dict[str, bool]:
    """Convert OpenRouter supported_parameters array to supports_* boolean fields"""
    supports = {}

    # Initialize all as False
    for support_field in PARAMETER_TO_CAPABILITY_MAPPING.values():
        supports[support_field] = False

    # Set to True based on what's in supported_parameters
    for param in supported_params:
        if param in PARAMETER_TO_CAPABILITY_MAPPING:
            supports[PARAMETER_TO_CAPABILITY_MAPPING[param]] = True

    # Special handling: if we have tools or tool_choice, we support function calling
    if "tools" in supported_params or "tool_choice" in supported_params:
        supports["supports_function_calling"] = True
        supports["supports_tools"] = True

    # If we have structured_outputs or response_format, we support structured output
    if (
        "structured_outputs" in supported_params
        or "response_format" in supported_params
    ):
        supports["supports_structured_output"] = True

    return supports


def normalize_provider_name(provider: str) -> str:
    """Normalize provider names to match between HuggingFace and OpenRouter"""
    return PROVIDER_NAME_MAPPING.get(provider.lower(), provider.lower())


def _create_provider_enrichment_map(
    endpoints: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """Create a map of provider name to enrichment data from endpoints"""
    provider_enrichment = {}

    for endpoint in endpoints:
        provider = endpoint.get("provider_name", "")
        if not provider:
            continue

        enrichment = {}

        # Pricing
        if endpoint.get("pricing"):
            pricing = endpoint["pricing"]
            # Convert to per-million tokens
            if pricing.get("prompt") != "0" or pricing.get("completion") != "0":
                enrichment["pricing"] = {
                    "input": round(float(pricing.get("prompt", "0")) * 1_000_000, 2),
                    "output": round(
                        float(pricing.get("completion", "0")) * 1_000_000, 2
                    ),
                }

        # Uptime
        if "uptime_last_30m" in endpoint and endpoint["uptime_last_30m"] is not None:
            enrichment["uptime_30d"] = round(endpoint["uptime_last_30m"], 2)

        # Context length
        if "context_length" in endpoint and endpoint["context_length"]:
            enrichment["context_length"] = endpoint["context_length"]

        # Quantization
        if "quantization" in endpoint and endpoint["quantization"]:
            enrichment["quantization"] = endpoint["quantization"]

        # Parse supported parameters
        if "supported_parameters" in endpoint and endpoint["supported_parameters"]:
            supports = parse_supported_parameters(endpoint["supported_parameters"])
            enrichment.update(supports)

        provider_enrichment[provider.lower()] = enrichment

    return provider_enrichment


def _update_provider_with_enrichment(
    provider: Dict[str, Any], enrichment: Dict[str, Any], stats: Dict[str, Any]
) -> bool:
    """Update a provider with enrichment data and track statistics"""
    original_had_pricing = provider.get("pricing") is not None
    model_enriched = False

    # Apply all enrichment data
    for key, value in enrichment.items():
        if key not in provider or provider[key] != value:
            provider[key] = value
            if key.startswith("supports_") and key not in [
                "supports_tools",
                "supports_structured_output",
            ]:
                stats["new_capabilities_added"] += 1

    # Track statistics
    if not original_had_pricing and "pricing" in enrichment:
        stats["providers_enriched"] += 1
        model_enriched = True

    return model_enriched


def enrich_huggingface_models(
    hf_models: List[Dict[str, Any]],
    hf_to_or_mapping: Dict[str, str],
    openrouter_models: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Enrich Hugging Face models with per-provider pricing and capabilities from OpenRouter endpoints"""
    enriched_models = []

    # Create a map of OpenRouter model ID to model data for quick lookup
    or_model_map = {model["id"]: model for model in openrouter_models if "id" in model}

    # Statistics tracking
    stats = _initialize_statistics(len(hf_models))

    for i, model in enumerate(hf_models):
        enriched_model = copy.deepcopy(model)
        model_id = model["id"]

        # Check if we have an OpenRouter mapping for this model
        if model_id in hf_to_or_mapping:
            or_model_id = hf_to_or_mapping[model_id]
            stats["models_with_mapping"] += 1
            print(f"Processing {i+1}/{len(hf_models)}: {model_id} -> {or_model_id}")

            # Get the complete OpenRouter model data from our map
            if or_model_id in or_model_map:
                or_model = or_model_map[or_model_id]

                # Use the endpoints data if available
                if "endpoints" in or_model:
                    # Create enrichment data lookup by provider
                    provider_enrichment = _create_provider_enrichment_map(
                        or_model["endpoints"]
                    )

                    # Apply enrichment to matching providers
                    model_enriched = False
                    if "providers" in enriched_model:
                        for provider in enriched_model["providers"]:
                            provider_name = normalize_provider_name(
                                provider["provider"]
                            )

                            # Check if this provider has enrichment data
                            if provider_name in provider_enrichment:
                                enrichment = provider_enrichment[provider_name]

                                # Update provider and track if model was enriched
                                if _update_provider_with_enrichment(
                                    provider, enrichment, stats
                                ):
                                    model_enriched = True

                                # Update uptime stats
                                if "uptime_30d" in enrichment:
                                    uptime = enrichment["uptime_30d"]
                                    stats["uptime_stats"]["min"] = min(
                                        stats["uptime_stats"]["min"], uptime
                                    )
                                    stats["uptime_stats"]["max"] = max(
                                        stats["uptime_stats"]["max"], uptime
                                    )
                                    stats["uptime_stats"]["sum"] += uptime
                                    stats["uptime_stats"]["count"] += 1

                    if model_enriched:
                        stats["models_enriched"] += 1
        else:
            if i < 10:  # Only log first few
                print(
                    f"Processing {i+1}/{len(hf_models)}: {model_id} - No OpenRouter mapping found"
                )

        enriched_models.append(enriched_model)

    return enriched_models, stats


def _initialize_statistics(total_models: int) -> Dict[str, Any]:
    """Initialize statistics tracking dictionary"""
    return {
        "total_models": total_models,
        "models_with_mapping": 0,
        "models_enriched": 0,
        "providers_enriched": 0,
        "status_distribution": {},
        "uptime_stats": {"min": 100.0, "max": 0.0, "sum": 0.0, "count": 0},
        "new_capabilities_added": 0,
    }


def _print_statistics(stats: Dict[str, Any]) -> None:
    """Print enrichment statistics"""
    print("\n" + "=" * 60)
    print("ENRICHMENT STATISTICS")
    print("=" * 60)
    print(f"Total models processed: {stats['total_models']}")
    print(f"Models with OpenRouter mapping: {stats['models_with_mapping']}")
    print(f"Models enriched with pricing: {stats['models_enriched']}")
    print(f"Provider entries enriched: {stats['providers_enriched']}")
    print(f"New capability fields added: {stats['new_capabilities_added']}")

    # Note: Status distribution is now tracked during performance testing, not enrichment

    if stats["uptime_stats"]["count"] > 0:
        avg_uptime = stats["uptime_stats"]["sum"] / stats["uptime_stats"]["count"]
        print(f"\nUptime Statistics (30-day):")
        print(f"  Min: {stats['uptime_stats']['min']:.2f}%")
        print(f"  Max: {stats['uptime_stats']['max']:.2f}%")
        print(f"  Avg: {avg_uptime:.2f}%")


async def test_model_provider(
    client: httpx.AsyncClient,
    model_id: str,
    provider_name: str,
    hf_token: str,
) -> Dict[str, Any]:
    """Test a specific model-provider combination for latency and throughput"""
    # Build cache-busting prompt
    nonce = uuid.uuid4().hex[:8]
    prompt = f"What is the capital of France?\n<!-- nonce:{nonce} -->"

    payload = {
        "model": f"{model_id}:{provider_name}",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {hf_token}",
        "Content-Type": "application/json",
    }

    start = time.perf_counter()

    try:
        response = await client.post(
            HUGGINGFACE_ROUTER_API,
            headers=headers,
            json=payload,
            timeout=30.0,
        )

        latency = time.perf_counter() - start

        if response.status_code == 200:
            data = response.json()
            usage = data.get("usage", {})
            # Calculate throughput using total tokens (prompt + completion)
            total_tokens = usage.get("total_tokens") or (
                usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
            )
            tps = total_tokens / latency if total_tokens > 0 else 0.0

            return {
                "latency_s": round(latency, 2),
                "throughput_tps": round(tps, 2),
                "status": "live",  # Successful response means provider is live
            }
        else:
            # Log error but don't crash
            error_data = (
                response.json()
                if response.headers.get("content-type") == "application/json"
                else {}
            )
            error_msg = error_data.get("error", {}).get(
                "message", f"HTTP {response.status_code}"
            )
            return {"performance_error": error_msg, "status": "offline"}

    except asyncio.TimeoutError:
        return {"performance_error": "Request timeout", "status": "offline"}
    except Exception as e:
        return {"performance_error": str(e), "status": "offline"}


async def test_providers_batch(
    model_provider_pairs: List[Tuple[str, str, Dict[str, Any]]],
    hf_token: str,
) -> None:
    """Test a batch of model-provider pairs concurrently"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        tasks = []

        for model_id, provider_name, provider_dict in model_provider_pairs:
            task = test_model_provider(client, model_id, provider_name, hf_token)
            tasks.append((provider_dict, task))

        # Execute all tests concurrently
        results = await asyncio.gather(
            *[task for _, task in tasks], return_exceptions=True
        )

        # Update provider dictionaries with results
        for (provider_dict, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                provider_dict["performance_error"] = str(result)
            else:
                provider_dict.update(result)

            provider_dict["performance_tested_at"] = datetime.now(
                timezone.utc
            ).isoformat()


async def test_all_providers(
    enriched_models: List[Dict[str, Any]],
    hf_token: str,
    test_limit: Optional[int] = None,
    batch_size: int = 20,
    provider_filter: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Test performance for all model-provider combinations"""
    # Collect all model-provider pairs to test
    all_pairs = []

    models_to_test = enriched_models[:test_limit] if test_limit else enriched_models

    for model in models_to_test:
        model_id = model.get("id", "")
        if not model_id:
            continue

        for provider in model.get("providers", []):
            provider_name = provider.get("provider", "")
            if not provider_name:
                continue

            # Apply provider filter if specified
            if provider_filter and provider_name not in provider_filter:
                continue

            all_pairs.append((model_id, provider_name, provider))

    print(f"\nTesting performance for {len(all_pairs)} model-provider combinations...")

    # Process in batches
    tested = 0
    errors = 0
    status_counts = {"live": 0, "offline": 0, "not_tested": 0}

    for i in range(0, len(all_pairs), batch_size):
        batch = all_pairs[i : i + batch_size]
        print(
            f"Testing batch {i//batch_size + 1}/{(len(all_pairs) + batch_size - 1)//batch_size}..."
        )

        await test_providers_batch(batch, hf_token)

        # Count results
        for _, _, provider_dict in batch:
            tested += 1
            if "performance_error" in provider_dict:
                errors += 1
            # Count status
            status = provider_dict.get("status", "-")
            if status == "live":
                status_counts["live"] += 1
            elif status == "offline":
                status_counts["offline"] += 1
            else:
                status_counts["not_tested"] += 1

        # Small delay between batches to avoid rate limiting
        if i + batch_size < len(all_pairs):
            await asyncio.sleep(1.0)

    return {
        "total_tested": tested,
        "successful": tested - errors,
        "errors": errors,
        "status_distribution": status_counts,
    }


def _print_performance_examples(enriched_models: List[Dict[str, Any]]) -> None:
    """Print example entries with performance data"""
    print("\n" + "=" * 60)
    print("PERFORMANCE TEST EXAMPLES")
    print("=" * 60)

    examples_shown = 0
    max_examples = 5

    for model in enriched_models:
        if "providers" in model:
            for provider in model["providers"]:
                # Show examples with performance data
                if "latency_s" in provider and "throughput_tps" in provider:
                    if examples_shown < max_examples:
                        print(f"\nModel: {model['id']}")
                        print(f"Provider: {provider['provider']}")
                        print(f"  Latency: {provider['latency_s']}s")
                        print(f"  Throughput: {provider['throughput_tps']} tokens/sec")
                        if "performance_tested_at" in provider:
                            print(f"  Tested at: {provider['performance_tested_at']}")

                        examples_shown += 1
                        break
                elif "performance_error" in provider and examples_shown < 2:
                    # Show a couple error examples
                    print(f"\nModel: {model['id']}")
                    print(f"Provider: {provider['provider']}")
                    print(f"  Error: {provider['performance_error']}")
                    examples_shown += 1
                    break

        if examples_shown >= max_examples:
            break


def _print_example_entries(enriched_models: List[Dict[str, Any]]) -> None:
    """Print example enriched entries"""
    print("\n" + "=" * 60)
    print("EXAMPLE ENRICHED ENTRIES")
    print("=" * 60)

    examples_shown = 0
    target_fields = [
        "uptime_30d",
        "quantization",
        "supports_streaming",
        "status",
    ]

    for model in enriched_models:
        if "providers" in model:
            for provider in model["providers"]:
                # Show examples with new enrichment fields
                if any(key in provider for key in target_fields):
                    if examples_shown < 3:
                        print(f"\nModel: {model['id']}")
                        print(f"Provider: {provider['provider']}")

                        if "pricing" in provider:
                            print(
                                f"  Pricing: ${provider['pricing']['input']}/M input, ${provider['pricing']['output']}/M output"
                            )
                        if "status" in provider:
                            print(f"  Status: {provider['status']}")
                        if "uptime_30d" in provider:
                            print(f"  Uptime (30d): {provider['uptime_30d']}%")
                        if "quantization" in provider:
                            print(f"  Quantization: {provider['quantization']}")
                        if "context_length" in provider:
                            print(f"  Context Length: {provider['context_length']:,}")

                        # Show some capability flags
                        capability_flags = [
                            k
                            for k in provider.keys()
                            if k.startswith("supports_") and provider[k]
                        ]
                        if capability_flags:
                            print(
                                f"  Capabilities: {', '.join(sorted(capability_flags))}"
                            )

                        examples_shown += 1
                        break

            if examples_shown >= 3:
                break


def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description="Enrich HuggingFace models with OpenRouter pricing and performance data"
    )
    parser.add_argument(
        "--test-performance",
        action="store_true",
        help="Test model performance using HuggingFace Router API",
    )
    parser.add_argument(
        "--test-limit",
        type=int,
        default=None,
        help="Limit performance testing to first N models",
    )
    parser.add_argument(
        "--test-providers",
        nargs="+",
        default=None,
        help="Test only specific providers (e.g., --test-providers cerebras groq)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=20,
        help="Batch size for concurrent performance tests (default: 20)",
    )
    return parser.parse_args()


def main():
    args = parse_arguments()

    print("Fetching Hugging Face models...")
    hf_models = fetch_huggingface_models()
    print(f"Found {len(hf_models)} Hugging Face models")

    print("\nFetching OpenRouter models with complete endpoint data...")
    openrouter_models = fetch_openrouter_models_with_endpoints()
    print(f"Found {len(openrouter_models)} OpenRouter models with endpoint details")

    print("\nBuilding HuggingFace to OpenRouter ID mapping...")
    hf_to_or_mapping = build_hf_to_or_mapping(openrouter_models)
    print(f"Found mappings for {len(hf_to_or_mapping)} Hugging Face models")

    print(
        "\nEnriching Hugging Face models with per-provider pricing and capabilities..."
    )
    enriched_models, stats = enrich_huggingface_models(
        hf_models, hf_to_or_mapping, openrouter_models
    )

    # Test performance if requested
    if args.test_performance:
        hf_token = os.environ.get("HF_TOKEN")
        if not hf_token:
            print(
                "\nERROR: HF_TOKEN environment variable not set. Skipping performance tests."
            )
        else:
            print("\n" + "=" * 60)
            print("PERFORMANCE TESTING")
            print("=" * 60)

            # Run async performance tests
            perf_stats = asyncio.run(
                test_all_providers(
                    enriched_models,
                    hf_token,
                    test_limit=args.test_limit,
                    batch_size=args.batch_size,
                    provider_filter=args.test_providers,
                )
            )

            print(f"\nPerformance testing complete:")
            print(f"  Total tested: {perf_stats['total_tested']}")
            print(f"  Successful: {perf_stats['successful']}")
            print(f"  Errors: {perf_stats['errors']}")

            if "status_distribution" in perf_stats:
                print("\nProvider Status Distribution:")
                for status, count in sorted(perf_stats["status_distribution"].items()):
                    print(f"  {status}: {count}")

    # Save the enriched data with generation timestamp
    output_file = "enriched_models_enhanced.json"
    output_data = {
        "data": enriched_models,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "total_models": len(enriched_models),
            "models_with_mapping": stats["models_with_mapping"],
            "models_enriched": stats["models_enriched"],
            "performance_tested": args.test_performance,
        },
    }
    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"\nEnriched data saved to {output_file}")

    # Also save the complete OpenRouter models data
    openrouter_output_file = "openrouter_models_complete.json"
    with open(openrouter_output_file, "w") as f:
        json.dump({"data": openrouter_models}, f, indent=2)

    print(f"Complete OpenRouter models saved to {openrouter_output_file}")

    # Print statistics and examples
    _print_statistics(stats)
    _print_example_entries(enriched_models)

    # Print performance examples if we tested
    if args.test_performance and hf_token:
        _print_performance_examples(enriched_models)


if __name__ == "__main__":
    main()
