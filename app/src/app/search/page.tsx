'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useSyncExternalStore, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Search, Loader2, X, Clock, Sparkles } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface SearchArticle {
  id: string;
  title: string;
  summary: string;
  feed_title: string;
  published_at: string;
  category: string;
  snippet?: string;
}

interface SearchResult {
  articles: SearchArticle[];
  total: number;
}

function highlightText(text: string, keyword: string) {
  if (!keyword.trim() || !text) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map(part =>
    part.toLowerCase() === keyword.toLowerCase()
      ? `<mark style="background:rgba(0,255,157,0.25);color:var(--accent);border-radius:2px;padding:0 2px">${part}</mark>`
      : part
  ).join('');
}

type SearchMode = 'keyword' | 'semantic';

const SEARCH_HISTORY_KEY = 'search_history';
const SEARCH_HISTORY_EVENT = 'polanews-search-history-change';
const MAX_HISTORY = 5;

function subscribeSearchHistory(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(SEARCH_HISTORY_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(SEARCH_HISTORY_EVENT, callback);
  };
}

function historySnapshot() {
  return localStorage.getItem(SEARCH_HISTORY_KEY) || '[]';
}

function parseHistory(value: string): string[] {
  try {
    const data: unknown = JSON.parse(value);
    return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string').slice(0, MAX_HISTORY) : [];
  } catch { return []; }
}

function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  return parseHistory(historySnapshot());
}

function addSearchHistory(q: string) {
  if (typeof window === 'undefined' || !q.trim()) return;
  const history = getSearchHistory().filter(h => h !== q);
  history.unshift(q);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  window.dispatchEvent(new Event(SEARCH_HISTORY_EVENT));
}

function SearchContent({ initialQuery }: { initialQuery: string }) {
  const { toast } = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [articles, setArticles] = useState<SearchArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(Boolean(initialQuery));
  const [searched, setSearched] = useState(Boolean(initialQuery));
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword');
  const storedHistory = useSyncExternalStore(subscribeSearchHistory, historySnapshot, () => '[]');
  const searchHistory = useMemo(() => parseHistory(storedHistory), [storedHistory]);
  const inputRef = useRef<HTMLInputElement>(null);
  const limit = 20;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doKeywordSearch = useCallback(async (q: string, p: number) => {
    const data = await api.articles.search({ q, page: p, limit }) as SearchResult;
    return data;
  }, []);

  const doSemanticSearch = useCallback(async (q: string, p: number) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const qs = new URLSearchParams({ q, page: String(p), limit: String(limit) });
    const res = await fetch(`${basePath}/api/articles/semantic-search?${qs.toString()}`, { headers });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '语义搜索失败');
    return json.data as SearchResult;
  }, [basePath]);

  const doSearch = useCallback(async (q: string, p: number) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = searchMode === 'semantic'
        ? await doSemanticSearch(q, p)
        : await doKeywordSearch(q, p);
      if (p === 1) setArticles(data.articles || []);
      else setArticles(prev => [...prev, ...(data.articles || [])]);
      setTotal(data.total || 0);
      addSearchHistory(q);
    } catch (e) { toast(e instanceof Error ? e.message : '搜索失败，请重试', 'error'); }
    setLoading(false);
  }, [toast, searchMode, doKeywordSearch, doSemanticSearch]);

  useEffect(() => {
    if (!initialQuery) return;
    let active = true;
    api.articles.search({ q: initialQuery, page: 1, limit }).then(data => {
      if (!active) return;
      const result = data as SearchResult;
      setArticles(result.articles || []);
      setTotal(result.total || 0);
      addSearchHistory(initialQuery);
    }).catch(error => {
      if (active) toast(error instanceof Error ? error.message : '搜索失败，请重试', 'error');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialQuery, toast]);

  const handleSearch = () => {
    setPage(1);
    setArticles([]);
    doSearch(query, 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleHistoryClick = (q: string) => {
    setQuery(q);
    setPage(1);
    setArticles([]);
    doSearch(q, 1);
  };

  const clearHistory = () => {
    if (typeof window !== 'undefined') localStorage.removeItem(SEARCH_HISTORY_KEY);
    window.dispatchEvent(new Event(SEARCH_HISTORY_EVENT));
  };


  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: zhCN });
    } catch {
      return dateStr;
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-3 sm:px-5 animate-fade-in">
        <div className="mb-5 sm:mb-8">
          <div
            className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-xl px-3 sm:px-5 py-3 sm:py-4"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <Search size={20} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              placeholder="搜索全球资讯..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-base outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {query && (
              <button onClick={() => { setQuery(''); setArticles([]); setSearched(false); setTotal(0); }}>
                <X size={18} style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
            <button
              onClick={handleSearch}
              className="shrink-0 rounded-lg px-3 sm:px-5 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              搜索
            </button>
          </div>
          {/* 搜索模式切换 */}
          <div
            className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4"
          >
            <div
              className="flex gap-1 rounded-lg p-1"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => { setSearchMode('keyword'); setArticles([]); setSearched(false); }}
                className="flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: searchMode === 'keyword' ? 'var(--bg-hover)' : 'transparent',
                  color: searchMode === 'keyword' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Search size={12} />
                关键词搜索
              </button>
              <button
                onClick={() => { setSearchMode('semantic'); setArticles([]); setSearched(false); }}
                className="flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: searchMode === 'semantic' ? 'var(--bg-hover)' : 'transparent',
                  color: searchMode === 'semantic' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Sparkles size={12} />
                语义搜索
              </button>
            </div>
          </div>

          {/* 搜索历史 */}
          {searchHistory.length > 0 && !searched && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Clock size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              {searchHistory.map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleHistoryClick(h)}
                  className="rounded-full px-3 py-1 text-xs transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {h}
                </button>
              ))}
              <button
                onClick={clearHistory}
                className="text-xs transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                清除
              </button>
            </div>
          )}
        </div>

        {!searched && !loading && (
          <div className="text-center py-20">
            <Search size={48} style={{ color: 'var(--border)', margin: '0 auto 16px' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              输入关键词搜索全球资讯
            </p>
          </div>
        )}

        {searched && !loading && articles.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              未找到相关新闻
            </p>
          </div>
        )}

        {articles.length > 0 && (
          <>
            <p className="text-xs sm:text-sm mb-3 sm:mb-4" style={{ color: 'var(--text-secondary)' }}>
              共 {total} 条结果
            </p>
            <div className="space-y-3">
              {articles.map(article => (
                <Link key={article.id} href={`/article/${article.id}`}>
                  <div
                    className="rounded-xl p-3 sm:p-5 glow-border cursor-pointer"
                    style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  >
                    <h3
                      className="text-sm font-medium leading-relaxed line-clamp-2"
                      style={{ color: 'var(--text-primary)' }}
                      dangerouslySetInnerHTML={{ __html: highlightText(article.title, query) }}
                    />
                    <p
                      className="text-xs mt-2 line-clamp-3"
                      style={{ color: 'var(--text-secondary)' }}
                      dangerouslySetInnerHTML={{
                        __html: highlightText(
                          article.snippet || (article.summary || '').slice(0, 200),
                          query
                        ),
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
                      <span className="text-xs" style={{ color: 'var(--accent-secondary)' }}>
                        {article.feed_title}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {formatTime(article.published_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {!loading && articles.length < total && (
              <div className="flex justify-center py-6">
                <button
                  onClick={() => { const nextPage = page + 1; setPage(nextPage); void doSearch(query, nextPage); }}
                  className="rounded-lg px-3 sm:px-6 py-2 sm:py-2.5 text-sm"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  加载更多
                </button>
              </div>
            )}

            <p className="text-center text-xs py-4" style={{ color: 'var(--text-secondary)' }}>
              共 {total} 条结果
            </p>
          </>
        )}

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<MainLayout><div role="status" className="p-6"><Loader2 className="animate-spin" aria-label="正在加载" /></div></MainLayout>}>
      <SearchFromUrl />
    </Suspense>
  );
}

function SearchFromUrl() {
  const query = useSearchParams().get('q')?.trim() || '';
  return <SearchContent key={query} initialQuery={query} />;
}
