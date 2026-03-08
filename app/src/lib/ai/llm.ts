const API_KEY = process.env.LLM_API_KEY || '';
const API_BASE = process.env.LLM_API_BASE || 'https://api.openai.com/v1';
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

const MOCK_MODE = !API_KEY;

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
  return content.trim();
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
      ? '用中文回答'
      : lang === 'ja'
        ? '日本語で答えてください'
        : 'Respond in English';

  const systemPrompt = `You are a news summarization assistant. Respond with valid JSON only, no markdown.
Format: {"summary": string, "key_points": string[]}
- summary: 2-3 sentence summary
- key_points: 3-5 bullet points
${langHint}`;

  const contentPreview = content.slice(0, 4000);
  const prompt = `Summarize this article:\nTitle: ${title}\n\nContent:\n${contentPreview}\n\nReturn JSON:`;
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
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<{ idx: number; title_zh: string; summary_zh: string }>;
        for (const item of parsed) {
          const original = batch[item.idx];
          if (original) {
            results.push({
              id: original.id,
              title_zh: item.title_zh || original.title,
              summary_zh: item.summary_zh || original.summary,
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
      for (const b of batch) {
        results.push({ id: b.id, title_zh: b.title, summary_zh: b.summary });
      }
    }
  }

  return results;
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON found in LLM response: ' + text.slice(0, 200));
  }
  return JSON.parse(match[0]) as Record<string, unknown>;
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
