function numeric(value) { return value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null; }
function first(values) { for (const value of values) { const n = numeric(value); if (n != null) return n; } return null; }
function rateFor(settings, model) { return (settings.modelPrices || {})[model] || (settings.model === model ? settings : {}); }
function calculate(body, settings, model, task, extra = {}) {
  const usage = body.usage || {};
  const input = first([usage.prompt_tokens, usage.input_tokens]) || 0;
  const output = first([usage.completion_tokens, usage.output_tokens]) || 0;
  const details = usage.prompt_tokens_details || usage.input_tokens_details || {};
  const rawHit = first([usage.prompt_cache_hit_tokens, details.cached_tokens, usage.cached_tokens, usage.cache_read_input_tokens]);
  const rawMiss = first([usage.prompt_cache_miss_tokens]);
  const write = first([details.cache_creation_tokens, usage.cache_creation_input_tokens]) || 0;
  const hit = Math.min(input, rawHit == null ? rawMiss == null ? 0 : Math.max(0, input - rawMiss) : rawHit);
  const miss = rawMiss == null ? Math.max(0, input - hit - write) : Math.min(input, rawMiss);
  const cacheReported = rawHit != null || rawMiss != null;
  const rate = rateFor(settings, model);
  let cost = 0, ready = true;
  const part = (tokens, price) => { if (!tokens) return; const amount = numeric(price); if (amount == null) ready = false; else cost += tokens * amount / 1000000; };
  const isAsr = task === 'asr';
  const secondsFromApi = first([usage.seconds, usage.audio_seconds]);
  const seconds = secondsFromApi == null ? numeric(extra.seconds) : secondsFromApi;
  if (isAsr) {
    const hourly = numeric(extra.pricePerHour);
    ready = seconds != null && hourly != null;
    cost = ready ? seconds * hourly / 3600 : 0;
  } else {
    part(hit, rate.cacheHitPricePerMillion);
    part(miss, rate.inputPricePerMillion);
    part(write, rate.cacheWritePricePerMillion == null || rate.cacheWritePricePerMillion === '' ? rate.inputPricePerMillion : rate.cacheWritePricePerMillion);
    part(output, rate.outputPricePerMillion);
  }
  const baseCost = cost, baseReady = ready;
  const search = usage.web_search_usage;
  const searchCalls = search ? first([search.tool_usage, search.search_count]) : null;
  const searchRate = numeric(settings.searchPricePerThousand);
  let searchCost = null;
  if (searchCalls != null) { if (searchRate != null) searchCost = searchCalls * searchRate / 1000; else if (searchCalls === 0) searchCost = 0; }
  const searchMissing = extra.searchEnabled && searchCalls == null;
  if ((searchCalls > 0 && searchCost == null) || searchMissing) ready = false;
  if (searchCost != null) cost += searchCost;
  if (!body.usage && !isAsr) ready = false;
  return {
    billingVersion: 2, billingType: isAsr ? 'audio' : 'tokens', model, task,
    inputTokens: input, outputTokens: output, totalTokens: first([usage.total_tokens]) || input + output,
    cacheHitTokens: hit, cacheMissTokens: miss, cacheWriteTokens: write, cacheReported,
    audioSeconds: isAsr ? seconds : 0, searchCalls, searchCost, searchReported: !extra.searchEnabled || !searchMissing,
    tokenCost: !isAsr && baseReady && body.usage ? baseCost : null, audioCost: isAsr && baseReady ? baseCost : null,
    pricingSnapshot: { ...rate, audioPricePerHour: extra.pricePerHour == null ? null : extra.pricePerHour, searchPricePerThousand: settings.searchPricePerThousand == null ? null : settings.searchPricePerThousand },
    estimatedCost: ready ? cost : null, knownCost: cost, pricingConfigured: ready,
    costEstimated: isAsr ? secondsFromApi == null : !cacheReported,
    usageReported: Boolean(body.usage), rawUsage: body.usage || null
  };
}
const officialMimo = {
  'mimo-v2.6-flash': { cacheHitPricePerMillion: 0.02, inputPricePerMillion: 1, outputPricePerMillion: 2, cacheWritePricePerMillion: 0 },
  'mimo-v2.6-pro': { cacheHitPricePerMillion: 0.025, inputPricePerMillion: 3, outputPricePerMillion: 6, cacheWritePricePerMillion: 0 },
  'mimo-v2.6-pro-ultraspeed': { cacheHitPricePerMillion: 0.25, inputPricePerMillion: 30, outputPricePerMillion: 60, cacheWritePricePerMillion: 0 }
};
module.exports = { numeric, calculate, rateFor, officialMimo };
