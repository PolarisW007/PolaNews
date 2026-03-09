'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Newspaper, Plus, Loader2, Calendar, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api-client';
import type { DailyDigest } from '@/lib/types';
import MainLayout from '@/components/layout/MainLayout';
import { useToast } from '@/components/ui/Toast';

export default function DigestListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [digests, setDigests] = useState<DailyDigest[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchDigests = async () => {
    setLoading(true);
    try {
      const raw = await api.digests.list();
      const result = raw as unknown as { digests: DailyDigest[]; total: number };
      setDigests(Array.isArray(result.digests) ? result.digests : Array.isArray(raw) ? (raw as unknown as DailyDigest[]) : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : '加载摘要失败，请重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDigests();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.digests.generate('zh');
      toast('摘要生成成功', 'success');
      await fetchDigests();
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成摘要失败，请重试', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語' };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl px-3 sm:px-5">
        <div className="mb-5 sm:mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              每日资讯摘要
            </h1>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              AI 为你整理的每日全球要闻
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex shrink-0 items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            手动生成
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : digests.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl border py-16"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <Newspaper size={40} className="mb-4" style={{ color: 'var(--text-secondary)' }} />
            <p className="mb-2 text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>
              暂无摘要
            </p>
            <p className="mb-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
              点击"手动生成"按钮来创建你的第一份每日摘要
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-5 py-2 sm:py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              生成摘要
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {digests.map((digest) => (
              <button
                key={digest.id}
                onClick={() => router.push(`/digest/${digest.digest_date}`)}
                className="glow-border group flex w-full items-center gap-3 sm:gap-4 rounded-xl border p-3 sm:p-5 text-left transition-colors"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(0,230,118,0.1)' }}
                >
                  <Calendar size={22} style={{ color: 'var(--accent)' }} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3
                    className="text-base font-medium group-hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {digest.digest_date} 资讯摘要
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="flex items-center gap-1">
                      <Globe size={12} />
                      {langLabels[digest.language] || digest.language}
                    </span>
                    <span>
                      创建于 {format(new Date(digest.created_at), 'HH:mm')}
                    </span>
                    {digest.statistics && (
                      <span>{digest.statistics.total_articles} 篇文章</span>
                    )}
                  </div>
                </div>

                <span
                  className="shrink-0 rounded-full px-3 py-1 text-xs"
                  style={{
                    background: 'rgba(0,230,118,0.08)',
                    color: 'var(--accent-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {langLabels[digest.language] || digest.language}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
