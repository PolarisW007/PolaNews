'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Globe,
  Cpu,
  TrendingUp,
  Landmark,
  Bot,
  Shield,
  Users,
  Palette,
  Trophy,
  HeartPulse,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { api } from '@/lib/api-client';

interface CategoryItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

const CATEGORIES: CategoryItem[] = [
  { key: 'international', label: '国际', icon: <Globe size={28} /> },
  { key: 'tech', label: '科技', icon: <Cpu size={28} /> },
  { key: 'finance', label: '财经', icon: <TrendingUp size={28} /> },
  { key: 'politics', label: '政治', icon: <Landmark size={28} /> },
  { key: 'ai', label: 'AI / ML', icon: <Bot size={28} /> },
  { key: 'military', label: '军事', icon: <Shield size={28} /> },
  { key: 'society', label: '社会', icon: <Users size={28} /> },
  { key: 'culture', label: '文化', icon: <Palette size={28} /> },
  { key: 'sports', label: '体育', icon: <Trophy size={28} /> },
  { key: 'health', label: '健康', icon: <HeartPulse size={28} /> },
  { key: 'general', label: '综合', icon: <LayoutGrid size={28} /> },
];

export default function CategoriesPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const results: Record<string, number> = {};
      await Promise.all(
        CATEGORIES.map(async (cat) => {
          try {
            const data = await api.articles.list({ category: cat.key, limit: 1 }) as { total: number };
            results[cat.key] = data.total ?? 0;
          } catch {
            results[cat.key] = 0;
          }
        })
      );
      if (!cancelled) {
        setCounts(results);
        setLoading(false);
      }
    }

    fetchCounts();
    return () => { cancelled = true; };
  }, []);

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto animate-fade-in">
        <div className="flex items-center gap-3 mb-8">
          <LayoutGrid size={24} style={{ color: 'var(--accent)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            全部分类
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {CATEGORIES.map(cat => (
              <Link key={cat.key} href={`/category/${cat.key}`}>
                <div
                  className="rounded-xl p-6 glow-border cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: 'rgba(0,230,118,0.08)', color: 'var(--accent)' }}
                  >
                    {cat.icon}
                  </div>
                  <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    {cat.label}
                  </h3>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {counts[cat.key] !== undefined ? `${counts[cat.key]} 篇文章` : '—'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
