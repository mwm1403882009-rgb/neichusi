const model = require('./model');
async function read(settings, key, context, images, onProgress) {
  if (!images.length) return model.call(settings, key, 'ocr', context);
  const pages = [], uncertain = [];
  let observedIngredientCount = 0, observedStepCount = 0;
  for (let i = 0; i < images.length; i += 1) {
    if (onProgress) onProgress(i + 1, images.length);
    const result = await model.call(settings, key, 'ocr', { page: i + 1, purpose: context.purpose || '菜谱资料；仅抄录当前图片，不补写用户偏好' }, [images[i]]);
    const rawText = result.rawText || (result.pages || []).map(page => page.rawText || '').join('\n');
    if (!String(rawText || '').trim()) throw Error('第' + (i + 1) + '张图片未识别出原文，请更换清晰截图后重试');
    pages.push({ index: i + 1, rawText: String(rawText), observedIngredientCount: Number(result.observedIngredientCount)||0, observedStepCount: Number(result.observedStepCount)||0 });
    uncertain.push(...(Array.isArray(result.uncertain) ? result.uncertain : []).map(text => '图片' + (i + 1) + '：' + text));
    // 重叠截图的原文全部保留，但不要将同一组步骤/食材重复累加成缺项。
    observedIngredientCount = Math.max(observedIngredientCount, Number(result.observedIngredientCount) || 0);
    observedStepCount = Math.max(observedStepCount, Number(result.observedStepCount) || 0);
  }
  const text = [context.shareText, context.referenceText].filter(Boolean).join('\n');
  return { pages, rawText: pages.map(page => '图片' + page.index + '\n' + page.rawText).join('\n\n') + (text ? '\n\n用户粘贴原文：\n' + text : ''), uncertain, observedIngredientCount, observedStepCount };
}
module.exports = { read };
