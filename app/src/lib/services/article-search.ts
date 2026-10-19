import { Pool, type PoolClient } from 'pg';
import { getPool } from '../db/schema';
import { rowToArticle } from '../db/helpers';

let pool: Pool | undefined;
let active = 0;

export class SearchUnavailableError extends Error {
  constructor() { super('Search temporarily unavailable'); }
}

function getSearchPool(): Pool {
  if (!pool) {
    pool = new Pool({
      ...getPool().options,
      max: 2,
      application_name: 'polanews-search',
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
      query_timeout: 6500,
    });
    pool.on('error', () => console.warn('[Search] Idle database connection closed'));
  }
  return pool;
}

function extractSnippet(text: string, q: string, radius = 80): string {
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + q.length + radius);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
}

export async function searchArticles(q: string, page: number, limit: number) {
  if (active >= 2) throw new SearchUnavailableError();
  active++;
  let client: PoolClient | undefined;
  try {
    client = await getSearchPool().connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query('SET LOCAL max_parallel_workers_per_gather = 0');
    const readiness = await client.query("SELECT to_regclass('article_search_documents') IS NOT NULL AS ready");
    const relation = readiness.rows[0]?.ready ? 'article_search_documents' : 'articles';
    const pattern = `%${q}%`;
    const count = await client.query(
      `SELECT COUNT(*) AS total FROM ${relation} s INNER JOIN feeds f ON s.feed_id = f.id
       WHERE s.title LIKE $1 OR s.content LIKE $2`, [pattern, pattern],
    );
    // Materialize only the requested page before joining back to the wide rows.
    const rows = await client.query(
      `WITH matches AS MATERIALIZED (
         SELECT s.id, s.published_at FROM ${relation} s INNER JOIN feeds f ON s.feed_id = f.id
         WHERE s.title LIKE $1 OR s.content LIKE $2
         ORDER BY s.published_at DESC LIMIT $3 OFFSET $4
       )
       SELECT a.*, f.title AS feed_title, f.favicon_url AS feed_favicon
       FROM matches m INNER JOIN articles a ON a.id = m.id INNER JOIN feeds f ON a.feed_id = f.id
       ORDER BY m.published_at DESC`, [pattern, pattern, limit, (page - 1) * limit],
    );
    const articles = rows.rows.map(row => ({
      ...rowToArticle(row), snippet: extractSnippet(row.content || row.title || '', q),
    }));
    await client.query('COMMIT');
    client.release();
    client = undefined;
    return { articles, total: Number(count.rows[0].total), page, limit };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'QUERY_FAILED';
    console.warn('[Search] Query failed', /^[A-Z0-9_]{1,30}$/.test(code) ? code : 'QUERY_FAILED');
    // Closing the connection rolls back even after cancellation or protocol errors.
    client?.release(new Error('Search transaction failed'));
    throw new SearchUnavailableError();
  } finally {
    active--;
  }
}
