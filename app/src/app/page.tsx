'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { RefreshCw, Loader2, Newspaper, ArrowRight, Calendar, Globe, ChevronDown, SlidersHorizontal, List, LayoutGrid, BookOpen } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api-client';

interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  feed_title: string;
  favicon_url: string;
  category: string;
  cover_image: string;
  published_at: string;
  created_at: string;
  title_zh?: string;
  summary_zh?: string;
}

type DisplayLang = 'zh' | 'en' | 'original';
type ViewMode = 'card' | 'list' | 'magazine';

interface Digest {
  id: string;
  date: string;
  headline_count: number;
  title: string;
}

interface ArticleListResponse {
  articles: Article[];
  total: number;
  page: number;
  limit: number;
}

const ARTICLE_PAGE_SIZE = 20;
const ARTICLE_CACHE_TTL = 5 * 60 * 1000;
const ARTICLE_CACHE_PREFIX = 'polanews:home:v3:';

const categories = [
  { key: '', label: '全部' },
  { key: 'tech', label: '科技' },
  { key: 'finance', label: '财经' },
  { key: 'politics', label: '政治' },
  { key: 'ai', label: 'AI' },
  { key: 'military', label: '军事' },
  { key: 'society', label: '社会' },
];

/**
 * 剥离 HTML 标签、Unicode 零宽/全角空格，用于判断字符串是否真的有可见内容。
 * 注意：过滤和显示必须使用同一套清洗逻辑，否则会出现「过滤放行但渲染空白」的挤压条 bug。
 */
function cleanText(s: string | undefined | null): string {
  return (s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\s\u200B-\u200F\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, '')
    .trim();
}

/**
 * 选择当前语言下真正可显示的标题：
 * 只有 title_zh 清洗后仍有内容才用中文标题，否则 fallback 到原文。
 * 防止 title_zh='   '/'\u200B' 等「truthy 但视觉空白」的值让 h3 显示为空。
 */
function pickDisplayTitle(article: Article, displayLang: DisplayLang): string {
  if (displayLang === 'zh' && cleanText(article.title_zh).length > 0) {
    return article.title_zh as string;
  }
  return article.title;
}

/** 是否显示双语副标题：仅当中文标题真的有内容且与原文不同 */
function shouldShowBilingual(article: Article, displayLang: DisplayLang): boolean {
  return (
    displayLang === 'zh' &&
    cleanText(article.title_zh).length > 0 &&
    article.title_zh !== article.title
  );
}

/**
 * 判断文章是否可渲染：必须有有效的标题（中文或原文），
 * 去除空白与零宽字符、HTML 标签后仍有可见内容。
 * 防止出现只剩边框的空卡片。
 */
function isRenderableArticle(a: Article): boolean {
  if (!a || !a.id) return false;
  return cleanText(a.title).length > 0 || cleanText(a.title_zh).length > 0;
}

/** 按 id 去重，保留先出现的那一条 */
function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of list) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function getArticleCacheKey(params: Record<string, string | number>) {
  const normalized = Object.entries(params)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${ARTICLE_CACHE_PREFIX}${JSON.stringify(normalized)}`;
}

function readArticleCache(key: string): ArticleListResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: ArticleListResponse };
    if (!parsed?.ts || Date.now() - parsed.ts > ARTICLE_CACHE_TTL) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeArticleCache(key: string, data: ArticleListResponse) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Ignore quota errors; the network path still works.
  }
}

function clearArticleCache() {
  if (typeof window === 'undefined') return;
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(ARTICLE_CACHE_PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="skeleton mb-3 h-5 w-3/4 rounded" />
      <div className="skeleton mb-2 h-3 w-1/3 rounded" />
      <div className="skeleton mb-1 h-3 w-full rounded" />
      <div className="skeleton h-3 w-2/3 rounded" />
    </div>
  );
}

/** 读取已读状态（localStorage） */
function useReadStatus(articleId: string) {
  const [isRead] = useState(() => {
    if (typeof window === 'undefined') return false;
    const read = localStorage.getItem(`read_${articleId}`);
    return !!read;
  });
  return isRead;
}

/** 标记为已读 */
function markRead(articleId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`read_${articleId}`, '1');
}

function ArticleCard({ article, displayLang }: { article: Article; displayLang: DisplayLang }) {
  const timeAgo = formatDistanceToNow(new Date(article.published_at || article.created_at), {
    addSuffix: true,
    locale: zhCN,
  });
  const isRead = useReadStatus(article.id);

  const displayTitle = pickDisplayTitle(article, displayLang);
  const showBilingual = shouldShowBilingual(article, displayLang);

  const rawSummary = displayLang === 'zh' && cleanText(article.summary_zh).length > 0
    ? article.summary_zh
    : article.summary;

  const truncatedSummary = rawSummary
    ? rawSummary.length > 120
      ? rawSummary.slice(0, 120) + '...'
      : rawSummary
    : '';

  return (
    <Link href={`/article/${article.id}`} onClick={() => markRead(article.id)} className="block">
      <div
        className="glow-border animate-fade-in cursor-pointer rounded-xl p-5 transition-colors"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          opacity: isRead ? 0.72 : 1,
        }}
      >
        <div className="flex gap-4">
          <div className="flex-1">
            <h3
              className="mb-1 text-base font-semibold leading-snug"
              style={{ color: isRead ? 'var(--text-secondary)' : 'var(--text-primary)' }}
            >
              {displayTitle}
            </h3>
            {showBilingual && (
              <p className="mb-2 text-xs leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                {article.title}
              </p>
            )}

            <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {article.favicon_url && (
                <img
                  src={article.favicon_url}
                  alt=""
                  className="h-4 w-4 rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <span>{article.feed_title}</span>
              <span>·</span>
              <span>{timeAgo}</span>
            </div>

            {truncatedSummary && (
              <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {truncatedSummary}
              </p>
            )}

            {article.category && (
              <span
                className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--glow)',
                  color: 'var(--accent)',
                }}
              >
                {article.category}
              </span>
            )}
          </div>

          {article.cover_image && (
            <div className="flex-shrink-0 hidden sm:block">
              <img
                src={article.cover_image}
                alt=""
                className="rounded-lg object-cover"
                style={{ width: 120, height: 80 }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function ArticleListItem({ article, displayLang }: { article: Article; displayLang: DisplayLang }) {
  const timeAgo = formatDistanceToNow(new Date(article.published_at || article.created_at), {
    addSuffix: true,
    locale: zhCN,
  });
  const isRead = useReadStatus(article.id);
  const displayTitle = pickDisplayTitle(article, displayLang);
  const showBilingual = shouldShowBilingual(article, displayLang);
  const rawSummary = displayLang === 'zh' && cleanText(article.summary_zh).length > 0 ? article.summary_zh : article.summary;
  const truncatedSummary = rawSummary ? (rawSummary.length > 100 ? rawSummary.slice(0, 100) + '...' : rawSummary) : '';

  return (
    <Link href={`/article/${article.id}`} onClick={() => markRead(article.id)} className="block">
      <div
        className="animate-fade-in rounded-lg px-4 py-3 transition-colors cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          opacity: isRead ? 0.72 : 1,
          border: '1px solid var(--border)',
        }}
      >
        <div>
          <h3
            className="text-sm font-medium leading-snug"
            style={{ color: isRead ? 'var(--text-secondary)' : 'var(--text-primary)' }}
          >
            {displayTitle}
          </h3>
          {showBilingual && (
            <p className="mt-0.5 text-xs truncate" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
              {article.title}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs" style={{ color: 'var(--accent-secondary)' }}>
              {article.feed_title}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {timeAgo}
            </span>
            {article.category && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ backgroundColor: 'var(--glow)', color: 'var(--accent)' }}
              >
                {article.category}
              </span>
            )}
          </div>
        </div>
        {truncatedSummary && (
          <p className="mt-1.5 text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            {truncatedSummary}
          </p>
        )}
      </div>
    </Link>
  );
}

function ArticleMagazineHero({ article, displayLang }: { article: Article; displayLang: DisplayLang }) {
  const timeAgo = formatDistanceToNow(new Date(article.published_at || article.created_at), {
    addSuffix: true,
    locale: zhCN,
  });
  const displayTitle = pickDisplayTitle(article, displayLang);
  const showBilingual = shouldShowBilingual(article, displayLang);
  const rawSummary = displayLang === 'zh' && cleanText(article.summary_zh).length > 0 ? article.summary_zh : article.summary;
  const truncatedSummary = rawSummary
    ? rawSummary.length > 200 ? rawSummary.slice(0, 200) + '...' : rawSummary
    : '';

  return (
    <Link href={`/article/${article.id}`} className="block">
      <div
        className="glow-border animate-fade-in cursor-pointer overflow-hidden rounded-xl transition-colors"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {article.cover_image && (
          <img
            src={article.cover_image}
            alt=""
            className="w-full object-cover"
            style={{ height: 280 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="p-6">
          <h3 className="mb-1 text-xl font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {displayTitle}
          </h3>
          {showBilingual && (
            <p className="mb-3 text-sm" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
              {article.title}
            </p>
          )}
          <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {article.favicon_url && (
              <img src={article.favicon_url} alt="" className="h-4 w-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <span>{article.feed_title}</span>
            <span>·</span>
            <span>{timeAgo}</span>
          </div>
          {truncatedSummary && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {truncatedSummary}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function ArticleMagazineSmall({ article, displayLang }: { article: Article; displayLang: DisplayLang }) {
  const timeAgo = formatDistanceToNow(new Date(article.published_at || article.created_at), {
    addSuffix: true,
    locale: zhCN,
  });
  const displayTitle = pickDisplayTitle(article, displayLang);
  const showBilingual = shouldShowBilingual(article, displayLang);
  const rawSummary = displayLang === 'zh' && cleanText(article.summary_zh).length > 0 ? article.summary_zh : article.summary;
  const truncatedSummary = rawSummary
    ? rawSummary.length > 80 ? rawSummary.slice(0, 80) + '...' : rawSummary
    : '';

  return (
    <Link href={`/article/${article.id}`} className="block">
      <div
        className="glow-border animate-fade-in cursor-pointer overflow-hidden rounded-xl transition-colors"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
      >
        {article.cover_image && (
          <img
            src={article.cover_image}
            alt=""
            className="w-full object-cover"
            style={{ height: 140 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="p-4">
          <h3 className="mb-1 text-sm font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {displayTitle}
          </h3>
          {showBilingual && (
            <p className="mb-2 text-xs leading-snug line-clamp-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
              {article.title}
            </p>
          )}
          <div className="mb-2 flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>{article.feed_title}</span>
            <span>·</span>
            <span>{timeAgo}</span>
          </div>
          {truncatedSummary && (
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
              {truncatedSummary}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [fetching, setFetching] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [displayLang, setDisplayLang] = useState<DisplayLang>('zh');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const [filterImportance, setFilterImportance] = useState('');
  const [filterSentiment, setFilterSentiment] = useState('');
  const [filterTimeRange, setFilterTimeRange] = useState('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageRef = useRef(1);

  const langOptions: { key: DisplayLang; label: string }[] = [
    { key: 'zh', label: '中文' },
    { key: 'en', label: 'English' },
    { key: 'original', label: '原文' },
  ];

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const fetchArticles = useCallback(async (category: string, pageNum: number, append = false, options?: { bypassCache?: boolean }) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const params: Record<string, string | number> = { page: pageNum, limit: ARTICLE_PAGE_SIZE };
      if (category) params.category = category;
      if (filterImportance) params.importance = filterImportance;
      if (filterSentiment) params.sentiment = filterSentiment;
      if (filterTimeRange) {
        const now = new Date();
        if (filterTimeRange === 'today') {
          params.date_from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (filterTimeRange === 'week') {
          const d = new Date(now); d.setDate(d.getDate() - 7);
          params.date_from = d.toISOString();
        } else if (filterTimeRange === 'month') {
          const d = new Date(now); d.setMonth(d.getMonth() - 1);
          params.date_from = d.toISOString();
        }
      }

      const cacheKey = getArticleCacheKey(params);
      const cached = options?.bypassCache ? null : readArticleCache(cacheKey);
      const result = cached || (await api.articles.list(params) as ArticleListResponse);
      if (!cached) writeArticleCache(cacheKey, result);
      const list = Array.isArray(result.articles) ? result.articles : [];

      const cleaned = list.filter(isRenderableArticle);
      if (append) {
        setArticles((prev) => dedupeById([...prev, ...cleaned]));
      } else {
        setArticles(dedupeById(cleaned));
      }

      setHasMore(pageNum * ARTICLE_PAGE_SIZE < (result.total || 0) && list.length > 0);
    } catch {
      toast('加载文章失败，请稍后重试', 'error');
      if (!append) setArticles([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filterImportance, filterSentiment, filterTimeRange, toast]);

  const fetchDigest = useCallback(async () => {
    try {
      const data = (await api.digests.latest()) as unknown as Digest;
      setDigest(data);
    } catch {
      toast('加载今日摘要失败', 'error');
    }
  }, [toast]);

  useEffect(() => {
    setPage(1);
    fetchArticles(activeCategory, 1);
  }, [activeCategory, fetchArticles, filterImportance, filterSentiment, filterTimeRange]);

  useEffect(() => {
    fetchDigest();
  }, [fetchDigest]);

  // 点击语言菜单外部关闭
  useEffect(() => {
    if (!showLangMenu) return;
    const handler = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLangMenu]);

  const handleLoadMore = () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    const nextPage = pageRef.current + 1;
    pageRef.current = nextPage;
    setPage(nextPage);
    fetchArticles(activeCategory, nextPage, true);
  };

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loadingMoreRef.current || !hasMoreRef.current || loading) return;
        loadingMoreRef.current = true;
        const nextPage = pageRef.current + 1;
        pageRef.current = nextPage;
        setPage(nextPage);
        fetchArticles(activeCategory, nextPage, true);
      },
      { root: null, rootMargin: '520px 0px', threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeCategory, fetchArticles, loading]);

  const [fetchMsg, setFetchMsg] = useState('');
  const [fetchProgress, setFetchProgress] = useState(0); // 0-100
  const fetchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleManualFetch = async () => {
    if (fetching) return;
    setFetching(true);
    setFetchProgress(0);
    setFetchMsg('正在连接 RSS 源...');

    // 模拟进度动画：从 0→85 用约 40 秒匀速增长，最终由实际完成触发 100
    let elapsed = 0;
    fetchTimerRef.current = setInterval(() => {
      elapsed += 1;
      // 0→85% 在 40 秒内线性增长
      const pct = Math.min(85, Math.round((elapsed / 40) * 85));
      setFetchProgress(pct);
      if (elapsed < 10) {
        setFetchMsg(`正在抓取 RSS 源（${pct}%）...`);
      } else if (elapsed < 25) {
        setFetchMsg(`正在处理文章数据（${pct}%）...`);
      } else {
        setFetchMsg(`正在整理分类（${pct}%）...`);
      }
    }, 1000);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/feeds/fetch`, {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();

      if (fetchTimerRef.current) clearInterval(fetchTimerRef.current);
      setFetchProgress(100);

      if (json.success) {
        setFetchMsg(`✓ 抓取完成！${json.data.feeds_count} 个源，新增 ${json.data.articles_count} 篇文章`);
        clearArticleCache();
        setPage(1);
        await fetchArticles(activeCategory, 1, false, { bypassCache: true });
        setTimeout(() => {
          fetchArticles(activeCategory, 1, false, { bypassCache: true });
          setFetchMsg('');
          setFetchProgress(0);
        }, 5000);
      } else {
        setFetchMsg(`抓取失败：${json.error || '未知错误'}`);
        setTimeout(() => { setFetchMsg(''); setFetchProgress(0); }, 5000);
      }
    } catch (err) {
      if (fetchTimerRef.current) clearInterval(fetchTimerRef.current);
      setFetchProgress(0);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setFetchMsg('抓取超时，请稍后重试');
      } else {
        setFetchMsg('抓取出错，请检查网络连接');
      }
      setTimeout(() => setFetchMsg(''), 5000);
    } finally {
      setFetching(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex gap-6">
        {/* 主内容区 */}
        <div className="flex-1 min-w-0">
          {/* 分类 Tab */}
          <div className="mb-3 lg:mb-4">
            <div
              className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className="relative whitespace-nowrap rounded-lg px-3 sm:px-4 py-2 text-sm transition-colors"
                  style={{
                    color: activeCategory === cat.key ? 'var(--accent)' : 'var(--text-secondary)',
                    backgroundColor: activeCategory === cat.key ? 'var(--glow)' : 'transparent',
                  }}
                >
                  {cat.label}
                  {activeCategory === cat.key && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                      style={{ width: 20, height: 2, backgroundColor: 'var(--accent)' }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 工具栏 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div
              className="flex flex-shrink-0 gap-0.5 rounded-lg p-0.5"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              {([
                { key: 'list' as ViewMode, icon: <List size={14} />, title: '列表模式' },
                { key: 'card' as ViewMode, icon: <LayoutGrid size={14} />, title: '卡片模式' },
                { key: 'magazine' as ViewMode, icon: <BookOpen size={14} />, title: '杂志模式' },
              ]).map(({ key, icon, title }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  title={title}
                  className="rounded-md p-1.5 transition-colors"
                  style={{
                    backgroundColor: viewMode === key ? 'var(--bg-hover)' : 'transparent',
                    color: viewMode === key ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all"
              style={{
                backgroundColor: (filterImportance || filterSentiment || filterTimeRange) ? 'rgba(0,255,157,0.12)' : 'var(--bg-secondary)',
                color: (filterImportance || filterSentiment || filterTimeRange) ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">筛选</span>
            </button>
            <div className="relative flex-shrink-0" ref={langMenuRef}>
              <button
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                <Globe size={14} />
                <span className="hidden sm:inline">{langOptions.find(l => l.key === displayLang)?.label}</span>
                <ChevronDown size={12} />
              </button>
              {showLangMenu && (
                <div
                  className="absolute right-0 top-full z-20 mt-1 min-w-[100px] rounded-lg py-1"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  {langOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { setDisplayLang(opt.key); setShowLangMenu(false); }}
                      className="block w-full px-4 py-1.5 text-left text-xs transition-colors"
                      style={{
                        color: opt.key === displayLang ? 'var(--accent)' : 'var(--text-secondary)',
                        backgroundColor: 'transparent',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleManualFetch}
              disabled={fetching}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-60 ml-auto"
              style={{
                backgroundColor: fetching ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                color: fetching ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
              title="手动抓取所有 RSS 源"
            >
              {fetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="hidden sm:inline">{fetching ? '抓取中...' : '抓取'}</span>
            </button>
          </div>

          {/* 筛选面板 */}
          {showFilters && (
            <div
              className="mb-4 animate-fade-in rounded-xl p-4"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--text-secondary)' }}>时间范围</label>
                  <select
                    value={filterTimeRange}
                    onChange={e => setFilterTimeRange(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  >
                    <option value="">全部</option>
                    <option value="today">今天</option>
                    <option value="week">本周</option>
                    <option value="month">本月</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--text-secondary)' }}>重要性</label>
                  <select
                    value={filterImportance}
                    onChange={e => setFilterImportance(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  >
                    <option value="">全部</option>
                    <option value="breaking">突发</option>
                    <option value="important">重要</option>
                    <option value="normal">普通</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--text-secondary)' }}>情感</label>
                  <select
                    value={filterSentiment}
                    onChange={e => setFilterSentiment(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  >
                    <option value="">全部</option>
                    <option value="positive">正面</option>
                    <option value="neutral">中性</option>
                    <option value="negative">负面</option>
                  </select>
                </div>
                {(filterImportance || filterSentiment || filterTimeRange) && (
                  <div className="flex items-end">
                    <button
                      onClick={() => { setFilterImportance(''); setFilterSentiment(''); setFilterTimeRange(''); }}
                      className="rounded-lg px-3 py-1.5 text-xs"
                      style={{ color: 'var(--accent)' }}
                    >
                      清除筛选
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 抓取状态提示（带进度条） */}
          {fetchMsg && fetchMsg.trim() && (
            <div
              className="mb-4 rounded-lg px-4 py-3 text-sm animate-fade-in overflow-hidden"
              style={{
                backgroundColor: fetchMsg.startsWith('✓') ? 'rgba(0,255,157,0.1)' : fetchMsg.includes('失败') || fetchMsg.includes('超时') || fetchMsg.includes('出错') ? 'rgba(255,82,82,0.1)' : 'rgba(0,255,157,0.05)',
                border: `1px solid ${fetchMsg.startsWith('✓') ? 'rgba(0,255,157,0.2)' : fetchMsg.includes('失败') ? 'rgba(255,82,82,0.2)' : 'var(--border)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                {fetching && <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />}
                <span style={{ color: fetchMsg.startsWith('✓') ? 'var(--accent)' : fetchMsg.includes('失败') ? 'var(--danger, #ff5252)' : 'var(--text-secondary)' }}>
                  {fetchMsg}
                </span>
              </div>
              {fetching && fetchProgress > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${fetchProgress}%`, background: 'var(--accent)' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 文章列表 */}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Newspaper size={48} style={{ color: 'var(--text-disabled)' }} />
              <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                暂无新闻，点击下方按钮手动抓取
              </p>
              <button
                onClick={handleManualFetch}
                disabled={fetching}
                className="mt-4 flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--bg-primary)',
                }}
              >
                {fetching ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                {fetching ? '抓取中...' : '手动抓取'}
              </button>
            </div>
          ) : (
            <>
              {viewMode === 'list' && (
                <div className="space-y-2">
                  {articles.filter(isRenderableArticle).map((article) => (
                    <ArticleListItem key={article.id} article={article} displayLang={displayLang} />
                  ))}
                </div>
              )}

              {viewMode === 'card' && (
                <div className="space-y-4">
                  {articles.filter(isRenderableArticle).map((article) => (
                    <ArticleCard key={article.id} article={article} displayLang={displayLang} />
                  ))}
                </div>
              )}

              {viewMode === 'magazine' && (() => {
                const list = articles.filter(isRenderableArticle);
                return (
                  <div>
                    {list.length > 0 && (
                      <div className="mb-4">
                        <ArticleMagazineHero article={list[0]} displayLang={displayLang} />
                      </div>
                    )}
                    {list.length > 1 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {list.slice(1).map((article) => (
                          <ArticleMagazineSmall key={article.id} article={article} displayLang={displayLang} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div ref={loadMoreRef} className="h-8" aria-hidden="true" />

              {hasMore ? (
                <div className="mt-2 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {loadingMore ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    {loadingMore ? '加载中...' : '加载更多'}
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                  已加载全部内容
                </p>
              )}
            </>
          )}
        </div>

        {/* 右侧面板 */}
        <div className="hidden lg:block" style={{ width: 320, flexShrink: 0 }}>
          <div
            className="sticky rounded-xl p-5"
            style={{
              top: 88,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <h2
              className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--accent)' }}
            >
              <Calendar size={16} />
              Today&apos;s Digest
            </h2>

            {digest ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  包含 {digest.headline_count ?? 0} 条头条新闻
                </p>
                <Link
                  href={digest.date ? `/digest/${digest.date}` : '/digest'}
                  className="inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: 'var(--accent)' }}
                >
                  查看完整 Digest
                  <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                暂无 Digest，AI 正在为你整理今日要闻...
              </p>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
