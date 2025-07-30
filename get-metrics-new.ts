// get-metrics-new.ts - Updated version using direct provider APIs
import * as fs from "node:fs";
import { parseArgs } from "util";
import { ProviderAggregator, ProviderEntry } from "./providers";
import { extractHFRouterData } from "./providers/huggingface-router";

/* -------------------------------------------------------------------------- */
/*  CONSTANTS                                                                 */
/* -------------------------------------------------------------------------- */

const HUGGINGFACE_API = "https://router.huggingface.co/v1/models";
const HUGGINGFACE_ROUTER_API =
  "https://router.huggingface.co/v1/chat/completions";

/* -------------------------------------------------------------------------- */
/*  TYPE DEFINITIONS                                                          */
/* -------------------------------------------------------------------------- */

interface HFModel {
  id: string;
  [key: string]: any;
  providers?: ProviderEntry[];
}

interface Statistics {
  total_models: number;
  models_enriched: number;
  providers_enriched: number;
  new_capabilities_added: number;
  providers_fetched: Record<string, number>;
}

interface PerformanceTestResult {
  total_tested: number;
  successful: number;
  errors: number;
  status_distribution: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/*  FETCH HELPERS                                                             */
/* -------------------------------------------------------------------------- */

async function fetchHuggingfaceModels(): Promise<HFModel[]> {
  const resp = await fetch(HUGGINGFACE_API).then(
    (r) => r.json() as Promise<{ data: HFModel[] }>
  );
  return resp.data;
}

/* -------------------------------------------------------------------------- */
/*  PROVIDER ENRICHMENT                                                       */
/* -------------------------------------------------------------------------- */

function normalizeModelId(modelId: string): string {
  // Convert HF model ID to a normalized form for matching
  // Remove organization prefix for common patterns
  const patterns = [
    /^meta-llama\/Meta-Llama-(.+)$/,
    /^meta-llama\/Llama-(.+)$/,
    /^mistralai\/(.+)$/,
    /^google\/(.+)$/,
    /^anthropic\/(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = modelId.match(pattern);
    if (match) {
      return match[1].toLowerCase();
    }
  }

  // For other models, just use the part after the last slash
  const parts = modelId.split("/");
  return parts[parts.length - 1].toLowerCase();
}

function matchProviderModel(
  hfModelId: string,
  providerEntries: Map<string, ProviderEntry[]>
): Map<string, ProviderEntry[]> {
  const normalizedHfId = normalizeModelId(hfModelId);
  const matches = new Map<string, ProviderEntry[]>();

  for (const [provider, entries] of providerEntries) {
    const matchingEntries = entries.filter((entry) => {
      // This would need to be enhanced with provider-specific matching logic
      // For now, we'll use simple substring matching
      const entryId = (entry as any).id || (entry as any).model_id || "";
      const normalizedEntryId = normalizeModelId(entryId);

      return (
        normalizedEntryId.includes(normalizedHfId) ||
        normalizedHfId.includes(normalizedEntryId)
      );
    });

    if (matchingEntries.length > 0) {
      matches.set(provider, matchingEntries);
    }
  }

  return matches;
}

async function enrichHuggingfaceModels(
  hfModels: HFModel[],
  aggregator: ProviderAggregator
): Promise<{ enriched: HFModel[]; stats: Statistics; matchedProviderData: any[] }> {
  console.log("\nFetching data from all providers...");
  const providerData = await aggregator.fetchAllProviders();

  const stats: Statistics = {
    total_models: hfModels.length,
    models_enriched: 0,
    providers_enriched: 0,
    new_capabilities_added: 0,
    providers_fetched: {},
  };

  // Count models per provider
  for (const [provider, entries] of providerData) {
    stats.providers_fetched[provider] = entries.length;
  }

  const enrichedModels: HFModel[] = [];
  const matchedProviderData: any[] = [];
  const matchedProviderKeys = new Set<string>(); // Track unique model-provider combinations
  const hfModelIds = new Set(hfModels.map(m => m.id));

  console.log(`\nProcessing ${hfModels.length} models from HuggingFace Router API...`);

  for (const hfModel of hfModels) {
    const enrichedModel = structuredClone(hfModel);
    
    // Extract HF router data first (this is already in the model)
    const hfRouterData = extractHFRouterData(enrichedModel);
    
    // Find matches from provider APIs
    const matches = matchProviderModel(hfModel.id, providerData);

    // Ensure providers array exists
    if (!enrichedModel.providers) {
      enrichedModel.providers = [];
    }

    let modelEnriched = false;

    // Process HF router data first (prioritize it)
    for (const [providerName, hfProviderData] of hfRouterData) {
      const normalizedProvider = normalizeProviderName(providerName);
      
      // Check if provider already exists in the model
      let existingProvider = enrichedModel.providers.find(
        (p) => normalizeProviderName(p.provider) === normalizedProvider
      );
      
      if (existingProvider) {
        // HF router data is already there, just count it
        if (hfProviderData.pricing) {
          stats.providers_enriched++;
          modelEnriched = true;
        }
        // Track this provider data as matched (avoid duplicates)
        const matchKey = `${hfModel.id}:${providerName}`;
        if (!matchedProviderKeys.has(matchKey)) {
          matchedProviderKeys.add(matchKey);
          matchedProviderData.push({
            provider: providerName,
            id: hfModel.id,
            ...hfProviderData
          });
        }
      }
    }

    // Then enrich with provider API data where missing
    if (matches.size > 0) {
      for (const [provider, providerEntries] of matches) {
        for (const providerEntry of providerEntries) {
          // Find existing provider entry
          let existingProvider = enrichedModel.providers.find(
            (p) => normalizeProviderName(p.provider) === provider.toLowerCase()
          );

          if (!existingProvider) {
            // No HF router data for this provider
            // Skip - we only want providers that are listed in HF Router
            continue;
          } else {
            // Merge data, but prioritize HF router data
            const hadPricing = !!existingProvider.pricing;
            const hadTools = existingProvider.supports_tools !== undefined;
            const hadStructured = existingProvider.supports_structured_output !== undefined;
            const hadContext = !!existingProvider.context_length;
            
            // Only add provider API data for missing fields
            const mergedData: any = {};
            
            // Add provider API data only if HF router doesn't have it
            if (!hadPricing && providerEntry.pricing) {
              mergedData.pricing = providerEntry.pricing;
              stats.providers_enriched++;
              modelEnriched = true;
            }
            
            if (!hadContext && providerEntry.context_length) {
              mergedData.context_length = providerEntry.context_length;
            }
            
            if (!hadTools && providerEntry.supports_tools !== undefined) {
              mergedData.supports_tools = providerEntry.supports_tools;
            }
            
            if (!hadStructured && providerEntry.supports_structured_output !== undefined) {
              mergedData.supports_structured_output = providerEntry.supports_structured_output;
            }
            
            // Add other capabilities from provider API
            for (const key of Object.keys(providerEntry)) {
              if (
                key.startsWith("supports_") &&
                !["supports_tools", "supports_structured_output"].includes(key) &&
                !(key in existingProvider)
              ) {
                mergedData[key] = (providerEntry as any)[key];
                stats.new_capabilities_added++;
              }
            }
            
            // Apply merged data
            Object.assign(existingProvider, mergedData);
            
            // Track the enriched data (avoid duplicates)
            const matchKey = `${hfModel.id}:${provider}`;
            if (!matchedProviderKeys.has(matchKey)) {
              matchedProviderKeys.add(matchKey);
              matchedProviderData.push({
                provider,
                id: hfModel.id,
                ...existingProvider
              });
            }
          }
        }
      }
    }

    if (modelEnriched) {
      stats.models_enriched++;
    }

    enrichedModels.push(enrichedModel);
  }

  // Log models from provider APIs that weren't matched
  let unmatchedCount = 0;
  for (const [provider, entries] of providerData) {
    for (const entry of entries) {
      const modelId = (entry as any).model_id || (entry as any).id || "";
      if (modelId) {
        const matchKey = `${modelId}:${provider}`;
        if (!matchedProviderKeys.has(matchKey)) {
          unmatchedCount++;
        }
      }
    }
  }
  
  if (unmatchedCount > 0) {
    console.log(`\nNote: ${unmatchedCount} models from provider APIs were not included (not in HF Router).`);
  }

  return { enriched: enrichedModels, stats, matchedProviderData };
}

// Helper function to normalize provider names for comparison
function normalizeProviderName(providerName: string): string {
  const providerMap: Record<string, string> = {
    'featherless-ai': 'featherless',
    'fireworks-ai': 'fireworks',
    'hf-inference': 'huggingface',
  };
  
  return (providerMap[providerName] || providerName).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/*  PERFORMANCE TESTING                                                       */
/* -------------------------------------------------------------------------- */

async function testModelProvider(
  modelId: string,
  providerName: string,
  hfToken: string
): Promise<Partial<ProviderEntry>> {
  const nonce = crypto.randomUUID().slice(0, 8);
  const prompt = `What is the capital of France?\n<!-- nonce:${nonce} -->`;

  const payload = {
    model: `${modelId}:${providerName}`,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    temperature: 0.7,
  };

  const headers = {
    Authorization: `Bearer ${hfToken}`,
    "Content-Type": "application/json",
  };

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const resp = await fetch(HUGGINGFACE_ROUTER_API, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = (performance.now() - start) / 1000;

    if (resp.ok) {
      const data = await resp.json();
      const usage = data.usage ?? {};
      const totalTokens =
        usage.total_tokens ??
        (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
      const tps = totalTokens ? totalTokens / latency : 0;

      return {
        latency_s: Number(latency.toFixed(2)),
        throughput_tps: Number(tps.toFixed(2)),
        status: "live",
      };
    }

    const data = await resp.json().catch(() => ({}));
    const msg =
      data?.error?.message ?? `HTTP ${resp.status} ${resp.statusText}`;
    return { performance_error: msg, status: "offline" };
  } catch (err: any) {
    const msg = err.name === "AbortError" ? "Request timeout" : err.message;
    return { performance_error: msg, status: "offline" };
  }
}

async function testProvidersBatch(
  triplets: [string, string, ProviderEntry][],
  hfToken: string
): Promise<void> {
  await Promise.all(
    triplets.map(async ([modelId, providerName, prov]) => {
      const res = await testModelProvider(modelId, providerName, hfToken);
      Object.assign(prov, res, {
        performance_tested_at: new Date().toISOString(),
      });
    })
  );
}

async function testAllProviders(
  models: HFModel[],
  hfToken: string,
  limit: number | undefined,
  batchSize: number,
  filter: string[] | undefined
): Promise<PerformanceTestResult> {
  const subset = typeof limit === "number" ? models.slice(0, limit) : models;

  const allPairs: [string, string, ProviderEntry][] = [];
  for (const m of subset) {
    for (const p of m.providers ?? []) {
      if (filter && !filter.includes(p.provider)) continue;
      allPairs.push([m.id, p.provider, p]);
    }
  }

  console.log(
    `\nTesting performance for ${allPairs.length} model-provider combinations...`
  );

  let tested = 0;
  let errors = 0;
  const statusDist: Record<string, number> = {
    live: 0,
    offline: 0,
    not_tested: 0,
  };

  for (let i = 0; i < allPairs.length; i += batchSize) {
    const batch = allPairs.slice(i, i + batchSize);
    console.log(
      `Testing batch ${i / batchSize + 1}/${Math.ceil(
        allPairs.length / batchSize
      )}...`
    );
    await testProvidersBatch(batch, hfToken);

    batch.forEach(([_, __, prov]) => {
      tested += 1;
      if (prov.performance_error) errors += 1;
      switch (prov.status) {
        case "live":
          statusDist.live += 1;
          break;
        case "offline":
          statusDist.offline += 1;
          break;
        default:
          statusDist.not_tested += 1;
      }
    });

    if (i + batchSize < allPairs.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    total_tested: tested,
    successful: tested - errors,
    errors,
    status_distribution: statusDist,
  };
}

/* -------------------------------------------------------------------------- */
/*  PRINT HELPERS                                                             */
/* -------------------------------------------------------------------------- */

function printStatistics(s: Statistics): void {
  console.log("\n" + "=".repeat(60));
  console.log("ENRICHMENT STATISTICS");
  console.log("=".repeat(60));
  console.log(`Total models processed: ${s.total_models}`);
  console.log(`Models enriched with pricing: ${s.models_enriched}`);
  console.log(`Provider entries enriched: ${s.providers_enriched}`);
  console.log(`New capability fields added: ${s.new_capabilities_added}`);

  console.log("\nProvider data fetched:");
  Object.entries(s.providers_fetched)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([provider, count]) => {
      console.log(`  ${provider}: ${count} models`);
    });
}

/* -------------------------------------------------------------------------- */
/*  CLI PARSER                                                                */
/* -------------------------------------------------------------------------- */

const { values: opts } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "test-performance": { type: "boolean" },
    "test-limit": { type: "string" },
    "test-providers": { type: "string", multiple: true },
    "batch-size": { type: "string" },
    providers: { type: "string", multiple: true },
    "skip-providers": { type: "string", multiple: true },
  },
  strict: false,
});

const testLimit =
  opts["test-limit"] && typeof opts["test-limit"] === "string"
    ? parseInt(opts["test-limit"], 10)
    : undefined;
const batchSize =
  opts["batch-size"] && typeof opts["batch-size"] === "string"
    ? parseInt(opts["batch-size"], 10)
    : 20;

/* -------------------------------------------------------------------------- */
/*  MAIN                                                                      */
/* -------------------------------------------------------------------------- */

(async () => {
  console.log("Fetching HuggingFace models...");
  const hfModels = await fetchHuggingfaceModels();
  console.log(`Found ${hfModels.length} HuggingFace models.`);

  // Configure provider aggregator
  const config = {
    providers: opts["providers"] as string[] | undefined,
    apiKeys: {
      // Load from environment variables
      novita: process.env.NOVITA_API_KEY,
      sambanova: process.env.SAMBANOVA_API_KEY,
      groq: process.env.GROQ_API_KEY,
      featherless: process.env.FEATHERLESS_API_KEY,
      together: process.env.TOGETHER_API_KEY,
      cohere: process.env.COHERE_API_KEY,
      fireworks: process.env.FIREWORKS_API_KEY,
      nebius: process.env.NEBIUS_API_KEY,
      hyperbolic: process.env.HYPERBOLIC_API_KEY,
      cerebras: process.env.CEREBRAS_API_KEY,
      nscale: process.env.NSCALE_API_KEY,
    },
  };

  // Remove skip-providers if specified
  if (opts["skip-providers"]) {
    const skipProviders = opts["skip-providers"] as string[];
    if (!config.providers) {
      config.providers = [
        "novita",
        "sambanova",
        "groq",
        "featherless",
        "together",
        "cohere",
        "fireworks",
        "nebius",
        "hyperbolic",
        "cerebras",
        "nscale",
      ].filter((p) => !skipProviders.includes(p));
    }
  }

  const aggregator = new ProviderAggregator(config);

  console.log("\nEnriching HuggingFace models with provider data...");
  const { enriched, stats, matchedProviderData } = await enrichHuggingfaceModels(
    hfModels,
    aggregator
  );

  // Optional performance tests
  if (opts["test-performance"]) {
    const hfToken = process.env.HF_TOKEN;
    if (!hfToken) {
      console.error(
        "ERROR: HF_TOKEN environment variable not set. Skipping performance tests."
      );
    } else {
      console.log("\n" + "=".repeat(60));
      console.log("PERFORMANCE TESTING");
      console.log("=".repeat(60));
      const perfStats = await testAllProviders(
        enriched,
        hfToken,
        testLimit,
        batchSize,
        opts["test-providers"] as string[] | undefined
      );
      console.log("\nPerformance testing complete:");
      console.log(`  Total tested: ${perfStats.total_tested}`);
      console.log(`  Successful: ${perfStats.successful}`);
      console.log(`  Errors: ${perfStats.errors}`);
      console.log("\nProvider status distribution:");
      Object.entries(perfStats.status_distribution)
        .sort()
        .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    }
  }

  // Save enriched data
  const outFile = "enriched_models_enhanced.json";
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        data: enriched,
        generated_at: new Date().toISOString(),
        metadata: {
          total_models: enriched.length,
          models_enriched: stats.models_enriched,
          providers_enriched: stats.providers_enriched,
          performance_tested: !!opts["test-performance"],
          providers_fetched: stats.providers_fetched,
        },
      },
      null,
      2
    )
  );
  console.log(`\nEnriched data saved → ${outFile}`);

  // Save only matched provider data (models that exist in HF Router)
  fs.writeFileSync(
    "provider_models_raw.json",
    JSON.stringify({ data: matchedProviderData }, null, 2)
  );
  console.log(`Matched provider models saved → provider_models_raw.json (${matchedProviderData.length} entries)`);

  printStatistics(stats);
})();
