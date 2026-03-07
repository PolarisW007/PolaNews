import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'worldoverview.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase(db);
  }
  return db;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      preferences TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      site_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      language TEXT DEFAULT 'en',
      category TEXT DEFAULT 'general',
      favicon_url TEXT DEFAULT '',
      last_fetched_at TEXT,
      fetch_interval INTEGER DEFAULT 30,
      etag TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      error_count INTEGER DEFAULT 0,
      is_preset INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      feed_id TEXT REFERENCES feeds(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      author TEXT DEFAULT '',
      content TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      ai_summary TEXT DEFAULT '',
      ai_key_points TEXT DEFAULT '[]',
      ai_summary_en TEXT DEFAULT '',
      ai_summary_ja TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      published_at TEXT,
      categories TEXT DEFAULT '{}',
      importance TEXT DEFAULT 'normal',
      sentiment TEXT DEFAULT 'neutral',
      region TEXT DEFAULT 'global',
      keywords TEXT DEFAULT '[]',
      is_duplicate INTEGER DEFAULT 0,
      duplicate_of TEXT,
      title_zh TEXT DEFAULT '',
      summary_zh TEXT DEFAULT '',
      translation_zh TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      feed_id TEXT REFERENCES feeds(id) ON DELETE CASCADE,
      custom_label TEXT DEFAULT '',
      group_name TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, feed_id)
    );

    CREATE TABLE IF NOT EXISTS user_article_states (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
      is_read INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      is_saved INTEGER DEFAULT 0,
      read_at TEXT,
      folder TEXT DEFAULT '',
      UNIQUE(user_id, article_id)
    );

    CREATE TABLE IF NOT EXISTS daily_digests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      digest_date TEXT NOT NULL,
      language TEXT DEFAULT 'zh',
      headlines TEXT DEFAULT '[]',
      category_summaries TEXT DEFAULT '{}',
      statistics TEXT DEFAULT '{}',
      trending_keywords TEXT DEFAULT '[]',
      full_content TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      digest_id TEXT,
      broadcast_date TEXT,
      language TEXT DEFAULT 'zh',
      script TEXT,
      segments TEXT DEFAULT '[]',
      total_duration_ms INTEGER DEFAULT 0,
      voice_id TEXT DEFAULT 'default',
      status TEXT DEFAULT 'ready',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS social_shares (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      digest_id TEXT,
      article_id TEXT,
      platform TEXT,
      title TEXT,
      content TEXT,
      cover_url TEXT DEFAULT '',
      images TEXT DEFAULT '[]',
      language TEXT DEFAULT 'zh',
      template_id TEXT DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_importance ON articles(importance);
    CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
    CREATE INDEX IF NOT EXISTS idx_articles_title_zh ON articles(title_zh) WHERE title_zh IS NULL OR title_zh = '';
    CREATE INDEX IF NOT EXISTS idx_articles_categories ON articles(categories) WHERE categories = '{}' OR categories IS NULL OR categories = '';
    CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_subs_feed ON user_subscriptions(feed_id);
    CREATE INDEX IF NOT EXISTS idx_user_states_user ON user_article_states(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_states_user_read ON user_article_states(user_id, is_read) WHERE is_read = 1;
    CREATE INDEX IF NOT EXISTS idx_user_states_user_saved ON user_article_states(user_id, is_saved) WHERE is_saved = 1;
    CREATE INDEX IF NOT EXISTS idx_user_states_user_starred ON user_article_states(user_id, is_starred) WHERE is_starred = 1;
    CREATE INDEX IF NOT EXISTS idx_user_states_article ON user_article_states(article_id);
    CREATE INDEX IF NOT EXISTS idx_digests_date ON daily_digests(digest_date DESC);
    CREATE INDEX IF NOT EXISTS idx_digests_lang_date ON daily_digests(language, digest_date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_lang ON broadcasts(language, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_social_shares_created_at ON social_shares(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_social_shares_platform ON social_shares(platform);
    CREATE INDEX IF NOT EXISTS idx_feeds_status ON feeds(status);
  `);

  const cols = db.prepare("PRAGMA table_info(articles)").all() as { name: string }[];
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('title_zh')) {
    db.exec("ALTER TABLE articles ADD COLUMN title_zh TEXT DEFAULT ''");
  }
  if (!colNames.has('summary_zh')) {
    db.exec("ALTER TABLE articles ADD COLUMN summary_zh TEXT DEFAULT ''");
  }
}
