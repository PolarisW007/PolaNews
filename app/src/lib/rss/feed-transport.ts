import { Resolver } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';

export interface FeedTransportOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/** Download one feed with one deadline, including DNS, redirects and body reads. */
export async function fetchFeedText(
  url: string,
  options: FeedTransportOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1
    || !Number.isSafeInteger(maxRedirects) || maxRedirects < 0) {
    throw new Error('Invalid RSS transport limits');
  }

  const initialUrl = new URL(url);
  const validateUrl = (target: URL, previous?: URL) => {
    if (target.protocol !== 'https:' && target.protocol !== 'http:') {
      throw new Error('Unsupported RSS URL protocol');
    }
    if (target.username || target.password) throw new Error('RSS URL credentials are not supported');
    if (previous?.protocol === 'https:' && target.protocol === 'http:') {
      throw new Error('RSS HTTPS downgrade redirect is not allowed');
    }
  };
  validateUrl(initialUrl);

  // c-ares avoids the small libuv getaddrinfo pool. Each download owns its
  // resolver so cancelling a timed-out feed cannot cancel another feed's DNS.
  const resolver = new Resolver({ timeout: 2_000, tries: 2 });
  const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
    resolver.resolve4(hostname, (error, addresses) => {
      if (error) return callback(error, '', 4);
      if (!addresses.length) {
        const empty = Object.assign(new Error('RSS DNS returned no IPv4 address'), { code: 'ENOTFOUND' });
        return callback(empty, '', 4);
      }
      callback(null, lookupOptions.all
        ? addresses.map((address) => ({ address, family: 4 }))
        : addresses[0], 4);
    });
  };
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (name.toLowerCase() !== 'accept-encoding') headers[name] = value;
  }
  // No compressed body is accepted, so the byte limit is also the decoded limit.
  headers['Accept-Encoding'] = 'identity';

  return new Promise<string>((resolve, reject) => {
    let request: http.ClientRequest | undefined;
    let response: http.IncomingMessage | undefined;
    let settled = false;
    let receivedBytes = 0;
    const closeActive = () => {
      const oldRequest = request;
      const oldResponse = response;
      request = undefined;
      response = undefined;
      oldResponse?.destroy();
      oldRequest?.destroy();
    };
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeActive();
      resolver.cancel();
      if (error) reject(error);
      else resolve(text ?? '');
    };
    const timer = setTimeout(() => {
      finish(new Error(`RSS request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const download = (target: URL, redirects: number) => {
      if (settled) return;
      try {
        const nextRequest = (target.protocol === 'https:' ? https : http).get(target, {
          headers,
          family: 4,
          lookup,
          agent: false,
          rejectUnauthorized: true,
        }, (nextResponse) => {
          if (settled || request !== nextRequest) {
            nextResponse.destroy();
            return;
          }
          response = nextResponse;
          const status = nextResponse.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            const location = nextResponse.headers.location;
            if (!location) return finish(new Error(`RSS HTTP ${status} without redirect location`));
            if (redirects >= maxRedirects) return finish(new Error('RSS redirect limit exceeded'));
            let destination: URL;
            try {
              destination = new URL(location, target);
              validateUrl(destination, target);
            } catch (error) {
              finish(error instanceof Error ? error : new Error('Invalid RSS redirect'));
              return;
            }
            closeActive();
            download(destination, redirects + 1);
            return;
          }
          if (status < 200 || status >= 300) return finish(new Error(`RSS HTTP ${status}`));
          const encoding = nextResponse.headers['content-encoding']?.trim().toLowerCase();
          if (encoding && encoding !== 'identity') {
            return finish(new Error('Unsupported RSS content encoding'));
          }
          if (Number(nextResponse.headers['content-length']) > maxBytes) {
            return finish(new Error(`RSS response exceeds ${maxBytes} bytes`));
          }
          const chunks: Buffer[] = [];
          nextResponse.on('data', (chunk: Buffer) => {
            if (settled || response !== nextResponse) return;
            receivedBytes += chunk.length;
            if (receivedBytes > maxBytes) return finish(new Error(`RSS response exceeds ${maxBytes} bytes`));
            chunks.push(chunk);
          });
          nextResponse.on('end', () => {
            if (settled || response !== nextResponse) return;
            finish(undefined, Buffer.concat(chunks).toString('utf8'));
          });
          nextResponse.on('aborted', () => {
            if (response === nextResponse) finish(new Error('RSS response aborted'));
          });
          nextResponse.on('error', (error: Error) => {
            if (response === nextResponse) finish(error);
          });
        });
        request = nextRequest;
        nextRequest.on('error', (error: Error) => {
          if (request === nextRequest) finish(error);
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('RSS request failed'));
      }
    };
    download(initialUrl, 0);
  });
}
