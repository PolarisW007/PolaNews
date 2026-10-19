const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client, Pool } = require('pg');
const migration = require('./migrate-article-search.cjs');
const { loadSearch, helpers } = require('./harness-article-search.cjs');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated schema fixtures');
  const schema = 'polanews_search_test_' + crypto.randomBytes(8).toString('hex');
  const prefix = `"${schema}".`;
  const base = { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000,
    statement_timeout: 10000, options: '-c search_path=' + schema };
  const admin = new Client(base), writer = new Client(base);
  const pools = [];
  class FixturePool extends Pool { constructor(options) { super(options); pools.push(this); } }
  const api = loadSearch(FixturePool, base);
  const article = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const feed = article(999);
  let created = false, cases = 0;
  await admin.connect(); await writer.connect();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
    await admin.query(`CREATE TABLE ${prefix}feeds(id uuid PRIMARY KEY,title text,favicon_url text);
      CREATE TABLE ${prefix}articles(id uuid PRIMARY KEY,feed_id uuid REFERENCES ${prefix}feeds(id) ON DELETE CASCADE,
      title text NOT NULL,content text,published_at timestamptz,summary text DEFAULT '',created_at timestamptz DEFAULT now());`);
    await admin.query(`INSERT INTO ${prefix}feeds VALUES($1,'Fixture feed','')`, [feed]);
    for (const [n, title, content] of [[1, 'AI title', 'long AI text'], [2, '中文主题', '中文正文'],
      [3, 'Percent % and underscore _', null], [4, "A quote ' test", 'lowercase ai']]) {
      await admin.query(`INSERT INTO ${prefix}articles(id,feed_id,title,content,published_at) VALUES($1,$2,$3,$4,$5)`,
        [article(n), feed, title, content, new Date(Date.UTC(2026, 9, n))]);
    }
    await admin.query(migration.setupSql(schema));
    // A newer trigger-synchronized value must survive a later backfill pass.
    await writer.query(`UPDATE ${prefix}articles SET content='new AI content' WHERE id=$1`, [article(2)]);
    let cursor = null;
    while (true) { const row = await migration.backfillBatch(admin, schema, cursor, 2); if (!row.scanned) break; cursor = row.last_id; }
    assert.deepEqual(await migration.verify(admin, schema), { source_rows: 4, search_rows: 4, mismatches: 0 }); cases++;
    await admin.query(migration.setupSql(schema));
    assert.equal((await migration.backfillBatch(admin, schema, null, 10)).inserted, 0); cases++;

    const gate = String(crypto.randomInt(1000000000, 2000000000));
    const backfiller = new Client({ ...base, application_name: 'polanews-backfill-test' });
    await backfiller.connect();
    let pending;
    try {
      await admin.query(`DELETE FROM ${prefix}article_search_documents WHERE id=$1`, [article(1)]);
      await admin.query(`CREATE FUNCTION ${prefix}pause_test_backfill() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('application_name')='polanews-backfill-test' THEN
          PERFORM pg_advisory_xact_lock(${gate}); END IF; RETURN NEW; END $$;
        CREATE TRIGGER test_backfill_gate BEFORE INSERT ON ${prefix}article_search_documents
          FOR EACH ROW EXECUTE FUNCTION ${prefix}pause_test_backfill()`);
      await admin.query('SELECT pg_advisory_lock($1::bigint)', [gate]);
      pending = migration.backfillBatch(backfiller, schema, null, 1);
      pending.catch(() => {});
      let waiting = false;
      for (let i = 0; i < 40; i++) {
        const state = await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='polanews-backfill-test' AND wait_event='advisory') AS waiting");
        if (state.rows[0].waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.ok(waiting, 'Backfill paused after reading the old source snapshot');
      await writer.query(`UPDATE ${prefix}articles SET content='concurrent AI replacement' WHERE id=$1`, [article(1)]);
      await admin.query('SELECT pg_advisory_unlock($1::bigint)', [gate]);
      await pending;
      assert.equal((await migration.verify(admin, schema)).mismatches, 0);
      assert.equal((await admin.query(`SELECT content FROM ${prefix}article_search_documents WHERE id=$1`, [article(1)])).rows[0].content, 'concurrent AI replacement');
      cases++;
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1::bigint)', [gate]);
      await pending?.catch(() => {});
      await backfiller.end();
      await admin.query(`DROP TRIGGER IF EXISTS test_backfill_gate ON ${prefix}article_search_documents;
        DROP FUNCTION IF EXISTS ${prefix}pause_test_backfill()`);
    }

    const oldXmin = (await admin.query(`SELECT xmin::text FROM ${prefix}article_search_documents WHERE id=$1`, [article(1)])).rows[0].xmin;
    await writer.query(`UPDATE ${prefix}articles SET summary='AI metadata only' WHERE id=$1`, [article(1)]);
    assert.equal((await admin.query(`SELECT xmin::text FROM ${prefix}article_search_documents WHERE id=$1`, [article(1)])).rows[0].xmin, oldXmin); cases++;
    await writer.query('BEGIN');
    await writer.query(`INSERT INTO ${prefix}articles(id,feed_id,title,content) VALUES($1,$2,'rolled back','AI')`, [article(5), feed]);
    assert.equal((await writer.query(`SELECT COUNT(*)::int AS n FROM ${prefix}article_search_documents WHERE id=$1`, [article(5)])).rows[0].n, 1);
    await writer.query('ROLLBACK');
    assert.equal((await admin.query(`SELECT COUNT(*)::int AS n FROM ${prefix}article_search_documents WHERE id=$1`, [article(5)])).rows[0].n, 0); cases++;

    for (const q of ['AI', 'ai', '中文', '%', '_', "'", '\\', 'missing']) {
      for (const page of [1, 2]) {
        const actual = await api.searchArticles(q, page, 2);
        const original = await admin.query(`SELECT a.*,f.title AS feed_title,f.favicon_url AS feed_favicon
          FROM ${prefix}articles a INNER JOIN ${prefix}feeds f ON a.feed_id=f.id
          WHERE a.title LIKE $1 OR a.content LIKE $2 ORDER BY a.published_at DESC LIMIT 2 OFFSET $3`,
        [`%${q}%`, `%${q}%`, (page - 1) * 2]);
        const total = (await admin.query(`SELECT COUNT(*)::int AS n FROM ${prefix}articles a INNER JOIN ${prefix}feeds f ON a.feed_id=f.id
          WHERE a.title LIKE $1 OR a.content LIKE $2`, [`%${q}%`, `%${q}%`])).rows[0].n;
        assert.equal(actual.total, total);
        assert.deepEqual(Array.from(actual.articles, a => a.id), original.rows.map(row => row.id));
        for (let i = 0; i < original.rows.length; i++) {
          const { snippet, ...publicFields } = actual.articles[i];
          assert.equal(JSON.stringify(publicFields), JSON.stringify(helpers.rowToArticle(original.rows[i])));
          assert.equal(typeof snippet, 'string');
        }
        cases++;
      }
    }
    await writer.query(`UPDATE ${prefix}articles SET title='Updated AI',content=NULL,published_at=NULL WHERE id=$1`, [article(4)]);
    assert.equal((await migration.verify(admin, schema)).mismatches, 0); cases++;
    await writer.query(`DELETE FROM ${prefix}articles WHERE id=$1`, [article(3)]);
    assert.equal((await admin.query(`SELECT COUNT(*)::int AS n FROM ${prefix}article_search_documents WHERE id=$1`, [article(3)])).rows[0].n, 0); cases++;
    await writer.query(`INSERT INTO ${prefix}articles(id,feed_id,title,content,published_at)
      SELECT ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,$1,'batch fixture',NULL,now()
      FROM generate_series(1,501) n`, [feed]);
    assert.deepEqual(await migration.verify(admin, schema), { source_rows: 504, search_rows: 504, mismatches: 0 });
    await admin.query(`UPDATE ${prefix}article_search_documents SET content='incorrect fixture' WHERE id=$1`, [article(1501)]);
    assert.equal((await migration.verify(admin, schema)).mismatches, 1, 'Verification reaches the next keyset batch');
    await writer.query(`UPDATE ${prefix}articles SET content='repaired fixture' WHERE id=$1`, [article(1501)]);
    assert.equal((await migration.verify(admin, schema)).mismatches, 0);
    await writer.query(`DELETE FROM ${prefix}articles WHERE id BETWEEN $1 AND $2`, [article(1001), article(1501)]);
    cases++;
    await admin.query(migration.downSql(schema));
    assert.equal((await admin.query(`SELECT COUNT(*)::int AS n FROM ${prefix}articles`)).rows[0].n, 3);
    assert.equal((await api.searchArticles('AI', 1, 20)).total, 3); cases++;
    console.log(JSON.stringify({ passed: cases, isolated_schema: true, production_tables_mutated: false,
      covers: ['concurrent backfill/update race', 'backfill conflict/idempotence', 'trigger update/delete/rollback', 'LIKE/page/field parity', 'old-query fallback'] }));
  } finally {
    for (const pool of pools) await pool.end();
    await writer.query('ROLLBACK').catch(() => {});
    await writer.end();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
