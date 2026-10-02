import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string) {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress())
      parsed = (parsed as ipaddr.IPv6).toIPv4Address();
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function fetchPublicHtml(
  rawUrl: string,
  redirects = 0,
  deadline = Date.now() + 12_000,
): Promise<{ html: string; url: string }> {
  if (Date.now() >= deadline) throw new Error('网页响应超时');
  const url = new URL(rawUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new Error('仅支持标准端口的 http/https 公开网页');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await Promise.race([
    lookup(hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('DNS 查询超时')),
        Math.min(4000, deadline - Date.now()),
      );
      timer.unref();
    }),
  ]);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new Error('不能读取本机或私有网络地址');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(
      url,
      {
        headers: {
          'User-Agent': 'Shouhao/0.1 (+link-preview)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity',
        },
        // Pin the validated address so a second DNS answer cannot bypass the private-network check.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
        family: address.family,
        agent: false,
      },
      (response) => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.destroy();
          if (redirects >= 3) {
            reject(new Error('网页跳转次数过多'));
            return;
          }
          fetchPublicHtml(
            new URL(response.headers.location, url).href,
            redirects + 1,
            deadline,
          ).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          response.destroy();
          reject(new Error(`网页返回 ${status}`));
          return;
        }
        const contentType = response.headers['content-type'] || '';
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
          response.destroy();
          reject(new Error('这个链接不是 HTML 网页'));
          return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) {
            response.destroy(new Error('网页内容过大'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          const charset = /charset=["']?([^;\s"']+)/i.exec(contentType)?.[1] || 'utf-8';
          try {
            resolve({
              html: new TextDecoder(charset).decode(Buffer.concat(chunks)),
              url: url.href,
            });
          } catch {
            resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.href });
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('网页响应超时')),
      Math.max(1, deadline - Date.now()),
    );
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}
