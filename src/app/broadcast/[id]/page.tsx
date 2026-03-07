'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  Pause,
  Loader2,
  Calendar,
  Globe,
  Clock,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

interface Segment {
  index: number;
  text: string;
}

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

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showTip, setShowTip] = useState(false);

  const fetchBroadcast = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.broadcasts.list() as { broadcasts: Broadcast[] };
      const found = (data.broadcasts || []).find((b) => b.id === id);
      if (found) {
        setBroadcast(found);
        try {
          const parsed = JSON.parse(found.segments) as Segment[];
          setSegments(parsed);
        } catch {
          setSegments([]);
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '获取播报详情失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchBroadcast();
  }, [fetchBroadcast]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handlePlayToggle = () => {
    toast('TTS 音频播放功能需配置 CosyVoice API。当前可阅读文字播报稿。', 'info');
    setShowTip(true);
    setTimeout(() => setShowTip(false), 3000);
  };

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語' };
  const speeds = [0.75, 1, 1.25, 1.5, 2];

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      </MainLayout>
    );
  }

  if (!broadcast) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => router.push('/broadcast')}
            className="mb-6 flex items-center gap-2 text-sm transition-colors hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            <ArrowLeft size={16} />
            返回播报列表
          </button>
          <div
            className="rounded-xl border p-12 text-center"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
          >
            <p style={{ color: 'var(--text-secondary)' }}>播报不存在</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push('/broadcast')}
          className="mb-6 flex items-center gap-2 text-sm transition-colors hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} />
          返回播报列表
        </button>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {broadcast.broadcast_date} 新闻播报
          </h1>
          <div
            className="mt-2 flex items-center gap-4 text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {format(new Date(broadcast.created_at), 'yyyy-MM-dd HH:mm')}
            </span>
            <span className="flex items-center gap-1">
              <Globe size={14} />
              {langLabels[broadcast.language] || broadcast.language}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={14} />
              预计 {formatDuration(broadcast.total_duration_ms)}
            </span>
          </div>
        </div>

        {/* Segments */}
        <div className="mb-6 space-y-4">
          {segments.length > 0 ? (
            segments.map((seg) => (
              <div
                key={seg.index}
                className="rounded-xl border p-5"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
              >
                <h3
                  className="mb-3 text-sm font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  段落 {seg.index}
                </h3>
                <p
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {seg.text}
                </p>
              </div>
            ))
          ) : (
            <div
              className="rounded-xl border p-5"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <pre
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{ color: 'var(--text-primary)', fontFamily: 'inherit' }}
              >
                {broadcast.script}
              </pre>
            </div>
          )}
        </div>

        {/* Player UI */}
        <div
          className="sticky bottom-6 rounded-xl border p-5"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          {showTip && (
            <div
              className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: 'rgba(255,152,0,0.1)', color: '#FFB74D' }}
            >
              <Info size={14} />
              TTS 音频功能需配置 CosyVoice API
            </div>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayToggle}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all hover:brightness-110"
              style={{ background: 'var(--accent)' }}
            >
              {isPlaying ? (
                <Pause size={18} className="text-black" />
              ) : (
                <Play size={18} className="ml-0.5 text-black" />
              )}
            </button>

            <div className="flex-1">
              <div
                className="h-1.5 w-full cursor-pointer overflow-hidden rounded-full"
                style={{ background: 'var(--border)' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = ((e.clientX - rect.left) / rect.width) * 100;
                  setProgress(Math.min(100, Math.max(0, pct)));
                }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: 'var(--accent)' }}
                />
              </div>
              <div
                className="mt-1 flex justify-between text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span>
                  {formatDuration(
                    Math.floor((broadcast.total_duration_ms * progress) / 100)
                  )}
                </span>
                <span>{formatDuration(broadcast.total_duration_ms)}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {speeds.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className="rounded px-2 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: speed === s ? 'var(--accent)' : 'transparent',
                    color: speed === s ? '#000' : 'var(--text-secondary)',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
