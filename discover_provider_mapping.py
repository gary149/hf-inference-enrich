#!/usr/bin/env python3
import requests
import json
from typing import Dict, Set, List
import time

def fetch_huggingface_models() -> List[Dict]:
    """Fetch models from Hugging Face API"""
    response = requests.get("https://router.huggingface.co/v1/models")
    response.raise_for_status()
    return response.json()["data"]

def fetch_openrouter_models() -> List[Dict]:
    """Fetch models from OpenRouter API"""
    response = requests.get("https://openrouter.ai/api/v1/models")
    response.raise_for_status()
    return response.json()["data"]

def fetch_model_endpoints(openrouter_model_id: str) -> Dict:
    """Fetch detailed endpoint pricing for a specific model"""
    try:
        response = requests.get(f"https://openrouter.ai/api/v1/models/{openrouter_model_id}/endpoints")
        if response.status_code == 200:
            return response.json()["data"]
        else:
            return None
    except Exception as e:
        print(f"Error fetching endpoints for {openrouter_model_id}: {e}")
        return None

def build_hf_to_or_mapping(openrouter_models: List[Dict]) -> Dict[str, str]:
    """Build a mapping from HuggingFace ID to OpenRouter ID (preferring non-free versions)"""
    mapping = {}
    
    for model in openrouter_models:
        hf_id = model.get("hugging_face_id", "")
        if hf_id:
            # If we haven't seen this HF ID yet, or if this is a non-free version
            if hf_id not in mapping or not model["id"].endswith(":free"):
                # Remove version suffixes like -07-25 to get base model ID
                base_id = model["id"]
                if ":free" in base_id:
                    base_id = base_id.replace(":free", "")
                # Remove date suffixes
                parts = base_id.split("-")
                if len(parts) >= 3 and parts[-2].isdigit() and parts[-1].isdigit():
                    base_id = "-".join(parts[:-2])
                
                mapping[hf_id] = base_id
    
    return mapping

def main():
    print("Fetching Hugging Face models...")
    hf_models = fetch_huggingface_models()
    
    print("Fetching OpenRouter models...")
    openrouter_models = fetch_openrouter_models()
    
    print("\nBuilding HF to OR mapping...")
    hf_to_or_mapping = build_hf_to_or_mapping(openrouter_models)
    
    # Collect all HF providers
    hf_providers = set()
    for model in hf_models:
        if "providers" in model:
            for provider in model["providers"]:
                hf_providers.add(provider["provider"])
    
    print(f"\nFound {len(hf_providers)} unique HuggingFace providers:")
    for p in sorted(hf_providers):
        print(f"  - {p}")
    
    # Collect provider mappings by checking actual endpoints
    provider_mappings = {}
    openrouter_providers = set()
    
    print("\nChecking OpenRouter endpoints for mappings...")
    checked_models = 0
    for hf_model in hf_models[:20]:  # Check first 20 models to get a good sample
        if hf_model["id"] in hf_to_or_mapping:
            or_id = hf_to_or_mapping[hf_model["id"]]
            print(f"\nChecking {hf_model['id']} -> {or_id}")
            
            endpoint_data = fetch_model_endpoints(or_id)
            if endpoint_data and "endpoints" in endpoint_data:
                # Collect OpenRouter provider names
                or_providers_for_model = set()
                for endpoint in endpoint_data["endpoints"]:
                    provider_name = endpoint.get("provider_name", "").lower()
                    if provider_name:
                        openrouter_providers.add(provider_name)
                        or_providers_for_model.add(provider_name)
                
                # Compare with HF providers for this model
                if "providers" in hf_model:
                    hf_providers_for_model = set(p["provider"] for p in hf_model["providers"])
                    print(f"  HF providers: {sorted(hf_providers_for_model)}")
                    print(f"  OR providers: {sorted(or_providers_for_model)}")
                    
                    # Try to find exact matches or close matches
                    for hf_p in hf_providers_for_model:
                        for or_p in or_providers_for_model:
                            if hf_p.lower().replace("-", "").replace("_", "") == or_p.lower().replace("-", "").replace("_", ""):
                                if hf_p not in provider_mappings:
                                    provider_mappings[hf_p] = or_p
                                    print(f"  Found mapping: {hf_p} -> {or_p}")
            
            checked_models += 1
            time.sleep(0.1)  # Rate limiting
            
            if checked_models >= 20:
                break
    
    print(f"\n\nAll OpenRouter providers found:")
    for p in sorted(openrouter_providers):
        print(f"  - {p}")
    
    print(f"\n\nDiscovered provider mappings:")
    for hf_p, or_p in sorted(provider_mappings.items()):
        print(f'    "{hf_p}": "{or_p}",')
    
    # Try to guess remaining mappings
    print(f"\n\nSuggested mappings for remaining providers:")
    unmapped_hf = hf_providers - set(provider_mappings.keys())
    for hf_p in sorted(unmapped_hf):
        # Try simple transformations
        candidates = [
            hf_p.lower(),
            hf_p.lower().replace("-ai", ""),
            hf_p.lower().replace("-", ""),
            hf_p.lower().replace("_", ""),
        ]
        
        matches = []
        for candidate in candidates:
            for or_p in openrouter_providers:
                if candidate == or_p.lower().replace("-", "").replace("_", ""):
                    matches.append(or_p)
        
        if matches:
            print(f'    "{hf_p}": "{matches[0]}",  # Suggested')
        else:
            print(f'    "{hf_p}": "???",  # No match found')

if __name__ == "__main__":
    main()