const BASE_URL = process.env.NEXT_PUBLIC_BASE_PATH || '';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = `${BASE_URL}/login`;
    }
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data.data;
}

export const api = {
  auth: {
    register: (email: string, password: string, display_name: string) =>
      request<{ user: unknown; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, display_name }),
      }),
    login: (email: string, password: string) =>
      request<{ user: unknown; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request('/api/auth/me'),
  },
  feeds: {
    list: () => request('/api/feeds'),
    fetch: (feed_id?: string) =>
      request('/api/feeds/fetch', {
        method: 'POST',
        body: JSON.stringify(feed_id ? { feed_id, fetch_only: true } : { retry_errored: true, fetch_only: true }),
      }),
    add: (url: string, title: string, category: string) =>
      request('/api/feeds', { method: 'POST', body: JSON.stringify({ url, title, category }) }),
    delete: (feed_id: string) =>
      request('/api/feeds', { method: 'DELETE', body: JSON.stringify({ feed_id }) }),
  },
  articles: {
    list: (params: Record<string, string | number> = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
      return request(`/api/articles?${qs.toString()}`);
    },
    get: (id: string) => request(`/api/articles/${id}`),
    search: (params: Record<string, string | number> = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
      return request(`/api/articles/search?${qs.toString()}`);
    },
    summarize: (id: string, lang: string = 'zh') =>
      request(`/api/articles/${id}/summarize`, {
        method: 'POST',
        body: JSON.stringify({ lang }),
      }),
    star: (id: string) =>
      request<{ is_starred: boolean }>(`/api/articles/${id}/star`, { method: 'POST' }),
    save: (id: string) =>
      request<{ is_saved: boolean }>(`/api/articles/${id}/save`, { method: 'POST' }),
    markRead: (id: string) =>
      request(`/api/articles/${id}/read`, { method: 'POST' }),
    translate: (id: string) =>
      request<{ paragraphs: { original: string; translated: string }[] }>(
        `/api/articles/${id}/translate`,
        { method: 'POST' }
      ),
    getTranslation: (id: string) =>
      request<{ paragraphs: { original: string; translated: string }[] }>(
        `/api/articles/${id}/translate`
      ),
    batchTranslate: (limit = 50) =>
      request('/api/articles/translate', {
        method: 'POST',
        body: JSON.stringify({ limit }),
      }),
    fulltext: (id: string) =>
      request(`/api/articles/${id}/fulltext`, { method: 'POST' }),
  },
  digests: {
    list: (page = 1, limit = 10) =>
      request(`/api/digests?page=${page}&limit=${limit}`),
    latest: (lang = 'zh', date?: string) => {
      const qs = new URLSearchParams({ lang });
      if (date) qs.set('date', date);
      return request(`/api/digests/latest?${qs.toString()}`);
    },
    generate: (lang = 'zh') =>
      request('/api/digests/generate', { method: 'POST', body: JSON.stringify({ lang }) }),
    export: (id: string, format: 'markdown' | 'pdf' = 'markdown') =>
      request(`/api/digests/${id}/export?format=${format}`),
  },
  subscriptions: {
    list: () => request('/api/subscriptions'),
    add: (feed_id: string, group_name = '', custom_label = '') =>
      request('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ feed_id, group_name, custom_label }),
      }),
    remove: (subscription_id: string) =>
      request('/api/subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({ subscription_id }),
      }),
  },
  settings: {
    get: () => request('/api/settings'),
    update: (data: Record<string, unknown>) =>
      request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },
  starred: {
    list: (params: Record<string, string | number> = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
      return request(`/api/starred?${qs.toString()}`);
    },
    remove: (article_id: string) =>
      request('/api/starred', { method: 'DELETE', body: JSON.stringify({ article_id }) }),
  },
  saved: {
    list: (params: Record<string, string | number> = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
      return request(`/api/saved?${qs.toString()}`);
    },
    remove: (article_id: string) =>
      request('/api/saved', { method: 'DELETE', body: JSON.stringify({ article_id }) }),
  },
  history: {
    list: (page = 1, limit = 20) =>
      request(`/api/history?page=${page}&limit=${limit}`),
  },
  broadcasts: {
    list: (page = 1, limit = 20) =>
      request(`/api/broadcast/list?page=${page}&limit=${limit}`),
    get: (id: string) => request(`/api/broadcast/${id}`),
    latest: (lang = 'zh') =>
      request(`/api/broadcast/latest?lang=${lang}`),
    generate: (lang = 'zh', voice = 'longshu_v3') =>
      request('/api/broadcast/generate', {
        method: 'POST',
        body: JSON.stringify({ lang, voice }),
      }),
    articleTTS: (articleId: string, voice = 'longshu_v3') =>
      request(`/api/broadcast/article/${articleId}`, {
        method: 'POST',
        body: JSON.stringify({ voice }),
      }),
  },
  trending: {
    get: () => request('/api/trending'),
    timeline: (topic: string) => request(`/api/trending/${encodeURIComponent(topic)}/timeline`),
  },
  analytics: {
    sentiment: (topic: string, days?: number) => {
      const qs = new URLSearchParams({ topic });
      if (days) qs.set('days', String(days));
      return request(`/api/analytics/sentiment?${qs.toString()}`);
    },
  },
  tts: {
    voices: () => request('/api/tts/voices'),
  },
  push: {
    vapidKey: () => request('/api/push/vapid'),
    subscribe: (sub: { endpoint: string; p256dh: string; auth: string }) =>
      request('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
    unsubscribe: (endpoint: string) =>
      request('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  },
  shares: {
    list: (page = 1, limit = 20, platform = '') => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (platform) qs.set('platform', platform);
      return request(`/api/share/list?${qs.toString()}`);
    },
    generate: (platform: string, digest_id?: string, article_id?: string, lang = 'zh') =>
      request('/api/share/generate', {
        method: 'POST',
        body: JSON.stringify({ platform, digest_id, article_id, lang }),
      }),
  },
};
