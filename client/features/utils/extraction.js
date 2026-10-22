function clean(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[\s，,。．、:：;；()（）]/g, '');
}

function quantityTokens(text) {
  const pattern = /(?:\d+(?:\.\d+)?|半|一|二|三|四|五|六|七|八|九|十|两)\s*(?:千克|公斤|kg|克|g|毫升|ml|勺|个|只|片|块|根|把|大把|小把|分钟|min|小时|斤|两|瓣|碗|杯|次)/gi;
  return Array.from(new Set((String(text || '').match(pattern) || []).map(item => clean(item))));
}

function outputText(draft) {
  return [draft.name, ...(draft.ingredients || []), ...(draft.steps || []), draft.notes].join('\n');
}

function observedLineCount(rawText, kind) {
  const seen = new Set();
  const lines = String(rawText || '').split('\n').map(line => line.trim()).filter(line => { const key=clean(line); if(!key||seen.has(key))return false;seen.add(key);return true; });
  if (kind === 'steps') return lines.filter(line => /^(?:步骤\s*)?(?:[1-9]\d*[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩])/.test(line)).length;
  // Count measured ingredient lines, not image headings (图片1), URLs or cooking steps.
  return lines.filter(line => !/^(?:图片\s*\d+|https?:\/\/|用户粘贴|(?:步骤\s*)?[1-9]\d*[.、)）]|[①②③④⑤⑥⑦⑧⑨⑩])/.test(line) && /(?:\d+(?:\.\d+)?|半|一|二|两|三|四|五|六|七|八|九|十)\s*(?:千克|公斤|kg|克|g|毫升|ml|勺|个|只|片|块|根|把|瓣|碗|杯|份|条)/i.test(line)).length;
}

function assessRecipe(ocr, draft) {
  const rawText = String((ocr && ocr.rawText) || '');
  const target = clean(outputText(draft || {}));
  const tokens = quantityTokens(rawText);
  const missingQuantities = tokens.filter(token => !target.includes(token));
  const expectedSteps = Math.max(Number(ocr && ocr.observedStepCount) || 0, observedLineCount(rawText, 'steps'));
  const expectedIngredients = Math.max(Number(ocr && ocr.observedIngredientCount) || 0, observedLineCount(rawText, 'ingredients'));
  const actualSteps = Array.isArray(draft && draft.steps) ? draft.steps.length : 0;
  const actualIngredients = Array.isArray(draft && draft.ingredients) ? draft.ingredients.length : 0;
  const reasons = [];
  let score = 100;
  if (!draft || !String(draft.name || '').trim()) { score -= 25; reasons.push('缺少菜名'); }
  if (!actualIngredients) { score -= 30; reasons.push('缺少食材'); }
  if (!actualSteps) { score -= 30; reasons.push('缺少步骤'); }
  if (tokens.length) {
    const lostRatio = missingQuantities.length / tokens.length;
    score -= Math.round(lostRatio * 45);
    if (missingQuantities.length) reasons.push(`遗漏用量：${missingQuantities.join('、')}`);
  }
  if (expectedSteps > actualSteps) {
    score -= Math.min(30, Math.round((expectedSteps - actualSteps) / expectedSteps * 30));
    reasons.push(`原资料约有${expectedSteps}步，草稿只有${actualSteps}步`);
  }
  if (expectedIngredients > actualIngredients) {
    score -= Math.min(25, Math.round((expectedIngredients - actualIngredients) / expectedIngredients * 25));
    reasons.push(`原资料约有${expectedIngredients}项食材/用量，草稿只有${actualIngredients}项`);
  }
  const uncertain = Array.from(new Set([...(ocr && ocr.uncertain || []), ...(draft && draft.uncertain || [])].filter(Boolean)));
  if (uncertain.length) score -= Math.min(10, uncertain.length * 2);
  score = Math.max(0, Math.min(100, score));
  const severeQuantityLoss = tokens.length >= 3 && missingQuantities.length / tokens.length > 0.3;
  const severeStepLoss = expectedSteps >= 2 && actualSteps < expectedSteps;
  const severeIngredientLoss = expectedIngredients >= 3 && actualIngredients < Math.ceil(expectedIngredients * 0.7);
  const canSave = score >= 75 && actualIngredients > 0 && actualSteps > 0 && !severeQuantityLoss && !severeStepLoss && !severeIngredientLoss && Boolean(draft && String(draft.name || '').trim());
  return {
    score,
    canSave,
    label: score >= 90 ? '完整' : score >= 75 ? '基本完整' : '需要补提',
    reasons,
    missingQuantities,
    expectedSteps,
    expectedIngredients,
    uncertain
  };
}

module.exports = { assessRecipe, quantityTokens };
