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
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
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

interface NeighborInfo {
  id: string;
  title: string;
  title_zh: string;
  feed_title: string;
  published_at: string;
}

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
  const [translatedHtml, setTranslatedHtml] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioRef, setTtsAudioRef] = useState<HTMLAudioElement | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<Article[]>([]);
  const [showSource, setShowSource] = useState(false);
  // TTS 预加载
  const [preloadedAudioUrl, setPreloadedAudioUrl] = useState<string | null>(null);
  const [ttsPreloading, setTtsPreloading] = useState(false);
  // 全文内容（自动加载）
  const [fulltextContent, setFulltextContent] = useState<string>('');
  const [fulltextLoading, setFulltextLoading] = useState(false);
  const [articleUrl, setArticleUrl] = useState<string>('');
  const [prevArticle, setPrevArticle] = useState<NeighborInfo | null>(null);
  const [nextArticle, setNextArticle] = useState<NeighborInfo | null>(null);

  const ttsPreloadRef = useRef(false);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  // 加载文章 + 自动加载全文
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // 重置全文状态（切换文章时）
    setFulltextContent('');
    setFulltextLoading(false);
    ttsPreloadRef.current = false;
    setPreloadedAudioUrl(null);
    setTranslatedParagraphs([]);
    setTranslatedHtml('');
    setBilingualMode(false);
    setPrevArticle(null);
    setNextArticle(null);

    fetch(`${basePath}/api/articles/${id}/neighbors`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setPrevArticle(d.data.prev || null);
          setNextArticle(d.data.next || null);
        }
      })
      .catch(() => {});

    api.articles.get(id).then((data) => {
      const art = data as Article;
      setArticle(art);
      setStarred(!!art.is_starred);
      setSaved(!!art.is_saved);
      setArticleUrl(art.url || '');
      api.articles.markRead(id).catch(() => {});

      // 检查 localStorage 中是否有缓存的摘要（加速二次访问）
      const cacheKey = `ai_summary_zh_${id}`;
      const cachedSummary = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;

      if (!art.ai_summary && !cachedSummary) {
        // 无摘要，生成并缓存
        setSummarizing(true);
        api.articles.summarize(art.id, 'zh')
          .then((d) => {
            const summaryData = d as Article;
            setArticle((prev) => prev ? { ...prev, ...summaryData } : prev);
            // 缓存到 localStorage
            if (summaryData.ai_summary && typeof window !== 'undefined') {
              localStorage.setItem(cacheKey, summaryData.ai_summary);
            }
          })
          .catch(() => {})
          .finally(() => setSummarizing(false));
      } else if (!art.ai_summary && cachedSummary) {
        // 有本地缓存，先显示缓存内容
        setArticle((prev) => prev ? { ...prev, ai_summary: cachedSummary } : prev);
      }

      // 自动后台加载全文 + 自动中英对照
      setFulltextLoading(true);
      const isMeta = isMetadataOnlyContent(art.content || '');
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch(`${basePath}/api/articles/${id}/fulltext`, { headers })
        .then(r => r.json())
        .then(async (d) => {
          if (d.success && d.data?.content) {
            setFulltextContent(d.data.content);
            if (d.data.url) setArticleUrl(d.data.url);
          }

          // 全文加载后，后台预翻译（用户点击"中英对照"时即可使用）
          const contentHtml = (d.success && d.data?.content) ? d.data.content : (art.content || '');
          if (contentHtml && contentHtml.length > 20) {
            // 静默预翻译，不自动开启中英对照
            fetch(`${basePath}/api/articles/${id}/translate`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'html', html: contentHtml }),
            })
              .then(r => r.json())
              .then(tr => {
                if (tr.success && tr.data?.translated_html) {
                  setTranslatedHtml(tr.data.translated_html);
                }
                if (tr.success && tr.data?.paragraphs?.length > 0) {
                  setTranslatedParagraphs(tr.data.paragraphs);
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {})
        .finally(() => setFulltextLoading(false));

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
  }, [id, toast, basePath]);

  // 键盘快捷键：← 上一篇, → 下一篇
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && prevArticle) {
        router.push(`/article/${prevArticle.id}`);
      } else if (e.key === 'ArrowRight' && nextArticle) {
        router.push(`/article/${nextArticle.id}`);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [prevArticle, nextArticle, router]);

  // 触摸手势：仅在移动端生效，左右滑动切换文章
  const touchRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null);
  const swipeHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window) && window.matchMedia('(max-width: 1023px)').matches;
    if (!isTouchDevice) return;

    const MIN_DISTANCE = 80;
    const MAX_VERTICAL = 60;
    const MAX_TIME = 400;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now() };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchRef.current.startX;
      const dy = Math.abs(t.clientY - touchRef.current.startY);
      const elapsed = Date.now() - touchRef.current.startTime;
      touchRef.current = null;

      if (elapsed > MAX_TIME || dy > MAX_VERTICAL || Math.abs(dx) < MIN_DISTANCE) return;

      if (dx > 0 && prevArticle) {
        setSwipeHint('right');
        if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current);
        swipeHintTimer.current = setTimeout(() => {
          setSwipeHint(null);
          router.push(`/article/${prevArticle.id}`);
        }, 300);
      } else if (dx < 0 && nextArticle) {
        setSwipeHint('left');
        if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current);
        swipeHintTimer.current = setTimeout(() => {
          setSwipeHint(null);
          router.push(`/article/${nextArticle.id}`);
        }, 300);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
      if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current);
    };
  }, [prevArticle, nextArticle, router]);

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
    // 已有当前语言的摘要则直接复用，不重复请求
    const existing =
      summaryLang === 'en' ? article.ai_summary_en
      : summaryLang === 'ja' ? article.ai_summary_ja
      : article.ai_summary;
    if (existing) {
      toast('AI 摘要已就绪', 'info');
      return;
    }
    setSummarizing(true);
    try {
      const data = await api.articles.summarize(article.id, summaryLang) as Article;
      setArticle((prev) => prev ? { ...prev, ...data } : prev);
      // 持久化到 localStorage（减少下次重复请求）
      if (summaryLang === 'zh' && data.ai_summary && typeof window !== 'undefined') {
        localStorage.setItem(`ai_summary_zh_${article.id}`, data.ai_summary);
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
    // 已有预翻译的 HTML，直接开启
    if (translatedHtml) {
      setBilingualMode(true);
      return;
    }
    // 没有预翻译结果，手动触发 HTML 翻译
    setTranslating(true);
    try {
      const contentHtml = fulltextContent || article.content || '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/articles/${article.id}/translate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mode: 'html', html: contentHtml }),
      });
      const data = await res.json();
      if (data.success && data.data?.translated_html) {
        setTranslatedHtml(data.data.translated_html);
        if (data.data.paragraphs) setTranslatedParagraphs(data.data.paragraphs);
        setBilingualMode(true);
      } else {
        toast('翻译失败，请稍后重试', 'error');
      }
    } catch { toast('翻译失败，请稍后重试', 'error'); }
    finally { setTranslating(false); }
  };

  const richSanitizeOptions = {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'video', 'source', 'iframe', 'picture', 'span', 'div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'details', 'summary', 'mark', 'time', 'small', 'sub', 'sup']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['class', 'style', 'id'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes', 'decoding'],
      iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
      video: ['src', 'controls', 'width', 'height', 'poster'],
      source: ['src', 'type', 'srcset', 'sizes', 'media'],
      a: ['href', 'target', 'rel', 'title'],
      time: ['datetime'],
    },
  };

  const sanitizedContent = article
    ? sanitizeHtml(article.content, richSanitizeOptions)
    : '';

  const sanitizedFulltext = fulltextContent
    ? sanitizeHtml(fulltextContent, richSanitizeOptions)
    : '';

  const sanitizedTranslatedHtml = translatedHtml
    ? sanitizeHtml(translatedHtml, richSanitizeOptions)
    : '';

  const hasSourceInfo = article && (article.url || (article.content?.includes('Comments URL') || article.content?.includes('Points:')));

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

  const isBilingualActive = bilingualMode && (translatedHtml || translatedParagraphs.length > 0);

  return (
    <MainLayout>
      {/* 滑动切换提示 */}
      {swipeHint && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
          <div
            className="flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium animate-fade-in"
            style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--accent)', backdropFilter: 'blur(8px)' }}
          >
            {swipeHint === 'right' ? <ChevronLeft size={18} /> : null}
            {swipeHint === 'right' ? '上一篇' : '下一篇'}
            {swipeHint === 'left' ? <ChevronRight size={18} /> : null}
          </div>
        </div>
      )}

      <div className={`mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 ${isBilingualActive ? 'max-w-[1600px]' : 'max-w-[1200px]'}`}>
        {/* 主内容区 */}
        <article className="min-w-0 flex-1" style={{ maxWidth: isBilingualActive ? undefined : 800 }}>
          <div className="mb-4 sm:mb-6 flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-sm transition-colors hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">返回</span>
            </button>
            <div className="mx-0.5 sm:mx-1 h-4 w-px" style={{ background: 'var(--border)' }} />
            <button
              onClick={() => prevArticle && router.push(`/article/${prevArticle.id}`)}
              disabled={!prevArticle}
              className="flex items-center gap-1 rounded-lg px-2 sm:px-3 py-1.5 text-sm transition-all disabled:opacity-30"
              style={{ color: prevArticle ? 'var(--text-secondary)' : 'var(--text-disabled)' }}
              title={prevArticle ? `上一篇: ${prevArticle.title_zh || prevArticle.title}` : '没有上一篇了'}
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">上一篇</span>
            </button>
            <button
              onClick={() => nextArticle && router.push(`/article/${nextArticle.id}`)}
              disabled={!nextArticle}
              className="flex items-center gap-1 rounded-lg px-2 sm:px-3 py-1.5 text-sm transition-all disabled:opacity-30"
              style={{ color: nextArticle ? 'var(--text-secondary)' : 'var(--text-disabled)' }}
              title={nextArticle ? `下一篇: ${nextArticle.title_zh || nextArticle.title}` : '没有下一篇了'}
            >
              <span className="hidden sm:inline">下一篇</span>
              <ChevronRight size={16} />
            </button>
          </div>

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
            {articleUrl && (
              <>
                <span>·</span>
                <a
                  href={articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 transition-opacity hover:opacity-80"
                  style={{ color: 'var(--accent)' }}
                >
                  <Globe size={12} />
                  在原网站阅读
                  <ExternalLink size={10} />
                </a>
              </>
            )}
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
            className="mb-6 sm:mb-8 flex flex-wrap items-center gap-1.5 sm:gap-2.5"
            style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}
          >
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-sm transition-colors"
              style={{
                background: 'rgba(0,230,118,0.12)',
                color: 'var(--accent)',
                border: '1px solid var(--border)',
              }}
            >
              {summarizing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span className="hidden sm:inline">AI 摘要</span>
            </button>
            <button
              onClick={handleTTS}
              disabled={ttsLoading}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-sm transition-colors"
              style={{
                background: isSpeaking ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: isSpeaking ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
              title={isSpeaking ? '停止朗读' : (ttsPreloading ? '音频准备中…' : (preloadedAudioUrl ? '点击即可播放' : '朗读中文摘要'))}
            >
              {ttsLoading ? <Loader2 size={16} className="animate-spin" /> : isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              <span className="hidden sm:inline">{ttsLoading ? '合成中...' : isSpeaking ? '停止朗读' : ttsPreloading ? '准备中…' : '朗读摘要'}</span>
              {preloadedAudioUrl && !isSpeaking && !ttsLoading && (
                <span className="ml-1 h-2 w-2 rounded-full bg-green-400" title="音频已就绪" />
              )}
            </button>
            <button
              onClick={handleBilingualToggle}
              disabled={translating}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-sm transition-colors"
              style={{
                background: bilingualMode ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: bilingualMode ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {translating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
              <span className="hidden sm:inline">中英对照</span>
            </button>
            <div className="hidden sm:block mx-1 h-5 w-px" style={{ background: 'var(--border)' }} />
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('auth_token');
                  if (!token) { toast('请先登录', 'info'); return; }
                  const data = await api.articles.star(article.id);
                  setStarred(data.is_starred);
                } catch { toast('收藏操作失败', 'error'); }
              }}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-sm transition-colors"
              style={{
                background: starred ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: starred ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Star size={16} fill={starred ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline">收藏</span>
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
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-sm transition-colors"
              style={{
                background: saved ? 'rgba(0,230,118,0.12)' : 'var(--bg-secondary)',
                color: saved ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
              <span className="hidden sm:inline">稍后阅读</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-sm transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <Share2 size={16} />
              <span className="hidden sm:inline">分享</span>
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

          {/* 移动端 AI 摘要：操作栏下方、正文上方 */}
          <div className={`lg:hidden mb-4 ${isBilingualActive ? 'hidden' : ''}`}>
            <div
              className="rounded-xl border p-4"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    AI 摘要
                  </h3>
                </div>
                {ttsPreloading && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <Loader2 size={10} className="animate-spin" />
                    准备中
                  </span>
                )}
                {preloadedAudioUrl && !ttsPreloading && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    音频已就绪
                  </span>
                )}
              </div>

              <div
                className="mb-3 flex gap-1 rounded-lg p-1"
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
                <div className="space-y-2 py-3">
                  <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '100%' }} />
                  <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '85%' }} />
                  <div className="h-3 rounded-full animate-pulse" style={{ background: 'var(--bg-hover)', width: '70%' }} />
                  <p className="text-center text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                    正在为你生成 AI 摘要…
                  </p>
                </div>
              ) : currentSummary ? (
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {currentSummary}
                  </p>
                  {article.ai_key_points && article.ai_key_points.length > 0 && (
                    <div>
                      <h4 className="mb-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        关键要点
                      </h4>
                      <ul className="space-y-1">
                        {article.ai_key_points.map((point, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                            <span style={{ color: 'var(--text-primary)' }}>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>暂无 AI 摘要</p>
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

            {article.keywords && article.keywords.length > 0 && (
              <div
                className="mt-3 rounded-xl border p-4"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              >
                <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
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

          {/* 加载状态提示 */}
          {fulltextLoading && (
            <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />
              正在加载完整内容…
            </div>
          )}
          {translating && !fulltextLoading && (
            <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />
              正在翻译全文，即将显示中英对照…
            </div>
          )}

          {/* 正文内容 */}
          {isBilingualActive ? (
            <div>
              <div
                className="mb-4 flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                style={{ background: 'rgba(0,230,118,0.08)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,0.2)' }}
              >
                <div className="flex items-center gap-2">
                  <Languages size={12} />
                  中英对照模式
                </div>
                <button
                  onClick={() => setBilingualMode(false)}
                  className="rounded px-2 py-0.5 text-xs transition-colors hover:opacity-80"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  关闭对照
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <div>
                  <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    English Original
                  </div>
                  <div
                    className="article-content prose prose-invert max-w-none"
                    style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '0.9rem' }}
                    dangerouslySetInnerHTML={{ __html: sanitizedFulltext || sanitizedContent }}
                  />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium" style={{ color: 'var(--accent)', opacity: 0.8 }}>
                    中文译文
                  </div>
                  {sanitizedTranslatedHtml ? (
                    <div
                      className="article-content prose prose-invert max-w-none"
                      style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: '0.9rem' }}
                      dangerouslySetInnerHTML={{ __html: sanitizedTranslatedHtml }}
                    />
                  ) : (
                    <div
                      className="prose prose-invert max-w-none text-sm leading-relaxed"
                      style={{ color: 'var(--text-primary)', lineHeight: 1.8 }}
                    >
                      {translatedParagraphs.map((p, i) => (
                        <p key={i} className="mb-4">{p.translated}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="article-content prose prose-invert max-w-none"
              style={{ color: 'var(--text-primary)', lineHeight: 1.8 }}
              dangerouslySetInnerHTML={{ __html: sanitizedFulltext || sanitizedContent }}
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
          {/* 上一篇 / 下一篇 底部导航 */}
          {(prevArticle || nextArticle) && (
            <div
              className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '1.25rem',
              }}
            >
              {prevArticle && (
                <button
                  onClick={() => router.push(`/article/${prevArticle.id}`)}
                  className="group flex flex-col gap-1.5 rounded-xl p-4 text-left transition-all hover:brightness-110"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
                    <ChevronLeft size={14} />
                    <span>上一篇</span>
                    <span className="ml-1 hidden rounded px-1.5 py-0.5 text-[10px] sm:inline" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>←</span>
                  </div>
                  <span className="text-sm font-medium line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                    {prevArticle.title_zh || prevArticle.title}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {prevArticle.feed_title}
                  </span>
                </button>
              )}
              {nextArticle && (
                <button
                  onClick={() => router.push(`/article/${nextArticle.id}`)}
                  className="group flex flex-col gap-1.5 rounded-xl p-4 text-right transition-all hover:brightness-110"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    gridColumn: !prevArticle ? '1' : undefined,
                  }}
                >
                  <div className="flex items-center justify-end gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
                    <span className="mr-1 hidden rounded px-1.5 py-0.5 text-[10px] sm:inline" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>→</span>
                    <span>下一篇</span>
                    <ChevronRight size={14} />
                  </div>
                  <span className="text-sm font-medium line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                    {nextArticle.title_zh || nextArticle.title}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {nextArticle.feed_title}
                  </span>
                </button>
              )}
            </div>
          )}
        </article>

        {/* 右侧面板（桌面端侧栏固定；移动端已在操作栏下方内联显示；中英对照模式下完全隐藏） */}
        <aside className={`hidden lg:block w-80 shrink-0 ${isBilingualActive ? '!hidden' : ''}`} style={{ position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
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
