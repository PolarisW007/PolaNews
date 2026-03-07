import { v4 as uuid } from 'uuid';
import { execute } from '../db/schema';

export interface PresetFeed {
  title: string;
  url: string;
  site_url: string;
  language: string;
  category: string;
}

export const PRESET_FEEDS: PresetFeed[] = [
  // 国际
  {
    title: 'BBC World',
    url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    site_url: 'https://www.bbc.com/news',
    language: 'en',
    category: 'international',
  },
  {
    title: 'CNN',
    url: 'http://rss.cnn.com/rss/edition.rss',
    site_url: 'https://edition.cnn.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    site_url: 'https://www.aljazeera.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'Reuters',
    url: 'https://www.reutersagency.com/feed/',
    site_url: 'https://www.reuters.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'The Guardian',
    url: 'https://www.theguardian.com/world/rss',
    site_url: 'https://www.theguardian.com',
    language: 'en',
    category: 'international',
  },
  // 科技
  {
    title: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    site_url: 'https://techcrunch.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    site_url: 'https://www.theverge.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    site_url: 'https://arstechnica.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    site_url: 'https://news.ycombinator.com',
    language: 'en',
    category: 'tech',
  },
  // AI
  {
    title: 'OpenAI Blog',
    url: 'https://openai.com/blog/rss.xml',
    site_url: 'https://openai.com/blog',
    language: 'en',
    category: 'ai',
  },
  {
    title: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    site_url: 'https://blog.google/technology/ai',
    language: 'en',
    category: 'ai',
  },
  // 中文
  {
    title: '少数派',
    url: 'https://sspai.com/feed',
    site_url: 'https://sspai.com',
    language: 'zh',
    category: 'general',
  },
  // 国际综合
  {
    title: 'AP News',
    url: 'https://apnews.com/index.rss',
    site_url: 'https://apnews.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'France 24',
    url: 'https://www.france24.com/en/rss',
    site_url: 'https://www.france24.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'NBC News',
    url: 'http://feeds.nbcnews.com/nbcnews/public/news',
    site_url: 'https://www.nbcnews.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'ABC News',
    url: 'https://abcnews.go.com/abcnews/internationalheadlines',
    site_url: 'https://abcnews.go.com',
    language: 'en',
    category: 'international',
  },
  // 科技
  {
    title: 'MIT Tech Review',
    url: 'https://www.technologyreview.com/feed/',
    site_url: 'https://www.technologyreview.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'InfoQ',
    url: 'https://www.infoq.com/feed/',
    site_url: 'https://www.infoq.com',
    language: 'en',
    category: 'tech',
  },
  // 财经
  {
    title: 'WSJ',
    url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
    site_url: 'https://www.wsj.com',
    language: 'en',
    category: 'finance',
  },
  // AI/开发者
  {
    title: 'GitHub Blog',
    url: 'https://github.blog/feed/',
    site_url: 'https://github.blog',
    language: 'en',
    category: 'ai',
  },
  {
    title: 'Dev.to',
    url: 'https://dev.to/feed/',
    site_url: 'https://dev.to',
    language: 'en',
    category: 'ai',
  },
  // 政治/地缘
  {
    title: 'Foreign Affairs',
    url: 'https://www.foreignaffairs.com/rss.xml',
    site_url: 'https://www.foreignaffairs.com',
    language: 'en',
    category: 'politics',
  },
  // 更多国际
  {
    title: 'Politico',
    url: 'https://rss.politico.com/rss/politico44.xml',
    site_url: 'https://www.politico.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'NPR',
    url: 'https://feeds.npr.org/1001/rss.xml',
    site_url: 'https://www.npr.org',
    language: 'en',
    category: 'international',
  },
  {
    title: 'DW',
    url: 'https://rss.dw.com/xml/rss-en-world',
    site_url: 'https://www.dw.com',
    language: 'en',
    category: 'international',
  },
  // 更多科技
  {
    title: 'Wired',
    url: 'https://www.wired.com/feed/rss',
    site_url: 'https://www.wired.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'VentureBeat',
    url: 'https://venturebeat.com/feed/',
    site_url: 'https://venturebeat.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'ZDNet',
    url: 'https://www.zdnet.com/news/rss.xml',
    site_url: 'https://www.zdnet.com',
    language: 'en',
    category: 'tech',
  },
  // 更多财经
  {
    title: 'CNBC',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    site_url: 'https://www.cnbc.com',
    language: 'en',
    category: 'finance',
  },
  {
    title: 'Reuters Business',
    url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
    site_url: 'https://www.reuters.com/business',
    language: 'en',
    category: 'finance',
  },
  // 更多 AI
  {
    title: 'Anthropic',
    url: 'https://www.anthropic.com/feed',
    site_url: 'https://www.anthropic.com',
    language: 'en',
    category: 'ai',
  },
  {
    title: 'Microsoft Dev Blog',
    url: 'https://devblogs.microsoft.com/feed/',
    site_url: 'https://devblogs.microsoft.com',
    language: 'en',
    category: 'ai',
  },
  // 更多政治
  {
    title: 'The Economist',
    url: 'https://www.economist.com/weeklyedition/rss.xml',
    site_url: 'https://www.economist.com',
    language: 'en',
    category: 'politics',
  },
  {
    title: 'The Hill',
    url: 'https://thehill.com/feed/',
    site_url: 'https://thehill.com',
    language: 'en',
    category: 'politics',
  },
  // 社会/文化
  {
    title: 'NYT World',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    site_url: 'https://www.nytimes.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'Washington Post',
    url: 'https://feeds.washingtonpost.com/rss/world',
    site_url: 'https://www.washingtonpost.com',
    language: 'en',
    category: 'international',
  },
  {
    title: 'The Register',
    url: 'https://www.theregister.com/security/headlines.atom',
    site_url: 'https://www.theregister.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'Engadget',
    url: 'https://www.engadget.com/rss.xml',
    site_url: 'https://www.engadget.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'Mashable',
    url: 'https://mashable.com/feed/',
    site_url: 'https://mashable.com',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'Reuters Tech',
    url: 'https://www.reutersagency.com/feed/?best-sectors=technology',
    site_url: 'https://www.reuters.com/technology',
    language: 'en',
    category: 'tech',
  },
  {
    title: 'BBC Technology',
    url: 'http://feeds.bbci.co.uk/news/technology/rss.xml',
    site_url: 'https://www.bbc.com/news/technology',
    language: 'en',
    category: 'tech',
  },
];

export async function seedPresetFeeds(): Promise<void> {
  for (const feed of PRESET_FEEDS) {
    await execute(
      `INSERT INTO feeds (id, title, url, site_url, language, category, status, is_preset)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', TRUE)
       ON CONFLICT (url) DO NOTHING`,
      [uuid(), feed.title, feed.url, feed.site_url, feed.language, feed.category]
    );
  }
}
