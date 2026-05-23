export interface DigestStory {
  title: string;
  summary: string;
  why_it_matters?: string;
  source?: string;
  category?: string;
  article_id?: string;
}

export interface StructuredDigest {
  title: string;
  lead: string;
  top_stories: DigestStory[];
  quick_reads: DigestStory[];
  keywords: string[];
}

export interface DigestQualityResult {
  ok: boolean;
  violations: string[];
}

const NOISE_PATTERNS: RegExp[] = [
  /\[Mock\]/gi,
  /(?:\(|（)?Mock(?:\)|）)?/gi,
  /\[(?:general|tech|technology|ai|finance|politics|military|society|culture|sports|health|environment|education|economy)\]/gi,
  /(?:📌\s*)?一句话摘要[:：]*/gi,
  /(?:📝\s*)?详细摘要[:：]*/gi,
  /Article URL:\s*\S+/gi,
  /Comments URL:\s*\S+/gi,
  /#\s*Comments:\s*\d+/gi,
  /Points:\s*\d+/gi,
];

const BLOCKED_TERMS = [
  '[Mock]',
  '欢迎关注',
  '公众号',
  '更多精彩内容',
  '一句话摘要',
  '详细摘要',
  'Article URL',
  'Comments URL',
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeComparable(text: string): string {
  return text
    .replace(/\[Mock\]/gi, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[“”"'‘’`*_#：:，,。.!！?？\s-]/g, '')
    .toLowerCase();
}

function stripPromoTail(text: string): string {
  const markers = [
    /#\s*欢迎关注[\s\S]*$/i,
    /欢迎关注[^。\n]*(?:公众号|微信号)[\s\S]*$/i,
    /更多精彩内容第一时间[\s\S]*$/i,
    /更多精彩内容，?第一时间[\s\S]*$/i,
  ];
  return markers.reduce((acc, pattern) => acc.replace(pattern, ''), text);
}

function truncateLongSentences(text: string, maxSentenceChars: number): string {
  const parts = text.split(/([。！？!?；;])/);
  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = (parts[i] || '').trim();
    const punct = parts[i + 1] || '';
    if (!body) continue;
    sentences.push(
      body.length > maxSentenceChars
        ? `${body.slice(0, Math.max(0, maxSentenceChars - 1)).trim()}…`
        : `${body}${punct}`,
    );
  }
  return sentences.length > 0 ? sentences.join('') : text;
}

export function cleanDigestText(
  input: string | null | undefined,
  options?: { title?: string; maxChars?: number; maxSentenceChars?: number },
): string {
  let text = String(input || '');
  if (!text) return '';

  text = text.replace(/<[^>]*>/g, ' ');
  text = stripPromoTail(text);
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  text = text
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+[.)、]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  const repeatedPrefix = text.match(/^(.{6,160}?)\s+\1\s*[:：—-]\s*(.+)$/);
  if (repeatedPrefix) {
    text = `${repeatedPrefix[1]}：${repeatedPrefix[2]}`.trim();
  }

  const title = cleanDigestText(options?.title || '', { maxChars: 240 });
  if (title) {
    const direct = new RegExp(`^${escapeRegExp(title)}\\s*[:：\\-—,，。]*\\s*`, 'i');
    text = text.replace(direct, '').trim();

    const compactTitle = normalizeComparable(title);
    const compactText = normalizeComparable(text);
    if (compactTitle && compactText.startsWith(compactTitle)) {
      const delimiter = text.search(/[:：。.!！?？—-]\s*/);
      if (delimiter > 0 && delimiter < Math.min(text.length, title.length + 24)) {
        text = text.slice(delimiter + 1).trim();
      }
    }
  }

  text = truncateLongSentences(text, options?.maxSentenceChars ?? 90)
    .replace(/\s+/g, ' ')
    .trim();

  const maxChars = options?.maxChars ?? 180;
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
  }

  return text;
}

export function cleanDigestMarkdown(input: string | null | undefined): string {
  const lines = String(input || '')
    .split('\n')
    .map((line) => cleanDigestText(line, { maxChars: 260 }))
    .filter(Boolean);
  return lines.join('\n');
}

export function cleanDigestStory(story: Partial<DigestStory>): DigestStory {
  const title = cleanDigestText(story.title || '', { maxChars: 72, maxSentenceChars: 72 });
  return {
    title,
    summary: cleanDigestText(story.summary || '', { title, maxChars: 80, maxSentenceChars: 80 }),
    why_it_matters: cleanDigestText(story.why_it_matters || '', { title, maxChars: 80, maxSentenceChars: 80 }),
    source: cleanDigestText(story.source || '', { maxChars: 32 }),
    category: cleanDigestText(story.category || '', { maxChars: 24 }),
    article_id: story.article_id || '',
  };
}

export function cleanStructuredDigest(input: Partial<StructuredDigest>): StructuredDigest {
  const top = Array.isArray(input.top_stories) ? input.top_stories : [];
  const quick = Array.isArray(input.quick_reads) ? input.quick_reads : [];
  const topStories = top.map(cleanDigestStory).filter((item) => item.title).slice(0, 3);
  const quickReads = quick.map(cleanDigestStory).filter((item) => item.title).slice(0, 5);
  return {
    title: cleanDigestText(input.title || '今日 AI 与科技简报', { maxChars: 36 }),
    lead: cleanDigestText(input.lead || '', { maxChars: 80, maxSentenceChars: 80 }),
    top_stories: topStories,
    quick_reads: quickReads,
    keywords: (Array.isArray(input.keywords) ? input.keywords : [])
      .map((kw) => cleanDigestText(String(kw), { maxChars: 12 }))
      .filter(Boolean)
      .slice(0, 6),
  };
}

export function validateStructuredDigestQuality(digest: StructuredDigest): DigestQualityResult {
  const violations: string[] = [];
  const corpus = [
    digest.title,
    digest.lead,
    ...digest.top_stories.flatMap((s) => [s.title, s.summary, s.why_it_matters || '']),
    ...digest.quick_reads.flatMap((s) => [s.title, s.summary]),
  ].join('\n');

  for (const term of BLOCKED_TERMS) {
    if (corpus.includes(term)) violations.push(`blocked term: ${term}`);
  }

  for (const story of [...digest.top_stories, ...digest.quick_reads]) {
    if ((story.summary || '').length > 80) violations.push(`summary too long: ${story.title}`);
  }

  if (digest.top_stories.length + digest.quick_reads.length > 8) {
    violations.push('too many poster items');
  }

  return { ok: violations.length === 0, violations };
}
