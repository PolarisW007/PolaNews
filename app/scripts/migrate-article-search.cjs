const { Client } = require('pg');

function names(schema = 'public') {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid schema name');
  const prefix = `"${schema}".`;
  return { articles: prefix + 'articles', search: prefix + 'article_search_documents',
    fn: prefix + 'polanews_sync_article_search' };
}

function setupSql(schema = 'public') {
  const n = names(schema);
  return `CREATE TABLE IF NOT EXISTS ${n.search} (
    id uuid PRIMARY KEY REFERENCES ${n.articles}(id) ON DELETE CASCADE,
    feed_id uuid, title text NOT NULL, content text, published_at timestamptz
  );
  CREATE INDEX IF NOT EXISTS article_search_published_idx ON ${n.search}(published_at DESC);
  CREATE OR REPLACE FUNCTION ${n.fn}() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    INSERT INTO ${n.search}(id,feed_id,title,content,published_at)
    VALUES(NEW.id,NEW.feed_id,NEW.title,NEW.content,NEW.published_at)
    ON CONFLICT(id) DO UPDATE SET feed_id=EXCLUDED.feed_id,title=EXCLUDED.title,
      content=EXCLUDED.content,published_at=EXCLUDED.published_at;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS polanews_article_search_sync ON ${n.articles};
  CREATE TRIGGER polanews_article_search_sync
    AFTER INSERT OR UPDATE OF feed_id,title,content,published_at ON ${n.articles}
    FOR EACH ROW EXECUTE FUNCTION ${n.fn}();`;
}

async function backfillBatch(client, schema = 'public', cursor = null, batchSize = 500) {
  const n = names(schema);
  return (await client.query(`WITH batch AS MATERIALIZED (
    SELECT id,feed_id,title,content,published_at FROM ${n.articles}
    WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT $2 FOR KEY SHARE
  ), inserted AS (
    INSERT INTO ${n.search}(id,feed_id,title,content,published_at)
    SELECT id,feed_id,title,content,published_at FROM batch ON CONFLICT(id) DO NOTHING RETURNING 1
  ) SELECT (SELECT id FROM batch ORDER BY id DESC LIMIT 1) AS last_id,
    (SELECT COUNT(*) FROM batch)::int AS scanned,(SELECT COUNT(*) FROM inserted)::int AS inserted`,
  [cursor, batchSize])).rows[0];
}

async function verify(client, schema = 'public') {
  const n = names(schema);
  const started = Date.now();
  let cursor = null, sourceRows = 0, mismatches = 0;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    while (true) {
      if (Date.now() - started > 600000) throw new Error('Verification time budget exceeded');
      const result = (await client.query(`WITH batch AS MATERIALIZED (
        SELECT id,feed_id,title,content,published_at FROM ${n.articles}
        WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT 500
      ) SELECT (SELECT id FROM batch ORDER BY id DESC LIMIT 1) AS last_id,
        COUNT(*)::int AS scanned,
        COUNT(*) FILTER (WHERE s.id IS NULL OR ROW(s.feed_id,s.title,s.content,s.published_at)
          IS DISTINCT FROM ROW(a.feed_id,a.title,a.content,a.published_at))::int AS mismatches
        FROM batch a LEFT JOIN ${n.search} s ON s.id=a.id`, [cursor])).rows[0];
      if (!result.scanned) break;
      sourceRows += result.scanned; mismatches += result.mismatches; cursor = result.last_id;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const searchRows = (await client.query(`SELECT COUNT(*)::int AS n FROM ${n.search}`)).rows[0].n;
    await client.query('COMMIT');
    return { source_rows: sourceRows, search_rows: searchRows, mismatches };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}

function downSql(schema = 'public') {
  const n = names(schema);
  return `DROP TRIGGER IF EXISTS polanews_article_search_sync ON ${n.articles};
    DROP FUNCTION IF EXISTS ${n.fn}(); DROP TABLE IF EXISTS ${n.search};`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    console.log('Usage: node scripts/migrate-article-search.cjs [--apply | --verify | --down --apply]');
    return;
  }
  if ([...args].some(arg => !['--apply', '--verify', '--down'].includes(arg))) throw new Error('Unknown option');
  if (args.has('--down') && !args.has('--apply')) throw new Error('--down requires --apply');
  if (!args.has('--apply') && !args.has('--verify')) {
    console.log(JSON.stringify({ mode: 'plan', target: 'article_search_documents',
      batch_size: 500, delay_ms: 25, limit_minutes: 10, source_mutated: false }));
    return;
  }
  require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    application_name: 'polanews-search-migration', connectionTimeoutMillis: 3000,
    statement_timeout: 20000, query_timeout: 25000 });
  await client.connect();
  try {
    await client.query("SET lock_timeout = '2s'");
    if (args.has('--apply')) {
      await client.query('BEGIN');
      try {
        await client.query(args.has('--down') ? downSql() : setupSql());
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      if (args.has('--down')) { console.log(JSON.stringify({ mode: 'down', source_mutated: false })); return; }
      const started = Date.now();
      let cursor = null, scanned = 0, batches = 0, retries = 0;
      while (true) {
        if (Date.now() - started > 600000) throw new Error('Backfill time budget exceeded; rerun is safe');
        let row;
        try { row = await backfillBatch(client, 'public', cursor); retries = 0; }
        catch (error) {
          if (['40P01', '55P03'].includes(error.code) && retries++ < 3) {
            await new Promise(resolve => setTimeout(resolve, 250)); continue;
          }
          throw error;
        }
        if (!row.scanned) break;
        cursor = row.last_id; scanned += row.scanned; batches++;
        if (batches % 20 === 0) console.log(JSON.stringify({ batches, scanned }));
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await client.query('ANALYZE public.article_search_documents');
      console.log(JSON.stringify({ mode: 'apply', batches, scanned, elapsed_ms: Date.now() - started }));
    }
    const result = await verify(client);
    console.log(JSON.stringify({ mode: 'verify', ...result }));
    if (result.source_rows !== result.search_rows || result.mismatches) process.exitCode = 1;
  } finally { await client.end(); }
}

module.exports = { setupSql, backfillBatch, verify, downSql };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ error: error.code || error.constructor.name,
    message: 'Search migration failed; source articles retained' })); process.exitCode = 1;
});
