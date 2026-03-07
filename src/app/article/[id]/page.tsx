'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Star,
  Bookmark,
  ExternalLink,
  Sparkles,
  Loader2,
  CheckCircle,
  Languages,
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import sanitizeHtml from 'sanitize-html';
import { api } from '@/lib/api-client';
import type { Article } from '@/lib/types';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/components/ui/Toast';

const LANGS = [
  { key: 'zh', label: '中' },
  { key: 'en', label: 'EN' },
  { key: 'ja', label: '日' },
] as const;

const importanceColors: Record<string, { bg: string; text: string }> = {
  breaking: { bg: 'rgba(255,82,82,0.15)', text: '#FF5252' },
  important: { bg: 'rgba(255,171,64,0.15)', text: '#FFAB40' },
  normal: { bg: 'rgba(0,230,118,0.12)', text: 'var(--accent)' },
  low: { bg: 'rgba(143,168,155,0.12)', text: 'var(--text-secondary)' },
};

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLang, setSummaryLang] = useState<'zh' | 'en' | 'ja'>('zh');
  const [summarizing, setSummarizing] = useState(false);
  const [starred, setStarred] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bilingualMode, setBilingualMode] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedParagraphs, setTranslatedParagraphs] = useState<{ original: string; translated: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.articles.get(id).then((data) => {
      const art = data as Article;
      setArticle(art);
      setStarred(!!art.is_starred);
      setSaved(!!art.is_saved);
      api.articles.markRead(id).catch(() => {});
    }).catch(() => { toast('加载文章失败', 'error'); }).finally(() => setLoading(false));
  }, [id, toast]);

  const currentSummary = article
    ? summaryLang === 'en'
      ? article.ai_summary_en
      : summaryLang === 'ja'
        ? article.ai_summary_ja
        : article.ai_summary
    : '';

  const handleSummarize = async () => {
    if (!article) return;
    setSummarizing(true);
    try {
      const data = await api.articles.summarize(article.id, summaryLang) as Article;
      setArticle((prev) => prev ? { ...prev, ...data } : prev);
    } catch {
      toast('生成摘要失败，请稍后重试', 'error');
    } finally {
      setSummarizing(false);
    }
  };

  const handleLangSwitch = (lang: 'zh' | 'en' | 'ja') => {
    setSummaryLang(lang);
    if (!article) return;
    const existing =
      lang === 'en' ? article.ai_summary_en
      : lang === 'ja' ? article.ai_summary_ja
      : article.ai_summary;
    if (!existing) {
      setSummarizing(true);
      api.articles.summarize(article.id, lang)
        .then((data) => {
          setArticle((prev) => prev ? { ...prev, ...(data as Article) } : prev);
        })
        .catch(() => { toast('切换语言摘要失败', 'error'); })
        .finally(() => setSummarizing(false));
    }
  };

  const handleBilingualToggle = async () => {
    if (bilingualMode) {
      setBilingualMode(false);
      return;
    }
    if (!article) return;
    if (translatedParagraphs.length > 0) {
      setBilingualMode(true);
      return;
    }
    setTranslating(true);
    try {
      const data = await api.articles.translate(article.id);
      if (data?.paragraphs) {
        setTranslatedParagraphs(data.paragraphs);
        setBilingualMode(true);
      }
    } catch { toast('翻译失败，请稍后重试', 'error'); }
    finally { setTranslating(false); }
  };

  const sanitizedContent = article
    ? sanitizeHtml(article.content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'video', 'source', 'iframe']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'width', 'height', 'loading'],
          iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
        },
      })
    : '';

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
        </div>
      </MainLayout>
    );
  }

  if (!article) {
    return (
      <MainLayout>
        <div className="flex h-96 flex-col items-center justify-center gap-4">
          <p style={{ color: 'var(--text-secondary)' }}>文章未找到</p>
          <button
            onClick={() => router.push('/')}
            className="rounded-lg px-4 py-2 text-sm"
            style={{ background: 'var(--bg-hover)', color: 'var(--accent)' }}
          >
            返回首页
          </button>
        </div>
      </MainLayout>
    );
  }

  const imp = importanceColors[article.importance] || importanceColors.normal;

  return (
    <MainLayout>
      <div className="mx-auto flex max-w-[1200px] gap-8">
        {/* 主内容区 */}
        <article className="min-w-0 flex-1" style={{ maxWidth: 800 }}>
          <button
            onClick={() => router.back()}
            className="mb-6 flex items-center gap-2 text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft size={16} />
            返回
          </button>

          <h1
            className="mb-4 text-2xl font-semibold leading-tight md:text-3xl"
            style={{ color: 'var(--text-primary)' }}
          >
            {article.title}
          </h1>

          {/* 元信息栏 */}
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {article.feed_title && (
              <span className="flex items-center gap-1.5">
                {article.feed_favicon && (
                  <img src={article.feed_favicon} alt="" className="h-4 w-4 rounded" />
                )}
                {article.feed_title}
              </span>
            )}
            <span>·</span>
            <span>{format(new Date(article.published_at), 'yyyy-MM-dd HH:mm')}</span>
            {article.categories?.topic && (
              <>
                <span>·</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs"
                  style={{ background: 'rgba(0,230,118,0.12)', color: 'var(--accent)' }}
                >
                  {article.categories.topic}
                </span>
              </>
            )}
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: imp.bg, color: imp.text }}
            >
              {article.importance}
            </span>
          </div>

          {/* 封面图 */}
          {article.cover_image && (
            <div className="mb-6 overflow-hidden rounded-xl">
              <img
                src={article.cover_image}
                alt={article.title}
                className="w-full rounded-xl object-cover"
                style={{ maxHeight: 400 }}
              />
            </div>
          )}

          {/* 正文内容 */}
          {bilingualMode && translatedParagraphs.length > 0 ? (
            <div className="space-y-6">
              {translatedParagraphs.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-4 rounded-lg p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.original}</div>
                  <div className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{p.translated}</div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="article-content prose prose-invert max-w-none"
              style={{ color: 'var(--text-primary)', lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          )}

          <style jsx global>{`
            .article-content img {
              max-width: 100%;
              height: auto;
              border-radius: 12px;
              margin: 1.5rem auto;
              display: block;
            }
            .article-content a {
              color: var(--accent);
              text-decoration: underline;
              text-underline-offset: 2px;
            }
            .article-content blockquote {
              border-left: 3px solid var(--accent);
              padding-left: 1rem;
              color: var(--text-secondary);
              margin: 1.5rem 0;
            }
            .article-content pre {
              background: var(--bg-secondary);
              border-radius: 8px;
              padding: 1rem;
              overflow-x: auto;
            }
            .article-content code {
              background: var(--bg-secondary);
              padding: 0.15rem 0.4rem;
              border-radius: 4px;
              font-size: 0.9em;
            }
            .article-content h2, .article-content h3 {
              color: var(--text-primary);
              margin-top: 2rem;
              margin-bottom: 0.75rem;
            }
            .article-content p {
              margin-bottom: 1rem;
            }
          `}</style>

          {/* 操作栏 */}
          <div
            className="mt-8 flex flex-wrap items-center gap-3 border-t pt-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('auth_token');
                  if (!token) { toast('请先登录', 'info'); return; }
                  const data = await api.articles.star(article.id);
                  setStarred(data.is_starred);
                } catch { toast('收藏操作失败', 'error'); }
              }}
              className={clsx(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors'
              )}
              style={{
                background: starred ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: starred ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Star size={16} fill={starred ? 'currentColor' : 'none'} />
              收藏
            </button>
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('auth_token');
                  if (!token) { toast('请先登录', 'info'); return; }
                  const data = await api.articles.save(article.id);
                  setSaved(data.is_saved);
                } catch { toast('保存操作失败', 'error'); }
              }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: saved ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: saved ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
              稍后阅读
            </button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <ExternalLink size={16} />
              查看原文
            </a>
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: 'rgba(0,230,118,0.12)',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              {summarizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              AI 摘要
            </button>
            <button
              onClick={handleBilingualToggle}
              disabled={translating}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: bilingualMode ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: bilingualMode ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {translating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
              中英对照
            </button>
          </div>
        </article>

        {/* 右侧面板 */}
        <aside className="hidden w-80 shrink-0 lg:block" style={{ position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={18} style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                AI 摘要
              </h3>
            </div>

            {/* 语言切换 */}
            <div
              className="mb-4 flex gap-1 rounded-lg p-1"
              style={{ background: 'var(--bg-primary)' }}
            >
              {LANGS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleLangSwitch(key)}
                  className={clsx(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors'
                  )}
                  style={{
                    background: summaryLang === key ? 'var(--bg-hover)' : 'transparent',
                    color: summaryLang === key ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {summarizing ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  正在生成摘要…
                </span>
              </div>
            ) : currentSummary ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {currentSummary}
                </p>
                {article.ai_key_points && article.ai_key_points.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      关键要点
                    </h4>
                    <ul className="space-y-1.5">
                      {article.ai_key_points.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle
                            size={14}
                            className="mt-0.5 shrink-0"
                            style={{ color: 'var(--accent)' }}
                          />
                          <span style={{ color: 'var(--text-primary)' }}>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  暂无 AI 摘要
                </p>
                <button
                  onClick={handleSummarize}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  生成 AI 摘要
                </button>
              </div>
            )}
          </div>

          {/* 关键词标签 */}
          {article.keywords && article.keywords.length > 0 && (
            <div
              className="mt-4 rounded-xl border p-5"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                关键词
              </h3>
              <div className="flex flex-wrap gap-2">
                {article.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full px-2.5 py-1 text-xs"
                    style={{
                      background: 'rgba(0,230,118,0.08)',
                      color: 'var(--accent-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </MainLayout>
  );
}
