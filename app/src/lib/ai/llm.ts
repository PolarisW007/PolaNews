import { cleanStructuredDigest, type StructuredDigest } from '../digest-clean';

const API_KEY = process.env.LLM_API_KEY || '';
const API_BASE = process.env.LLM_API_BASE || 'https://api.openai.com/v1';
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

const ALLOW_MOCK_MODE = process.env.NODE_ENV !== 'production' || process.env.LLM_ALLOW_MOCK === 'true';
const MOCK_MODE = !API_KEY && ALLOW_MOCK_MODE;

export interface ClassifyResult {
  topic: string;
  region: string;
  importance: string;
  sentiment: string;
}

export interface SummarizeResult {
  summary: string;
  key_points: string[];
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function callLLM(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  if (MOCK_MODE) {
    return generateMockResponse(prompt, systemPrompt || '');
  }

  if (!API_KEY) {
    throw new Error('LLM_API_KEY is not configured; refusing to generate mock AI content in production');
  }

  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 4000,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  return stripReasoning(content).trim();
}

export function isLLMProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /LLM_API_KEY|LLM API error|Arrearage|overdue-payment|insufficient_quota|Access denied/i.test(message);
}

/**
 * 某些推理模型（如 MiniMax-M 系列、DeepSeek-R1）会在正式输出前附加
 * `<think>...</think>` 思维链。这里统一剥除，避免污染摘要/digest 正文。
 * 兼容以下几种情况：
 *   1. 完整闭合：`<think>...</think>正文` → 保留正文
 *   2. 未闭合但有结尾标签：整体 `<think>...</think>...` 缺少起始标签 → 丢掉到 </think> 为止
 *   3. 只有起始标签无结尾（罕见）：整体回退为原文
 */
function stripReasoning(text: string): string {
  if (!text) return '';
  let s = text;
  // 情况 1 & 2：找到最后一个 </think>，取其后的内容
  const endIdx = s.lastIndexOf('</think>');
  if (endIdx !== -1) {
    s = s.slice(endIdx + '</think>'.length);
  } else {
    // 情况 3：没有结尾；如果以 <think> 开头，保守地回退（不修改），让上层看到原文
    // 但通过正则再尝试一次：去掉块级的 <think ...>（带属性）
    s = s.replace(/^<think[^>]*>/i, '');
  }
  return s;
}

export async function classifyArticle(
  title: string,
  summary: string
): Promise<ClassifyResult> {
  if (MOCK_MODE) {
    return {
      topic: 'general',
      region: 'global',
      importance: 'normal',
      sentiment: 'neutral',
    };
  }

  const systemPrompt = `You are a news classification assistant. Respond with valid JSON only, no markdown.
Format: {"topic": string, "region": string, "importance": string, "sentiment": string}
- topic: politics|economy|tech|military|society|culture|sports|health|environment|education|general
- region: china|usa|europe|middle_east|asia_pacific|africa|latin_america|global
- importance: breaking|important|normal|low
- sentiment: positive|neutral|negative`;

  const prompt = `Classify this article:\nTitle: ${title}\nSummary: ${summary}\n\nReturn JSON:`;
  const text = await callLLM(prompt, systemPrompt);
  const json = extractJson(text);
  return json as unknown as ClassifyResult;
}

export async function summarizeArticle(
  title: string,
  content: string,
  lang: string
): Promise<SummarizeResult> {
  if (MOCK_MODE) {
    const short =
      content.length > 200 ? content.slice(0, 200) + '...' : content;
    return {
      summary: `[Mock] ${title}: ${short}`,
      key_points: ['要点1', '要点2', '要点3'],
    };
  }

  const langHint =
    lang === 'zh'
      ? '必须用中文（简体中文）输出所有内容，summary 和 key_points 都要用中文。'
      : lang === 'ja'
        ? '必ず日本語で出力してください。summary も key_points も日本語で書いてください。'
        : 'Respond in English.';

  const systemPrompt = `You are a news summarization assistant. IMPORTANT: ${langHint}
Respond with valid JSON only, no markdown.
Format: {"summary": string, "key_points": string[]}
- summary: 2-3 sentence summary
- key_points: 3-5 bullet points`;

  const contentPreview = content.slice(0, 4000);
  const prompt = lang === 'zh'
    ? `请用中文总结以下文章：\n标题：${title}\n\n内容：\n${contentPreview}\n\n请返回JSON格式，summary和key_points都必须是中文：`
    : `Summarize this article:\nTitle: ${title}\n\nContent:\n${contentPreview}\n\nReturn JSON:`;
  const text = await callLLM(prompt, systemPrompt);
  const json = extractJson(text);
  return json as unknown as SummarizeResult;
}

export async function generateDigestContent(
  articles: Array<{
    title: string;
    summary: string;
    category: string;
    importance: string;
  }>,
  lang: string
): Promise<string> {
  if (MOCK_MODE) {
    const lines = articles.map(
      (a, i) => `${i + 1}. **[${a.category}]** ${a.title}\n   ${a.summary}`
    );
    return `# Daily Digest (Mock)\n\n${lines.join('\n\n')}`;
  }

  const langHint =
    lang === 'zh'
      ? '用中文撰写'
      : lang === 'ja'
        ? '日本語で作成してください'
        : 'Write in English';

  const systemPrompt = `You are a daily news digest writer. Generate a well-structured Markdown document.
${langHint}
Include: headline section (top 3), category summaries, and key statistics.
Use ## for sections, ### for sub-sections, and bullet points for items.`;

  const articleList = articles
    .map(
      (a) =>
        `- [${a.category}] ${a.importance}: ${a.title}\n  ${a.summary}`
    )
    .join('\n');

  const prompt = `Create a Daily Digest from these articles:\n\n${articleList}\n\nReturn full Markdown:`;
  return callLLM(prompt, systemPrompt);
}

export async function generateStructuredDigestContent(
  articles: Array<{
    title: string;
    summary: string;
    category: string;
    importance: string;
    source?: string;
  }>,
  lang: string
): Promise<StructuredDigest> {
  const fallback = buildFallbackStructuredDigest(articles);
  if (MOCK_MODE || articles.length === 0) return fallback;

  const langHint =
    lang === 'zh'
      ? '所有字段必须使用简体中文。'
      : lang === 'ja'
        ? 'すべてのフィールドを日本語で書いてください。'
        : 'Write all fields in English.';

  const systemPrompt = `你是 Daily Digest 主编，负责把新闻列表整理成适合海报分享的精选阅读 JSON。
${langHint}
只返回合法 JSON，不要 markdown，不要解释。
JSON 格式：
{
  "title": "今日 AI 与科技简报",
  "lead": "一句话说明今天最重要的变化",
  "top_stories": [
    {"title": "标题", "summary": "一句话事实摘要", "why_it_matters": "一句话价值判断", "source": "来源", "category": "分类"}
  ],
  "quick_reads": [
    {"title": "标题", "summary": "30-50字快速浏览", "source": "来源", "category": "分类"}
  ],
  "keywords": ["关键词"]
}
约束：
- top_stories 只选最重要 3 条，每条 summary 和 why_it_matters 都不超过 80 字
- quick_reads 选 4-5 条，每条 summary 30-50 字
- 不要出现 [Mock]、[general]、欢迎关注、公众号、更多精彩内容、Article URL、Comments URL
- 不要照搬推广尾巴，不要重复标题`;

  const articleList = articles.slice(0, 20).map((a, i) => (
    `${i + 1}. [${a.category}] ${a.importance} | ${a.source || 'Unknown'} | ${a.title}\n${a.summary}`
  )).join('\n\n');

  try {
    const text = await callLLM(`请生成结构化 Digest：\n\n${articleList}`, systemPrompt);
    const parsed = extractJson(text) as unknown as Partial<StructuredDigest>;
    const structured = cleanStructuredDigest(parsed);
    if (structured.top_stories.length > 0 || structured.quick_reads.length > 0) {
      return structured;
    }
  } catch (e) {
    console.error('[Digest] Structured digest generation failed:', e);
    if (isLLMProviderError(e)) throw e;
  }

  return fallback;
}

function buildFallbackStructuredDigest(
  articles: Array<{
    title: string;
    summary: string;
    category: string;
    importance: string;
    source?: string;
  }>
): StructuredDigest {
  const top = articles.slice(0, 3).map((a) => ({
    title: a.title,
    summary: a.summary,
    why_it_matters: a.importance === 'breaking' || a.importance === 'important'
      ? '这条动态可能影响接下来的行业判断和资源流向。'
      : '这是今天值得快速掌握的关键信息。',
    source: a.source || '',
    category: a.category,
  }));
  const quick = articles.slice(3, 8).map((a) => ({
    title: a.title,
    summary: a.summary,
    source: a.source || '',
    category: a.category,
  }));

  return cleanStructuredDigest({
    title: '今日 AI 与科技简报',
    lead: top[0]?.summary || '今天的重点变化集中在 AI、科技产品和产业动态。',
    top_stories: top,
    quick_reads: quick,
    keywords: Array.from(new Set(articles.map((a) => a.category).filter(Boolean))).slice(0, 6),
  });
}

export interface TranslateBatchItem {
  id: string;
  title: string;
  summary: string;
}

export interface TranslateBatchResult {
  id: string;
  title_zh: string;
  summary_zh: string;
}

export async function translateArticleBatch(
  items: TranslateBatchItem[]
): Promise<TranslateBatchResult[]> {
  if (MOCK_MODE || items.length === 0) {
    return items.map(item => ({
      id: item.id,
      title_zh: item.title,
      summary_zh: item.summary,
    }));
  }

  const BATCH_SIZE = 10;
  const results: TranslateBatchResult[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const entries = batch.map((item, idx) =>
      `[${idx}] Title: ${item.title}\nSummary: ${(item.summary || '').slice(0, 300)}`
    ).join('\n\n');

    const systemPrompt = `你是一个专业的新闻翻译助手。将以下英文新闻标题和摘要翻译成中文。
要求：
- 翻译要准确、流畅、符合中文新闻风格
- 专业术语和人名保留英文或使用通用译名
- 只返回 JSON 数组，不要添加其他文字
返回格式: [{"idx": 0, "title_zh": "中文标题", "summary_zh": "中文摘要"}, ...]`;

    const prompt = `请翻译以下 ${batch.length} 条新闻：\n\n${entries}`;

    try {
      const text = await callLLM(prompt, systemPrompt);
      const parsed = extractJsonArray(text) as Array<{ idx?: number; title_zh?: string; summary_zh?: string }>;
      if (parsed && Array.isArray(parsed)) {
        for (let k = 0; k < parsed.length; k++) {
          const item = parsed[k] || {};
          const idx = typeof item.idx === 'number' ? item.idx : k;
          const original = batch[idx];
          if (original) {
            results.push({
              id: original.id,
              title_zh: (item.title_zh || '').trim() || original.title,
              summary_zh: (item.summary_zh || '').trim() || original.summary,
            });
          }
        }
      }
      const translatedIds = new Set(results.map(r => r.id));
      for (const b of batch) {
        if (!translatedIds.has(b.id)) {
          results.push({ id: b.id, title_zh: b.title, summary_zh: b.summary });
        }
      }
    } catch (e) {
      console.error('Batch translate error:', e);
      if (isLLMProviderError(e)) {
        throw e;
      }
      for (const b of batch) {
        results.push({ id: b.id, title_zh: b.title, summary_zh: b.summary });
      }
    }
  }

  return results;
}

export async function generateImagePrompt(title: string, content: string): Promise<string> {
  if (MOCK_MODE) return 'A modern digital illustration of global news headlines with tech elements';

  const systemPrompt = `你是一位专业的AI绘图提示词工程师。根据新闻内容生成一段英文绘图提示词(image prompt)，用于AI文生图。
要求：
- 输出纯英文，一段话，80-150词
- 描述一个能代表新闻核心主题的视觉场景
- 风格：现代插画/数字艺术风格，色彩鲜明
- 不要出现文字、水印、人脸等敏感元素
- 只返回提示词本身，不要有任何前缀`;

  const prompt = `新闻标题：${title}\n内容摘要：${content.slice(0, 800)}\n\n请生成英文绘图提示词：`;
  return callLLM(prompt, systemPrompt);
}

export async function generateImage(imagePrompt: string): Promise<string | null> {
  if (MOCK_MODE || !API_KEY) {
    console.log('[ImageGen] Skipped: MOCK_MODE or no API_KEY');
    return null;
  }

  const dashscopeKey = process.env.DASHSCOPE_API_KEY || API_KEY;
  console.log('[ImageGen] Starting image generation, prompt length:', imagePrompt.length);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dashscopeKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-image-2.0-pro',
        input: {
          messages: [{
            role: 'user',
            content: [{ text: imagePrompt }],
          }],
        },
        parameters: {
          size: '1024*1024',
          watermark: false,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      console.error('[ImageGen] API error:', res.status, errText);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    console.log('[ImageGen] API response keys:', Object.keys(data));

    const output = data.output as { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> } | undefined;
    const imageUrl = output?.choices?.[0]?.message?.content?.find(
      (c: Record<string, unknown>) => c.image
    )?.image;

    if (imageUrl) {
      console.log('[ImageGen] Got image URL:', imageUrl.slice(0, 80) + '...');
    } else {
      console.error('[ImageGen] No image URL in response:', JSON.stringify(data).slice(0, 500));
    }
    return imageUrl || null;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('[ImageGen] Error:', e);
    return null;
  }
}

export async function downloadAndSaveImage(imageUrl: string, filename: string): Promise<string | null> {
  try {
    console.log('[ImageSave] Downloading:', imageUrl.slice(0, 80));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error('[ImageSave] Download failed:', res.status);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    console.log('[ImageSave] Downloaded', buffer.length, 'bytes');

    const fs = await import('fs');
    const path = await import('path');

    const persistentDir = process.env.SHARE_IMAGES_DIR
      || path.resolve(process.cwd(), '..', 'share-images');

    if (!fs.existsSync(persistentDir)) fs.mkdirSync(persistentDir, { recursive: true });
    const filePath = path.join(persistentDir, filename);
    fs.writeFileSync(filePath, buffer);
    console.log('[ImageSave] Saved to:', filePath);

    const bp = process.env.NEXT_PUBLIC_BASE_PATH || '';
    return `${bp}/share-images/${filename}`;
  } catch (e) {
    console.error('[ImageSave] Error:', e);
    return null;
  }
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON found in LLM response: ' + text.slice(0, 200));
  }
  return JSON.parse(match[0]) as Record<string, unknown>;
}

/**
 * 宽松地从 LLM 输出里提取 JSON 数组：
 * - 去掉 ```json / ``` 围栏
 * - 取第一个 '[' 到最后一个 ']' 之间的内容
 * - 常见的单引号、尾逗号、未闭合最后一项做兜底修复
 * 解析失败时返回空数组（上游会回退到原文）。
 */
export function extractJsonArray(text: string): unknown[] {
  if (!text) return [];
  let t = text.trim();
  // 去 markdown 围栏
  t = t.replace(/^```(?:json|JSON)?\s*/m, '').replace(/```\s*$/m, '');
  const first = t.indexOf('[');
  const last = t.lastIndexOf(']');
  if (first === -1 || last === -1 || last <= first) return [];
  const body = t.slice(first, last + 1);
  try {
    return JSON.parse(body) as unknown[];
  } catch { /* fall through */ }
  // 兜底：去尾逗号、把智能引号换成普通引号
  const repaired = body
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(repaired) as unknown[];
  } catch { /* give up */ }
  // 最后兜底：尝试逐对象解析
  const items: unknown[] = [];
  const objRegex = /\{[^{}]*\}/g;
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(body)) !== null) {
    try { items.push(JSON.parse(m[0])); } catch { /* skip */ }
  }
  return items;
}

function generateMockResponse(prompt: string, systemPrompt: string): string {
  if (systemPrompt.includes('新闻主播') || systemPrompt.includes('播报')) {
    const lines = prompt.split('\n').filter(l => l.trim().length > 10).slice(0, 8);
    return `[段落1] 各位听众朋友大家好，欢迎收听今日全球资讯速览。以下是今天的重要新闻。\n\n[段落2] ${lines[0] || '今天全球各地发生了多件值得关注的事件。'}\n\n[段落3] ${lines[1] || '科技领域也有新的进展。'}\n\n[段落4] ${lines[2] || '财经方面，市场表现值得关注。'}\n\n[段落5] 以上就是今天的全球资讯速览，感谢您的收听，祝您阅读愉快。`;
  }

  if (systemPrompt.includes('小红书')) {
    const contentPreview = prompt.slice(0, 200);
    return `🔥 今日全球资讯速递！不看你就OUT了！\n\n📌 要点速览：\n${contentPreview}\n\n💡 每天5分钟，掌握全球大事！\n\n#全球资讯 #科技前沿 #每日必读 #AI时代 #新闻速递\n\n你对今天的新闻怎么看？欢迎评论区讨论～`;
  }

  if (systemPrompt.includes('朋友圈')) {
    const contentPreview = prompt.slice(0, 200);
    return `📰 今日全球要闻速览\n\n${contentPreview}\n\n—— 来自「一念三千」AI 资讯聚合`;
  }

  if (systemPrompt.includes('translator') || systemPrompt.includes('翻译')) {
    const paragraphMatch = prompt.match(/\[\d+\]\s*(.+)/g);
    if (paragraphMatch) {
      const items = paragraphMatch.map((p) => {
        const text = p.replace(/^\[\d+\]\s*/, '').trim();
        return { original: text, translated: `[翻译] ${text}` };
      });
      return JSON.stringify(items);
    }
    return '[]';
  }

  if (systemPrompt.includes('classification') || systemPrompt.includes('Classify')) {
    return '{"topic": "general", "region": "global", "importance": "normal", "sentiment": "neutral"}';
  }

  if (systemPrompt.includes('趋势') || systemPrompt.includes('关键词')) {
    const MOCK_STOPS = new Set([
      'the','a','an','is','are','was','were','be','been','have','has','had',
      'do','does','did','will','would','could','should','can','may','might',
      'to','of','in','for','on','with','at','by','from','as','into','and',
      'or','but','not','no','nor','so','if','than','too','very','just','also',
      'it','its','this','that','these','those','what','which','who','whom',
      'his','her','their','our','your','my','we','they','he','she','me','him',
      'us','them','you','new','says','said','get','got','like','even','now',
      'about','how','more','most','some','any','all','both','each','few',
      'other','such','only','own','same','up','out','off','over','under',
    ]);
    const words = prompt.split(/[\s\n,.:;!?()\[\]"']+/).filter(w => w.length >= 3 && w.length <= 20 && !MOCK_STOPS.has(w.toLowerCase()));
    const wordCount: Record<string, number> = {};
    for (const w of words) {
      const clean = w.replace(/[^\w\u4e00-\u9fff]/g, '');
      if (clean.length >= 2) wordCount[clean] = (wordCount[clean] || 0) + 1;
    }
    const sorted = Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return JSON.stringify(sorted.map(([keyword, count]) => ({ keyword, count, trend: 'stable' })));
  }

  if (systemPrompt.includes('digest') || systemPrompt.includes('Digest')) {
    const items = prompt.split('\n').filter(l => l.startsWith('- ')).slice(0, 10);
    const itemsText = items.length > 0 ? items.map((it, i) => `${i + 1}. ${it.replace(/^- /, '')}`).join('\n') : '暂无新闻数据';
    return `# 📰 每日资讯速递\n\n## 🔥 今日头条\n\n${itemsText}\n\n## 📊 今日数据\n\n- 收录新闻若干条\n- 覆盖多个信息源`;
  }

  return `[Mock] ${prompt.slice(0, 300)}`;
}
