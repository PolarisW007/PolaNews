'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
  Volume2,
  VolumeX,
  Share2,
  ChevronDown,
  ChevronUp,
  FileText,
  BookOpen,
  X,
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

/** 检测内容是否为 HN/Reddit 类纯元数据型正文 */
function isMetadataOnlyContent(content: string): boolean {
  const clean = content.replace(/<[^>]*>/g, '').trim();
  if (clean.length > 300) return false;
  return (
    (clean.includes('Article URL:') || clean.includes('Comments URL:') || clean.includes('Points:')) &&
    clean.split('\n').filter((l) => l.trim()).length <= 6
  );
}

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioRef, setTtsAudioRef] = useState<HTMLAudioElement | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [showSource, setShowSource] = useState(false);
  // TTS 预加载
  const [preloadedAudioUrl, setPreloadedAudioUrl] = useState<string | null>(null);
  const [ttsPreloading, setTtsPreloading] = useState(false);
  // 全文内嵌阅读器
  const [showFulltext, setShowFulltext] = useState(false);
  const [fulltextContent, setFulltextContent] = useState<string>('');
  const [fulltextLoading, setFulltextLoading] = useState(false);
  const [fulltextTranslated, setFulltextTranslated] = useState<{ original: string; translated: string }[]>([]);
  const [fulltextBilingual, setFulltextBilingual] = useState(false);
  const [fulltextTranslating, setFulltextTranslating] = useState(false);

  const ttsPreloadRef = useRef(false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  // 加载文章
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.articles.get(id).then((data) => {
      const art = data as Article;
      setArticle(art);
      setStarred(!!art.is_starred);
      setSaved(!!art.is_saved);
      api.articles.markRead(id).catch(() => {});

      if (!art.ai_summary) {
        setSummarizing(true);
        api.articles.summarize(art.id, 'zh')
          .then((d) => {
            setArticle((prev) => prev ? { ...prev, ...(d as Article) } : prev);
          })
          .catch(() => {})
          .finally(() => setSummarizing(false));
      }

      if (art.categories?.topic) {
        api.articles.list({ category: art.categories.topic, limit: 6 })
          .then((res) => {
            const list = ((res as { articles?: Article[] }).articles || [])
              .filter((a) => a.id !== art.id)
              .slice(0, 5);
            setRelatedArticles(list);
          })
          .catch(() => {});
      }
    }).catch(() => { toast('加载文章失败', 'error'); }).finally(() => setLoading(false));
  }, [id, toast]);

  // 清理
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      if (ttsAudioRef) { ttsAudioRef.pause(); ttsAudioRef.removeAttribute('src'); }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TTS 预加载 —— ai_summary 可用时立即后台合成
  const preloadTTS = useCallback(async (text: string) => {
    if (ttsPreloadRef.current || preloadedAudioUrl) return;
    ttsPreloadRef.current = true;
    setTtsPreloading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${basePath}/api/tts/synthesize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: text.slice(0, 800), voice: 'longwan_v3' }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setPreloadedAudioUrl(data.data.url);
      }
    } catch {
      // 预加载失败不报错
    } finally {
      setTtsPreloading(false);
    }
  }, [basePath, preloadedAudioUrl]);

  useEffect(() => {
    if (!article?.ai_summary || ttsPreloadRef.current) return;
    preloadTTS(article.ai_summary);
  }, [article?.ai_summary, preloadTTS]);

  const handleTTS = async () => {
    if (isSpeaking) {
      if (ttsAudioRef) { ttsAudioRef.pause(); ttsAudioRef.removeAttribute('src'); setTtsAudioRef(null); }
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      return;
    }

    const zhSummary = article?.ai_summary || '';
    const text = zhSummary || article?.summary || article?.content?.replace(/<[^>]*>/g, '') || '';
    if (!text.trim()) { toast('没有可朗读的内容', 'info'); return; }

    // 优先使用预加载的音频
    if (preloadedAudioUrl) {
      const audio = new Audio(preloadedAudioUrl);
      audio.onended = () => { setIsSpeaking(false); setTtsAudioRef(null); };
      audio.onerror = () => { setIsSpeaking(false); setTtsAudioRef(null); toast('音频播放失败', 'error'); };
      setTtsAudioRef(audio);
      setIsSpeaking(true);
      await audio.play();
      return;
    }

    // 预加载中，等待或实时合成
    if (ttsPreloading) {
      toast('正在准备音频，请稍候…', 'info');
      return;
    }

    setTtsLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${basePath}/api/tts/synthesize`, {
        method: 'POST', headers,
        body: JSON.stringify({ text: text.slice(0, 800), voice: 'longwan_v3' }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        const audio = new Audio(data.data.url);
        audio.onended = () => { setIsSpeaking(false); setTtsAudioRef(null); };
        audio.onerror = () => { setIsSpeaking(false); setTtsAudioRef(null); toast('音频播放失败', 'error'); };
        setTtsAudioRef(audio);
        await audio.play();
        setIsSpeaking(true);
        setTtsLoading(false);
        return;
      }
    } catch { /* fall through to Web Speech API */ }
    setTtsLoading(false);

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
      utterance.lang = 'zh-CN'; utterance.rate = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    } else {
      toast('语音合成服务暂不可用', 'error');
    }
  };

  const handleShare = async () => {
    if (!article) return;
    const shareData = {
      title: article.title,
      text: article.ai_summary || article.summary || '',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast('链接已复制到剪贴板', 'success');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast('链接已复制到剪贴板', 'success');
      } catch {
        toast('分享失败', 'error');
      }
    }
  };

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
      // 重置预加载（摘要更新了，需重新预加载 TTS）
      if (summaryLang === 'zh') {
        setPreloadedAudioUrl(null);
        ttsPreloadRef.current = false;
      }
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

  // 全文阅读器
  const handleOpenFulltext = async () => {
    if (!article) return;
    if (showFulltext) { setShowFulltext(false); return; }
    setShowFulltext(true);

    if (fulltextContent) return; // 已加载

    setFulltextLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${basePath}/api/articles/${article.id}/fulltext`, { headers });
      const data = await res.json();
      if (data.success && data.data?.content) {
        setFulltextContent(data.data.content);
      } else {
        // 降级：使用 article.content
        setFulltextContent(article.content || '');
      }
    } catch {
      setFulltextContent(article.content || '');
    } finally {
      setFulltextLoading(false);
    }
  };

  const handleFulltextBilingual = async () => {
    if (fulltextBilingual) { setFulltextBilingual(false); return; }
    if (fulltextTranslated.length > 0) { setFulltextBilingual(true); return; }
    if (!article) return;
    setFulltextTranslating(true);
    try {
      const data = await api.articles.translate(article.id);
      if (data?.paragraphs) {
        setFulltextTranslated(data.paragraphs);
        setFulltextBilingual(true);
      }
    } catch { toast('翻译失败', 'error'); }
    finally { setFulltextTranslating(false); }
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

  const sanitizedFulltext = fulltextContent
    ? sanitizeHtml(fulltextContent, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'width', 'height', 'loading'],
        },
      })
    : '';

  const hasSourceInfo = article && (article.url || (article.content?.includes('Comments URL') || article.content?.includes('Points:')));
  const isMetaContent = article ? isMetadataOnlyContent(article.content || '') : false;

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
          {article.title_zh && article.title_zh !== article.title && (
            <p className="mb-4 text-base" style={{ color: 'var(--text-secondary)' }}>
              {article.title_zh}
            </p>
          )}

          {/* 元信息栏 */}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
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

          {/* 文章源信息 - 默认收起 */}
          {hasSourceInfo && (
            <div className="mb-6">
              <button
                onClick={() => setShowSource(!showSource)}
                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
              >
                <FileText size={12} />
                原文来源信息
                {showSource ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showSource && (
                <div
                  className="mt-2 rounded-lg p-3 text-xs leading-relaxed"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  {article.url && (
                    <div className="mb-1">
                      <span className="font-medium">文章网址：</span>
                      <a href={article.url} target="_blank" rel="noopener noreferrer" className="break-all" style={{ color: 'var(--accent)' }}>{article.url}</a>
                    </div>
                  )}
                  {article.content?.match(/Comments URL:\s*(https?:\/\/\S+)/) && (
                    <div className="mb-1">
                      <span className="font-medium">评论网址：</span>
                      <a href={article.content.match(/Comments URL:\s*(https?:\/\/\S+)/)?.[1] || ''} target="_blank" rel="noopener noreferrer" className="break-all" style={{ color: 'var(--accent)' }}>
                        {article.content.match(/Comments URL:\s*(https?:\/\/\S+)/)?.[1] || ''}
                      </a>
                    </div>
                  )}
                  {article.content?.match(/Points:\s*(\d+)/) && (
                    <div className="mb-1"><span className="font-medium">得票数：</span>{article.content.match(/Points:\s*(\d+)/)?.[1]}</div>
                  )}
                  {article.content?.match(/# Comments:\s*(\d+)/) && (
                    <div><span className="font-medium">评论数：</span>{article.content.match(/# Comments:\s*(\d+)/)?.[1]}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 操作栏 */}
          <div
            className="mb-8 flex flex-wrap items-center gap-2.5"
            style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}
          >
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
              onClick={handleTTS}
              disabled={ttsLoading}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: isSpeaking ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: isSpeaking ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
              title={isSpeaking ? '停止朗读' : (ttsPreloading ? '音频准备中…' : (preloadedAudioUrl ? '点击即可播放' : '朗读中文摘要'))}
            >
              {ttsLoading ? <Loader2 size={16} className="animate-spin" /> : isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              {ttsLoading ? '合成中...' : isSpeaking ? '停止朗读' : ttsPreloading ? '准备中…' : '朗读摘要'}
              {preloadedAudioUrl && !isSpeaking && !ttsLoading && (
                <span className="ml-1 h-2 w-2 rounded-full bg-green-400" title="音频已就绪" />
              )}
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
            <button
              onClick={handleOpenFulltext}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: showFulltext ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: showFulltext ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <BookOpen size={16} />
              全文阅读
            </button>
            <div className="mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('auth_token');
                  if (!token) { toast('请先登录', 'info'); return; }
                  const data = await api.articles.star(article.id);
                  setStarred(data.is_starred);
                } catch { toast('收藏操作失败', 'error'); }
              }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
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
            <button
              onClick={handleShare}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Share2 size={16} />
              分享
            </button>
            {article.url && (
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
                原网站
              </a>
            )}
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

          {/* 元数据型文章提示（HN/Reddit） */}
          {isMetaContent && (
            <div
              className="mb-6 rounded-xl border p-5 text-center"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <BookOpen size={24} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
              <p className="mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                此文章来自聚合源，正文内容需从原网站提取
              </p>
              <button
                onClick={handleOpenFulltext}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                点击加载全文
              </button>
            </div>
          )}

          {/* 正文内容 */}
          {!isMetaContent && (
            bilingualMode && translatedParagraphs.length > 0 ? (
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
            )
          )}

          {/* 全文内嵌阅读器 */}
          {showFulltext && (
            <div
              className="mt-8 rounded-xl border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <BookOpen size={18} style={{ color: 'var(--accent)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>全文内容</h3>
                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 flex items-center gap-1 text-xs"
                      style={{ color: 'var(--accent)' }}
                    >
                      在原网站阅读 <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFulltextBilingual}
                    disabled={fulltextTranslating}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
                    style={{
                      background: fulltextBilingual ? 'rgba(0,230,118,0.12)' : 'var(--bg-primary)',
                      color: fulltextBilingual ? 'var(--accent)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {fulltextTranslating ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                    中英对照
                  </button>
                  <button
                    onClick={() => setShowFulltext(false)}
                    className="rounded p-1 hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="p-5">
                {fulltextLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
                    <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>正在提取全文…</span>
                  </div>
                ) : fulltextBilingual && fulltextTranslated.length > 0 ? (
                  <div className="space-y-4">
                    {fulltextTranslated.map((p, i) => (
                      <div key={i} className="grid grid-cols-2 gap-4 rounded-lg p-3" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.original}</div>
                        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{p.translated}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="article-content prose prose-invert max-w-none"
                    style={{ color: 'var(--text-primary)', lineHeight: 1.8 }}
                    dangerouslySetInnerHTML={{ __html: sanitizedFulltext || sanitizedContent }}
                  />
                )}
              </div>
            </div>
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

          {/* 相关文章 */}
          {relatedArticles.length > 0 && (
            <div className="mt-10">
              <h2
                className="mb-4 text-lg font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                相关文章
              </h2>
              <div className="space-y-3">
                {relatedArticles.map((ra) => (
                  <button
                    key={ra.id}
                    onClick={() => router.push(`/article/${ra.id}`)}
                    className="glow-border flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:brightness-105"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-start gap-4">
                      {ra.cover_image && (
                        <img
                          src={ra.cover_image}
                          alt=""
                          className="h-16 w-24 shrink-0 rounded-lg object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <h3
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {ra.title_zh || ra.title}
                        </h3>
                        {ra.title_zh && ra.title_zh !== ra.title && (
                          <p className="mt-0.5 text-xs opacity-60" style={{ color: 'var(--text-secondary)' }}>
                            {ra.title}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {ra.feed_title && <span>{ra.feed_title}</span>}
                          <span>{format(new Date(ra.published_at), 'MM-dd HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                    {(ra.ai_summary || ra.summary_zh || ra.summary) && (
                      <p className="mt-1 text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                        {ra.ai_summary || ra.summary_zh || ra.summary?.slice(0, 150)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* 右侧面板 */}
        <aside className="hidden w-80 shrink-0 lg:block" style={{ position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  AI 摘要
                </h3>
              </div>
              {ttsPreloading && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <Loader2 size={10} className="animate-spin" />
                  音频准备中
                </span>
              )}
              {preloadedAudioUrl && !ttsPreloading && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  音频已就绪
                </span>
              )}
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
                  className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
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
              <div className="space-y-3 py-4">
                <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '100%' }} />
                <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '85%' }} />
                <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '90%' }} />
                <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '70%' }} />
                <p className="text-center text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
                  正在为你生成 AI 摘要…
                </p>
              </div>
            ) : currentSummary ? (
              <div className="space-y-3">
                <div className="max-h-72 overflow-y-auto pr-1">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {currentSummary}
                  </p>
                </div>
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
