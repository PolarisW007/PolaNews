export interface User {
  id: string;
  email: string;
  password_hash?: string;
  display_name: string;
  avatar_url: string;
  preferences: UserPreferences;
  created_at: string;
  last_login_at: string;
}

export interface UserPreferences {
  language: 'zh' | 'en' | 'ja';
  digest_language?: 'zh' | 'en' | 'ja';
  theme: 'dark' | 'light' | 'system';
  digest_time: string[];
  categories: string[];
}

export interface Feed {
  id: string;
  title: string;
  url: string;
  site_url: string;
  description: string;
  language: string;
  category: string;
  favicon_url: string;
  last_fetched_at: string | null;
  fetch_interval: number;
  etag: string;
  status: 'active' | 'error' | 'paused';
  error_count: number;
  is_preset: boolean;
}

export interface Article {
  id: string;
  feed_id: string;
  title: string;
  url: string;
  author: string;
  content: string;
  summary: string;
  ai_summary: string;
  ai_key_points: string[];
  ai_summary_en: string;
  ai_summary_ja: string;
  cover_image: string;
  published_at: string;
  categories: ArticleCategories;
  importance: 'breaking' | 'important' | 'normal' | 'low';
  sentiment: 'positive' | 'neutral' | 'negative';
  region: string;
  keywords: string[];
  is_duplicate: boolean;
  duplicate_of: string | null;
  created_at: string;
  title_zh?: string;
  summary_zh?: string;
  feed_title?: string;
  feed_favicon?: string;
  is_read?: boolean;
  is_starred?: boolean;
  is_saved?: boolean;
}

export interface ArticleCategories {
  topic: string;
  region: string;
  importance: string;
  sentiment: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  feed_id: string;
  custom_label: string;
  group_name: string;
  created_at: string;
  feed?: Feed;
}

export interface DailyDigest {
  id: string;
  user_id: string | null;
  digest_date: string;
  language: string;
  headlines: DigestHeadline[];
  category_summaries: Record<string, DigestCategorySummary>;
  statistics: DigestStatistics;
  trending_keywords: string[];
  full_content: string;
  created_at: string;
}

export interface DigestHeadline {
  title: string;
  summary: string;
  article_id: string;
  importance: string;
  category: string;
}

export interface DigestCategorySummary {
  count: number;
  items: { title: string; summary: string; article_id: string }[];
}

export interface DigestStatistics {
  total_articles: number;
  source_count: number;
  top_keywords: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type ArticleFilter = {
  category?: string;
  importance?: string;
  region?: string;
  sentiment?: string;
  feed_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
};

export interface Broadcast {
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

export interface SocialShare {
  id: string;
  user_id: string;
  digest_id: string;
  article_id: string;
  platform: string;
  title: string;
  content: string;
  cover_url: string;
  images: string;
  language: string;
  template_id: string;
  created_at: string;
}
