import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { fetchPublicHtml } from '../server/services/safe-fetch.ts';

async function responseFixture(
  bytes: Buffer,
  headers: http.IncomingHttpHeaders,
  run: () => Promise<void>,
) {
  const mocked = mock.method(
    http,
    'get',
    (_url: unknown, _options: unknown, callback: (response: http.IncomingMessage) => void) => {
      const body = new PassThrough();
      const response = body as unknown as http.IncomingMessage;
      response.statusCode = 200;
      response.headers = { 'content-type': 'text/html; charset=utf-8', ...headers };
      const request = new EventEmitter() as http.ClientRequest;
      request.destroy = (error?: Error) => {
        if (error) request.emit('error', error);
        response.destroy();
        request.emit('close');
        return request;
      };
      queueMicrotask(() => {
        response.on('close', () => request.emit('close'));
        callback(response);
        body.end(bytes);
      });
      return request;
    },
  );
  try {
    await run();
  } finally {
    mocked.mock.restore();
  }
}

test('公开网页请求正确解压 gzip、deflate 和 Brotli，不把压缩字节当文字', async () => {
  const html = '<title>中文标题</title><meta property="og:image" content="/cover.jpg">';
  for (const [encoding, compress] of [
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const) {
    await responseFixture(
      compress(Buffer.from(html)),
      { 'content-encoding': encoding },
      async () => {
        assert.equal((await fetchPublicHtml('http://8.8.8.8/')).html, html);
      },
    );
  }
});

test('压缩网页解压后仍限制大小，损坏或不支持的压缩格式明确失败', async () => {
  await responseFixture(
    gzipSync(Buffer.alloc(2 * 1024 * 1024 + 1, 'a')),
    { 'content-encoding': 'gzip' },
    async () => {
      await assert.rejects(fetchPublicHtml('http://8.8.8.8/'), /网页内容过大/);
    },
  );
  await responseFixture(Buffer.from('broken'), { 'content-encoding': 'gzip' }, async () => {
    await assert.rejects(fetchPublicHtml('http://8.8.8.8/'));
  });
  await responseFixture(Buffer.from('data'), { 'content-encoding': 'unsupported' }, async () => {
    await assert.rejects(fetchPublicHtml('http://8.8.8.8/'), /压缩格式/);
  });
});

test('未声明响应 charset 时识别 HTML 内的中文字符编码', async () => {
  const bytes = Buffer.concat([
    Buffer.from('<meta charset="gbk"><title>'),
    Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
    Buffer.from('</title>'),
  ]);
  await responseFixture(bytes, { 'content-type': 'text/html' }, async () => {
    assert.match((await fetchPublicHtml('http://8.8.8.8/')).html, /<title>中文<\/title>/);
  });
});
