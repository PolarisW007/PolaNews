'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, ExternalLink, Copy, Check } from 'lucide-react';

interface ShareData {
  id: string;
  platform: string;
  title: string;
  content: string;
  cover_url: string;
  images: string;
  language: string;
  created_at: string;
  article_title?: string;
  article_url?: string;
  article_cover?: string;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function PublicSharePage() {
  const { id } = useParams();
  const [share, setShare] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${basePath}/api/share/${id}`);
        const data = await res.json();
        if (data.success) setShare(data.data);
        else setError(data.error || '加载失败');
      } catch {
        setError('网络错误');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleCopy = async () => {
    if (!share) return;
    await navigator.clipboard.writeText(share.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const platformLabel: Record<string, string> = {
    xiaohongshu: '小红书',
    wechat_moments: '朋友圈',
    x: 'X (Twitter)',
  };

  const platformColor: Record<string, string> = {
    xiaohongshu: '#fe2c55',
    wechat_moments: '#07c160',
    x: '#1da1f2',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0a0f0d' }}>
        <Loader2 style={{ animation: 'spin 1s linear infinite', color: '#00ff88', width: 48, height: 48 }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#0a0f0d', color: '#ff4444', fontFamily: 'system-ui' }}>
        <p>{error || '内容不存在'}</p>
      </div>
    );
  }

  let images: Array<{ url: string }> = [];
  try {
    if (share.images) images = JSON.parse(share.images);
  } catch { /* ignore */ }

  const coverImage = share.cover_url || share.article_cover || (images.length > 0 ? images[0].url : '');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0f0d 0%, #0d1a14 50%, #0a0f0d 100%)', fontFamily: "'Inter', 'Noto Sans SC', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>

        <div style={{
          background: 'rgba(15, 25, 20, 0.9)',
          border: '1px solid rgba(0, 255, 136, 0.15)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>

          {coverImage && (
            <div style={{ width: '100%', maxHeight: 400, overflow: 'hidden' }}>
              <img
                src={coverImage.startsWith('/') ? coverImage : coverImage}
                alt="cover"
                style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
              />
            </div>
          )}

          <div style={{ padding: '32px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{
                display: 'inline-block',
                padding: '4px 14px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: platformColor[share.platform] || '#00ff88',
              }}>
                {platformLabel[share.platform] || share.platform}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                {new Date(share.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>

            <h1 style={{ color: '#e8f5e9', fontSize: 24, fontWeight: 700, lineHeight: 1.4, margin: '0 0 24px 0' }}>
              {share.title}
            </h1>

            <div style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: 16,
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {share.content}
            </div>

            {share.article_url && (
              <a
                href={share.article_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 24,
                  padding: '10px 20px',
                  borderRadius: 8,
                  background: 'rgba(0, 255, 136, 0.1)',
                  border: '1px solid rgba(0, 255, 136, 0.3)',
                  color: '#00ff88',
                  fontSize: 14,
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
              >
                <ExternalLink size={16} /> 阅读原文
              </a>
            )}

            {images.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 24 }}>
                {images.slice(1).map((img, i) => (
                  <img key={i} src={img.url} alt={`img-${i}`} style={{ width: '100%', borderRadius: 8 }} />
                ))}
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 28px',
            borderTop: '1px solid rgba(0, 255, 136, 0.1)',
            background: 'rgba(0, 255, 136, 0.03)',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              一念三千 · 全球资讯AI聚合
            </span>
            <button
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid rgba(0, 255, 136, 0.3)',
                background: copied ? 'rgba(0, 255, 136, 0.2)' : 'transparent',
                color: '#00ff88',
                cursor: 'pointer',
                fontSize: 13,
                transition: 'all 0.2s',
              }}
            >
              {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制文案</>}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a
            href={`${basePath}/`}
            style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textDecoration: 'none' }}
          >
            Powered by 一念三千
          </a>
        </div>
      </div>
    </div>
  );
}
