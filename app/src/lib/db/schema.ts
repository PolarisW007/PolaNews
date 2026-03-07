import { Pool, PoolClient } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/worldoverview';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 20 });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const p = getPool();
  const result = await p.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const p = getPool();
  const result = await p.query(sql, params);
  return result.rowCount ?? 0;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

let initialized = false;

export async function initializeDatabase(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await execute(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  } catch {
    console.warn('[DB] pgcrypto extension not available or insufficient privileges (pre-installed by admin is fine)');
  }
  try {
    await execute(`CREATE EXTENSION IF NOT EXISTS "vector"`);
  } catch {
    console.warn('[DB] pgvector extension not available, semantic search will be disabled');
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(100) DEFAULT '',
      avatar_url TEXT DEFAULT '',
      preferences JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS feeds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      url TEXT UNIQUE NOT NULL,
      site_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      language VARCHAR(10) DEFAULT 'en',
      category VARCHAR(50) DEFAULT 'general',
      favicon_url TEXT DEFAULT '',
      last_fetched_at TIMESTAMPTZ,
      fetch_interval INTEGER DEFAULT 30,
      etag VARCHAR(255) DEFAULT '',
      status VARCHAR(20) DEFAULT 'active',
      error_count INTEGER DEFAULT 0,
      is_preset BOOLEAN DEFAULT FALSE
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feed_id UUID REFERENCES feeds(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      author VARCHAR(255) DEFAULT '',
      content TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      ai_summary TEXT DEFAULT '',
      ai_key_points JSONB DEFAULT '[]',
      ai_summary_en TEXT DEFAULT '',
      ai_summary_ja TEXT DEFAULT '',
      cover_image TEXT DEFAULT '',
      published_at TIMESTAMPTZ,
      categories JSONB DEFAULT '{}',
      importance VARCHAR(20) DEFAULT 'normal',
      sentiment VARCHAR(20) DEFAULT 'neutral',
      region VARCHAR(50) DEFAULT 'global',
      keywords TEXT[] DEFAULT '{}',
      is_duplicate BOOLEAN DEFAULT FALSE,
      duplicate_of UUID,
      title_zh TEXT DEFAULT '',
      summary_zh TEXT DEFAULT '',
      translation_zh JSONB DEFAULT '[]',
      full_content TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    await execute(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS embedding vector(1536)`);
  } catch {
    console.warn('[DB] Could not add embedding column (pgvector may not be installed)');
  }

  await execute(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      feed_id UUID REFERENCES feeds(id) ON DELETE CASCADE,
      custom_label VARCHAR(100) DEFAULT '',
      group_name VARCHAR(100) DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, feed_id)
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS user_article_states (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
      is_read BOOLEAN DEFAULT FALSE,
      is_starred BOOLEAN DEFAULT FALSE,
      is_saved BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      folder VARCHAR(100) DEFAULT '',
      UNIQUE(user_id, article_id)
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS daily_digests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      digest_date DATE NOT NULL,
      language VARCHAR(10) DEFAULT 'zh',
      headlines JSONB DEFAULT '[]',
      category_summaries JSONB DEFAULT '{}',
      statistics JSONB DEFAULT '{}',
      trending_keywords TEXT[] DEFAULT '{}',
      full_content TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      digest_id UUID,
      broadcast_date DATE,
      language VARCHAR(10) DEFAULT 'zh',
      script TEXT,
      segments JSONB DEFAULT '[]',
      total_duration_ms INTEGER DEFAULT 0,
      voice_id VARCHAR(50) DEFAULT 'default',
      status VARCHAR(20) DEFAULT 'ready',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS social_shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      digest_id UUID,
      article_id UUID,
      platform VARCHAR(20),
      title TEXT,
      content TEXT,
      cover_url TEXT DEFAULT '',
      images JSONB DEFAULT '[]',
      slides JSONB DEFAULT '[]',
      language VARCHAR(10) DEFAULT 'zh',
      template_id VARCHAR(50) DEFAULT 'default',
      image_status VARCHAR(20) DEFAULT 'ready',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    )
  `);

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id)',
    'CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_articles_importance ON articles(importance)',
    'CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url)',
    'CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_subs_feed ON user_subscriptions(feed_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_states_user ON user_article_states(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_user_states_article ON user_article_states(article_id)',
    'CREATE INDEX IF NOT EXISTS idx_digests_date ON daily_digests(digest_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_digests_lang_date ON daily_digests(language, digest_date DESC, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_social_shares_created_at ON social_shares(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_social_shares_platform ON social_shares(platform)',
    'CREATE INDEX IF NOT EXISTS idx_feeds_status ON feeds(status)',
    'CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)',
  ];

  for (const idx of indexes) {
    await execute(idx);
  }

  console.log('[DB] PostgreSQL schema initialized');
}
