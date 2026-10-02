import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRepository } from '../server/database.ts';
import { createApp } from '../server/app.ts';
import { emptyItem } from '../src/lib/content.ts';
import type { AddressInfo } from 'node:net';

async function fixture(password = '') {
  const dataDir = mkdtempSync(join(tmpdir(), 'shouhao-api-'));
  const repository = createRepository(':memory:');
  const app = createApp(repository, {
    dataDir,
    password,
    staticDir: resolve('dist'),
    ai: { baseUrl: '', apiKey: '', model: '' },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    headers?: Record<string, string>,
  ) =>
    fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    base,
    request,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      repository.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

test('收藏 API 新增、编辑、导出、删除以及校验错误', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/items')).status, 200);
    const input = {
      ...emptyItem('note'),
      title: '待看的笔记',
      content: '记录内容',
      tags: ['学习'],
    };
    const createdResponse = await f.request('/api/items', 'POST', input);
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(
      (await f.request(`/api/items/${created.id}`, 'PUT', { ...input, status: 'done' })).status,
      200,
    );
    const exported = await (await f.request('/api/export')).json();
    assert.equal(exported.items[0].status, 'done');
    assert.equal((await f.request('/api/items', 'POST', { title: '' })).status, 400);
    assert.equal((await f.request('/api/items/missing', 'PUT', input)).status, 404);
    assert.equal((await f.request(`/api/items/${created.id}`, 'DELETE')).status, 204);
    assert.deepEqual(await (await f.request('/api/items')).json(), []);
  } finally {
    await f.close();
  }
});

test('链接去重与识别失败后仍能保存', async () => {
  const f = await fixture();
  try {
    const preview = await (
      await f.request('/api/preview', 'POST', { text: '分享 http://127.0.0.1/secret' })
    ).json();
    assert.match(preview.warning, /私有网络/);
    const input = { ...emptyItem(), ...preview, title: '手动补全的标题' };
    assert.equal((await f.request('/api/items', 'POST', input)).status, 201);
    assert.equal((await f.request('/api/items', 'POST', input)).status, 409);
    assert.equal((await f.request('/api/preview', 'POST', { text: '不含网址' })).status, 400);
  } finally {
    await f.close();
  }
});

test('鉴权保护接口与图片，登出撤销会话，跨站写请求被拒绝', async () => {
  const f = await fixture('strong-test-password');
  try {
    assert.equal((await f.request('/api/items')).status, 401);
    assert.equal((await f.request('/uploads/example.png')).status, 401);
    const config = await (await f.request('/api/config')).json();
    assert.equal(config.authenticated, false);
    assert.equal(config.aiEnabled, false);
    assert.equal((await f.request('/api/session', 'POST', { password: 'wrong' })).status, 401);
    const login = await f.request('/api/session', 'POST', { password: 'strong-test-password' });
    const cookie = login.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const headers = { Cookie: cookie.split(';')[0] };
    assert.equal((await f.request('/api/items', 'GET', undefined, headers)).status, 200);
    assert.equal(
      (
        await f.request(
          '/api/items',
          'POST',
          { ...emptyItem('note'), title: '记录', content: '内容' },
          { ...headers, Origin: 'https://attacker.test' },
        )
      ).status,
      403,
    );
    assert.equal((await f.request('/api/session', 'DELETE', undefined, headers)).status, 200);
    assert.equal((await f.request('/api/items', 'GET', undefined, headers)).status, 401);
  } finally {
    await f.close();
  }
});

test('图片上传保留字节，伪装图片与 SVG 被拒绝', async () => {
  const f = await fixture();
  const data =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  try {
    const response = await f.request('/api/uploads', 'POST', { data, name: '../../test.png' });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.match(result.url, /^\/uploads\/[\w-]+\.png$/);
    assert.equal((await fetch(f.base + result.url)).status, 200);
    assert.equal(
      (
        await f.request('/api/uploads', 'POST', {
          data: 'data:image/png;base64,aGVsbG8=',
          name: 'fake.png',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request('/api/uploads', 'POST', {
          data: 'data:image/svg+xml;base64,PHN2Zy8+',
          name: 'unsafe.svg',
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.request('/api/ai/organize', 'POST', { title: '', content: '', description: '' }))
        .status,
      503,
    );
  } finally {
    await f.close();
  }
});
