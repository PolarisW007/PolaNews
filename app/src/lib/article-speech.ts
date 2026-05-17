import type { Article } from './types';

export type SpeechLang = 'zh' | 'en' | 'ja';

type ArticleSpeechSource = Omit<Partial<Article>, 'ai_key_points' | 'ai_key_points_en' | 'ai_key_points_ja'> & {
  ai_key_points?: unknown;
  ai_key_points_en?: unknown;
  ai_key_points_ja?: unknown;
};

function cleanText(text: unknown): string {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKeyPoints(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
    } catch {
      return value
        .split(/\n+|[;；]/)
        .map(item => item.replace(/^[-*•\d.\s、]+/, ''))
        .map(cleanText)
        .filter(Boolean);
    }
  }
  return [];
}

export function getArticleSummaryForSpeech(article: ArticleSpeechSource, lang: SpeechLang): string {
  if (lang === 'en') return cleanText(article.ai_summary_en || article.summary || article.summary_zh);
  if (lang === 'ja') return cleanText(article.ai_summary_ja || article.ai_summary || article.summary_zh || article.summary);
  return cleanText(article.ai_summary || article.summary_zh || article.summary);
}

export function getArticleKeyPointsForSpeech(article: ArticleSpeechSource, lang: SpeechLang): string[] {
  if (lang === 'en') return normalizeKeyPoints(article.ai_key_points_en || article.ai_key_points);
  if (lang === 'ja') return normalizeKeyPoints(article.ai_key_points_ja || article.ai_key_points);
  return normalizeKeyPoints(article.ai_key_points);
}

export function buildArticleSpeechText(
  article: ArticleSpeechSource,
  lang: SpeechLang = 'zh',
  maxLength = 1600
): string {
  const title = cleanText(lang === 'zh' ? (article.title_zh || article.title) : article.title);
  const summary = getArticleSummaryForSpeech(article, lang).slice(0, 650);
  const keyPoints = getArticleKeyPointsForSpeech(article, lang)
    .slice(0, 5)
    .map(point => point.slice(0, 140));

  const titleLabel = lang === 'zh' ? '标题' : lang === 'ja' ? 'タイトル' : 'Title';
  const summaryLabel = lang === 'zh' ? '摘要' : lang === 'ja' ? '要約' : 'Summary';
  const keyPointLabel = lang === 'zh' ? '关键要点' : lang === 'ja' ? '重要ポイント' : 'Key points';

  const parts = [
    title ? `${titleLabel}：${title}` : '',
    summary ? `${summaryLabel}：${summary}` : '',
    keyPoints.length > 0
      ? `${keyPointLabel}：${keyPoints.map((point, index) => `${index + 1}，${point}`).join('。')}`
      : '',
  ].filter(Boolean);

  return parts.join('。').slice(0, maxLength);
}
