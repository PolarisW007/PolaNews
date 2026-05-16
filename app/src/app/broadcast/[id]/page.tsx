'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Globe,
  Clock,
  Info,
} from 'lucide-react';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import BroadcastPlayer from '@/components/ui/BroadcastPlayer';
import { useToast } from '@/components/ui/Toast';

interface Segment {
  index: number;
  text: string;
  duration_ms?: number;
  audio_url?: string | null;
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

function resolveAudioUrl(url: string, basePath: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (basePath && url.startsWith(`${basePath}/`)) return url;
  return `${basePath}${url}`;
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [showPlayer, setShowPlayer] = useState(true);
  // 预加载前 2 段音频的 audio 元素
  const preloadRefs = useRef<HTMLAudioElement[]>([]);

  const fetchBroadcast = useCallback(async () => {
    setLoading(true);
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${basePath}/api/broadcast/${id}`, { headers });
      const json = await res.json();

      if (json.success && json.data) {
        const found = json.data as Broadcast;
        setBroadcast(found);
        try {
          const rawSegs = typeof found.segments === 'string'
            ? JSON.parse(found.segments)
            : found.segments;
          setSegments(Array.isArray(rawSegs) ? rawSegs : []);
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

  // 预加载前两段音频，减少播放等待
  useEffect(() => {
    if (segments.length === 0) return;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // 最多预加载前 2 段
    const toPreload = segments.slice(0, 2);
    preloadRefs.current.forEach(a => { a.pause(); a.src = ''; });
    preloadRefs.current = [];

    toPreload.forEach((seg) => {
      if (seg.audio_url) {
        // 已有音频 URL，直接预加载
        const audio = new Audio(resolveAudioUrl(seg.audio_url, basePath));
        audio.preload = 'auto';
        preloadRefs.current.push(audio);
      } else if (seg.text) {
        // 需要先合成再预加载（静默后台）
        fetch(`${basePath}/api/tts/synthesize`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: seg.text.slice(0, 500), voice: broadcast?.voice_id || 'longwan_v3' }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.success && d.data?.url) {
              const audio = new Audio(resolveAudioUrl(d.data.url, basePath));
              audio.preload = 'auto';
              preloadRefs.current.push(audio);
            }
          })
          .catch(() => {});
      }
    });

    return () => {
      preloadRefs.current.forEach(a => { a.pause(); a.src = ''; });
    };
  }, [segments, broadcast?.voice_id]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatDateOnly = (value: string) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    try {
      return format(new Date(value), 'yyyy-MM-dd');
    } catch {
      return value;
    }
  };

  const langLabels: Record<string, string> = { zh: '中文', en: 'English', ja: '日本語' };

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
      <div className="mx-auto max-w-3xl" style={{ paddingBottom: showPlayer ? 140 : 0 }}>
        <button
          onClick={() => router.push('/broadcast')}
          className="mb-4 sm:mb-6 flex items-center gap-2 text-sm transition-colors hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          <ArrowLeft size={16} />
          返回播报列表
        </button>

        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {formatDateOnly(broadcast.broadcast_date)} 新闻播报
          </h1>
          <div
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm"
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

        {/* Play trigger（仅在关闭播放器后显示） */}
        {!showPlayer && (
          <div className="mb-6">
            <button
              onClick={() => setShowPlayer(true)}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-black transition-all hover:brightness-110"
              style={{ background: 'var(--accent)' }}
            >
              <Info size={16} />
              打开播放器
            </button>
          </div>
        )}

        {/* Segments */}
        <div className="mb-6 space-y-4">
          {segments.length > 0 ? (
            segments.map((seg, idx) => {
              const isActive = showPlayer && idx === activeSegmentIndex;
              return (
                <div
                  key={seg.index}
                  id={`segment-${idx}`}
                  className="rounded-xl border p-5 transition-all duration-300"
                  style={{
                    background: isActive ? 'rgba(0,255,157,0.06)' : 'var(--bg-secondary)',
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    borderLeftWidth: isActive ? 4 : 1,
                    borderLeftColor: isActive ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <h3
                    className="mb-3 text-sm font-semibold"
                    style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                  >
                    段落 {seg.index} {isActive && '▶ 正在播放'}
                  </h3>
                  <p
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {seg.text}
                  </p>
                </div>
              );
            })
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
      </div>

      {/* BroadcastPlayer 组件 */}
      {showPlayer && (
        <BroadcastPlayer
          script={broadcast.script}
          segments={segments}
          title={`${formatDateOnly(broadcast.broadcast_date)} 新闻播报`}
          voiceId={broadcast.voice_id || 'longshu_v3'}
          onSegmentChange={(index) => {
            setActiveSegmentIndex(index);
            const el = document.getElementById(`segment-${index}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onClose={() => {
            setShowPlayer(false);
            setActiveSegmentIndex(0);
          }}
        />
      )}
    </MainLayout>
  );
}
