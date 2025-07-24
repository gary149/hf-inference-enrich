#!/usr/bin/env python3
import requests
import json
import copy
from typing import Dict, List, Any, Optional
import time


def fetch_huggingface_models() -> List[Dict[str, Any]]:
    """Fetch models from Hugging Face API"""
    response = requests.get("https://router.huggingface.co/v1/models")
    response.raise_for_status()
    return response.json()["data"]


def fetch_openrouter_models() -> List[Dict[str, Any]]:
    """Fetch models from OpenRouter API"""
    response = requests.get("https://openrouter.ai/api/v1/models")
    response.raise_for_status()
    return response.json()["data"]


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

    return mapping


def fetch_model_endpoints(openrouter_model_id: str) -> Optional[Dict[str, Any]]:
    """Fetch detailed endpoint pricing for a specific model"""
    try:
        response = requests.get(
            f"https://openrouter.ai/api/v1/models/{openrouter_model_id}/endpoints"
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


def normalize_provider_name(provider: str) -> str:
    """Normalize provider names to match between HuggingFace and OpenRouter"""
    # Based on discovered mappings
    mapping = {
        # Direct matches (already work)
        "cerebras": "cerebras",
        "groq": "groq",
        "hyperbolic": "hyperbolic",
        "nebius": "nebius",
        "novita": "novita",
        "sambanova": "sambanova",
        "together": "together",
        # Discovered mappings
        "fireworks-ai": "fireworks",
        "nscale": "lambda",  # Based on the providers list comparison
        "featherless-ai": "featherless",  # Likely mapping
        "hf-inference": "huggingface",  # Likely mapping
        # Cohere might not have a direct mapping in OpenRouter
        "cohere": "cohere",
    }

    normalized = mapping.get(provider.lower(), provider.lower())
    return normalized


def enrich_huggingface_models(
    hf_models: List[Dict[str, Any]], hf_to_or_mapping: Dict[str, str]
) -> List[Dict[str, Any]]:
    """Enrich Hugging Face models with per-provider pricing from OpenRouter endpoints"""
    enriched_models = []

    for i, model in enumerate(hf_models):
        enriched_model = copy.deepcopy(model)
        model_id = model["id"]

        # Check if we have an OpenRouter mapping for this model
        if model_id in hf_to_or_mapping:
            or_model_id = hf_to_or_mapping[model_id]
            print(f"Processing {i+1}/{len(hf_models)}: {model_id} -> {or_model_id}")

            # Fetch endpoint data
            endpoint_data = fetch_model_endpoints(or_model_id)

            if endpoint_data and "endpoints" in endpoint_data:
                # Create a pricing lookup by provider
                provider_pricing = {}
                for endpoint in endpoint_data["endpoints"]:
                    provider = endpoint.get("provider_name", "")
                    if provider and endpoint.get("pricing"):
                        pricing = endpoint["pricing"]
                        # Convert to per-million tokens
                        if (
                            pricing.get("prompt") != "0"
                            or pricing.get("completion") != "0"
                        ):
                            provider_pricing[provider.lower()] = {
                                "input": round(
                                    float(pricing.get("prompt", "0")) * 1_000_000, 2
                                ),
                                "output": round(
                                    float(pricing.get("completion", "0")) * 1_000_000, 2
                                ),
                            }

                # Apply pricing to matching providers
                if "providers" in enriched_model:
                    for provider in enriched_model["providers"]:
                        provider_name = normalize_provider_name(provider["provider"])

                        # Check if this provider has pricing in the endpoint data
                        if provider_name in provider_pricing and not provider.get(
                            "pricing"
                        ):
                            provider["pricing"] = provider_pricing[provider_name]

                        # Debug output for unmatched providers
                        elif (
                            not provider.get("pricing")
                            and provider_name not in provider_pricing
                        ):
                            available_providers = list(provider_pricing.keys())
                            if available_providers and i < 5:  # Only debug first few
                                print(
                                    f"  No match for {provider['provider']} (normalized: {provider_name})"
                                )
                                print(f"  Available: {sorted(available_providers)}")

            # Small delay to avoid rate limiting
            time.sleep(0.1)
        else:
            if i < 10:  # Only log first few
                print(
                    f"Processing {i+1}/{len(hf_models)}: {model_id} - No OpenRouter mapping found"
                )

        enriched_models.append(enriched_model)

    return enriched_models


def main():
    print("Fetching Hugging Face models...")
    hf_models = fetch_huggingface_models()
    print(f"Found {len(hf_models)} Hugging Face models")

    print("\nFetching OpenRouter models...")
    openrouter_models = fetch_openrouter_models()
    print(f"Found {len(openrouter_models)} OpenRouter models")

    print("\nBuilding HuggingFace to OpenRouter ID mapping...")
    hf_to_or_mapping = build_hf_to_or_mapping(openrouter_models)
    print(f"Found mappings for {len(hf_to_or_mapping)} Hugging Face models")

    print("\nEnriching Hugging Face models with per-provider pricing...")
    enriched_models = enrich_huggingface_models(hf_models, hf_to_or_mapping)

    # Count how many providers were enriched
    enriched_count = 0
    enriched_models_count = 0
    models_with_enrichment = set()

    for i, model in enumerate(enriched_models):
        model_enriched = False
        if "providers" in model:
            for j, provider in enumerate(model["providers"]):
                # Check if this provider was enriched by comparing with original
                if "providers" in hf_models[i] and j < len(hf_models[i]["providers"]):
                    if not hf_models[i]["providers"][j].get("pricing") and provider.get(
                        "pricing"
                    ):
                        enriched_count += 1
                        model_enriched = True

        if model_enriched:
            enriched_models_count += 1
            models_with_enrichment.add(model["id"])

    # Save the enriched data
    output_file = "enriched_models.json"
    with open(output_file, "w") as f:
        json.dump({"data": enriched_models}, f, indent=2)

    print(f"\nEnriched data saved to {output_file}")

    # Print some examples
    print("\nExample enriched entries:")
    examples_shown = 0
    for i, model in enumerate(enriched_models):
        if model["id"] in models_with_enrichment and examples_shown < 5:
            print(f"\nModel: {model['id']}")
            if "providers" in model:
                for j, provider in enumerate(model["providers"]):
                    if "providers" in hf_models[i] and j < len(
                        hf_models[i]["providers"]
                    ):
                        if not hf_models[i]["providers"][j].get(
                            "pricing"
                        ) and provider.get("pricing"):
                            print(f"  Provider: {provider['provider']}")
                            print(f"  Pricing: {provider['pricing']}")
            examples_shown += 1

    print(f"\nSummary:")
    print(f"- Total models processed: {len(hf_models)}")
    print(f"- Models with OpenRouter mapping: {len(hf_to_or_mapping)}")
    print(f"- Models enriched with pricing: {enriched_models_count}")
    print(f"- Provider entries enriched: {enriched_count}")


if __name__ == "__main__":
    main()
