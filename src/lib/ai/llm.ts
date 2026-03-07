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
    return '';
  }

  const messages: ChatMessage[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

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
    }),
  });

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
