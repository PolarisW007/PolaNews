'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Plus, Loader2, Calendar, Globe, Clock } from 'lucide-react';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface Broadcast {
  id: string;
  digest_id: string;
  broadcast_date: string;
  language: string;
  script: string;
  segments: string;
  total_duration_ms: number;
  voice_id: string;
  status: string;
  created_at: string;
}

export default function BroadcastListPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const data = await api.broadcasts.list() as { broadcasts: Broadcast[] };
      setBroadcasts(data.broadcasts || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : '获取播报列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.broadcasts.generate('zh');
      await fetchBroadcasts();
      toast('播报生成成功', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '生成播报失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語' };
  const statusLabels: Record<string, string> = { ready: '就绪', playing: '播放中', error: '错误' };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              智能播报
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              AI 将每日摘要转化为口语化播报稿
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            生成新播报
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : broadcasts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl border py-16"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <Radio size={40} className="mb-4" style={{ color: 'var(--text-secondary)' }} />
            <p className="mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              暂无播报
            </p>
            <p className="mb-6 text-xs" style={{ color: 'var(--text-secondary)' }}>
              点击"生成新播报"按钮，AI 将为你生成口语化的新闻播报稿
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              生成播报
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/broadcast/${b.id}`)}
                className="glow-border group flex w-full items-center gap-4 rounded-xl border p-5 text-left transition-colors"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(0,230,118,0.1)' }}
                >
                  <Radio size={22} style={{ color: 'var(--accent)' }} />
                </div>

                <div className="min-w-0 flex-1">
                  <h3
                    className="text-base font-medium group-hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {b.broadcast_date} 新闻播报
                  </h3>
                  <div
                    className="mt-1 flex items-center gap-3 text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {format(new Date(b.created_at), 'yyyy-MM-dd HH:mm')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Globe size={12} />
                      {langLabels[b.language] || b.language}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(b.total_duration_ms)}
                    </span>
                  </div>
                </div>

                <span
                  className="rounded-full px-3 py-1 text-xs"
                  style={{
                    background: b.status === 'ready' ? 'rgba(0,230,118,0.08)' : 'rgba(255,152,0,0.08)',
                    color: b.status === 'ready' ? 'var(--accent-secondary)' : '#FFB74D',
                    border: '1px solid var(--border)',
                  }}
                >
                  {statusLabels[b.status] || b.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
