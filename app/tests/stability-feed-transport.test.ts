import assert from 'node:assert/strict';
import { Resolver } from 'node:dns';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { Socket, type AddressInfo } from 'node:net';
// Node 25 provides synchronous module hooks; the pinned Node 20 types do not declare it yet.
// @ts-expect-error Runtime API is available in the test environment.
import { registerHooks } from 'node:module';
import { test, type TestContext } from 'node:test';

registerHooks({
  resolve(specifier: string, context: Record<string, unknown>, nextResolve: (specifier: string, context: Record<string, unknown>) => unknown) {
    if (specifier === '../src/lib/rss/feed-transport') return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { fetchFeedText } = await import('../src/lib/rss/feed-transport');

async function fixture(t: TestContext, handler: http.RequestListener) {
  const closed = new Set<string>();
  const server = http.createServer((request, response) => {
    response.on('close', () => closed.add(request.url ?? '/'));
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const expectClosed = async (path: string) => {
    const deadline = Date.now() + 1_000;
    while (!closed.has(path) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(closed.has(path), `the server observed the ${path} response connection close`);
  };
  return { base, expectClosed };
}

test('RSS timeout closes a streaming response and a later healthy request succeeds', async (t) => {
  const { base, expectClosed } = await fixture(t, (request, response) => {
    if (request.url === '/healthy') return response.end('<rss>ok</rss>');
    response.writeHead(200);
    response.write('partial');
  });
  await assert.rejects(fetchFeedText(`${base}/hang`, { timeoutMs: 60 }), /timed out/);
  await expectClosed('/hang');
  assert.equal(await fetchFeedText(`${base}/healthy`), '<rss>ok</rss>');
});

test('RSS streamed and declared oversized bodies close before reading unbounded data', async (t) => {
  const { base, expectClosed } = await fixture(t, (request, response) => {
    if (request.url === '/declared') response.writeHead(200, { 'Content-Length': '99999999' });
    else response.writeHead(200);
    response.write('x'.repeat(129));
  });
  for (const path of ['/streamed', '/declared']) {
    await assert.rejects(fetchFeedText(`${base}${path}`, { maxBytes: 128 }), /exceeds 128 bytes/);
    await expectClosed(path);
  }
});

test('RSS follows at most three redirects and closes each unread redirect response', async (t) => {
  const { base, expectClosed } = await fixture(t, (request, response) => {
    const hop = Number(request.url?.slice(1));
    if (hop === 3) return response.end('<rss>done</rss>');
    response.writeHead(302, { Location: `/${hop + 1}` });
    response.flushHeaders();
  });
  assert.equal(await fetchFeedText(`${base}/0`), '<rss>done</rss>');
  for (const path of ['/0', '/1', '/2']) await expectClosed(path);
  await assert.rejects(fetchFeedText(`${base}/0`, { maxRedirects: 2 }), /redirect limit/);
});

test('RSS redirect chain shares the original deadline', async (t) => {
  const { base, expectClosed } = await fixture(t, (request, response) => {
    if (request.url === '/slow') {
      const timer = setTimeout(() => {
        response.writeHead(302, { Location: '/hang' });
        response.flushHeaders();
      }, 70);
      response.on('close', () => clearTimeout(timer));
    } else {
      response.writeHead(200);
      response.write('partial');
    }
  });
  const started = Date.now();
  await assert.rejects(fetchFeedText(`${base}/slow`, { timeoutMs: 130 }), /timed out/);
  assert.ok(Date.now() - started < 190, 'redirects must not restart the 130ms deadline');
  await expectClosed('/slow');
  await expectClosed('/hang');
});

test('RSS HTTP errors and unsupported content encoding close unread responses', async (t) => {
  const { base, expectClosed } = await fixture(t, (request, response) => {
    assert.equal(request.headers['accept-encoding'], 'identity');
    if (request.url === '/error') response.writeHead(503);
    else response.writeHead(200, { 'Content-Encoding': 'gzip' });
    response.flushHeaders();
  });
  await assert.rejects(fetchFeedText(`${base}/error`), /HTTP 503/);
  await expectClosed('/error');
  await assert.rejects(fetchFeedText(`${base}/encoded`, { headers: { 'accept-encoding': 'gzip' } }), /content encoding/);
  await expectClosed('/encoded');
});

test('RSS rejects non-HTTP redirect protocols and malformed limits', async (t) => {
  const { base, expectClosed } = await fixture(t, (_request, response) => {
    response.writeHead(302, { Location: 'file:///etc/passwd' });
    response.flushHeaders();
  });
  await assert.rejects(fetchFeedText(`${base}/invalid`), /protocol/);
  await expectClosed('/invalid');
  await assert.rejects(fetchFeedText('ftp://example.com/feed'), /protocol/);
  await assert.rejects(fetchFeedText(`${base}/invalid`, { timeoutMs: 0 }), /limits/);
});

test('RSS DNS deadlines cancel only their own resolver while another feed succeeds', async (t) => {
  const pending = new Map<Resolver, (error: NodeJS.ErrnoException | null, addresses: string[]) => void>();
  const resolvers = new Set<Resolver>();
  const cancelled = new Set<Resolver>();
  t.mock.method(Resolver.prototype, 'resolve4', function (
    this: Resolver,
    hostname: string,
    callback: (error: NodeJS.ErrnoException | null, addresses: string[]) => void
  ) {
    resolvers.add(this);
    pending.set(this, callback);
    if (hostname === 'healthy.invalid') {
      setImmediate(() => {
        pending.delete(this);
        callback(null, ['127.0.0.1']);
      });
    }
  });
  t.mock.method(Resolver.prototype, 'cancel', function (this: Resolver) {
    cancelled.add(this);
    const callback = pending.get(this);
    pending.delete(this);
    callback?.(Object.assign(new Error('cancelled'), { code: 'ECANCELLED' }), []);
  });
  const { base } = await fixture(t, (_request, response) => response.end('healthy'));
  const slow = assert.rejects(fetchFeedText(base.replace('127.0.0.1', 'slow.invalid'), { timeoutMs: 80 }), /timed out/);
  assert.equal(await fetchFeedText(base.replace('127.0.0.1', 'healthy.invalid')), 'healthy');
  await slow;
  assert.equal(resolvers.size, 2);
  assert.equal(cancelled.size, 2);
  assert.equal(pending.size, 0);
});

test('RSS keeps TLS verification enabled and closes HTTPS-to-HTTP redirects', async (t) => {
  let requestDestroyed = false;
  let redirectResponse: http.IncomingMessage | undefined;
  t.mock.method(https, 'get', (_url: URL, options: https.RequestOptions, callback: (response: http.IncomingMessage) => void) => {
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.family, 4);
    const request = Object.assign(new EventEmitter(), {
      destroy() { requestDestroyed = true; return this; },
    });
    queueMicrotask(() => {
      redirectResponse = new http.IncomingMessage(new Socket());
      redirectResponse.statusCode = 302;
      redirectResponse.headers = { location: 'http://example.com/feed' };
      callback(redirectResponse);
    });
    return request;
  });
  await assert.rejects(fetchFeedText('https://example.com/feed'), /HTTPS downgrade/);
  assert.equal(requestDestroyed, true);
  assert.equal(redirectResponse?.destroyed, true);
});
