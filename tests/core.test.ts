import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepository } from '../server/database.ts';
import { emptyItem, filterItems } from '../src/lib/content.ts';
import { extractUrl, inferType, parseMetadata } from '../server/services/metadata.ts';
import { isPublicAddress, fetchPublicHtml } from '../server/services/safe-fetch.ts';
import { itemSchema } from '../server/validation.ts';

test('收藏在数据库重新打开后保留，修改保持原始创建时间', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shouhao-db-'));
  const path = join(dir, 'test.sqlite');
  let repo = createRepository(path);
  try {
    const first = repo.save({
      ...emptyItem('note'),
      title: '一个想法',
      content: '原始文字',
      tags: ['学习'],
    });
    repo.close();
    repo = createRepository(path);
    assert.equal(repo.get(first.id)?.content, '原始文字');
    const updated = repo.save(
      {
        ...emptyItem('note'),
        title: '更新的想法',
        content: '新文字',
        status: 'done',
        starred: true,
      },
      first.id,
    );
    assert.equal(updated.createdAt, first.createdAt);
    assert.equal(repo.list().length, 1);
    assert.equal(repo.get(first.id)?.starred, true);
    repo.remove(first.id);
    assert.equal(repo.list().length, 0);
  } finally {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('数据库唯一索引阻止重复链接', () => {
  const repo = createRepository(':memory:');
  try {
    const input = { ...emptyItem(), title: '示例', url: 'https://example.com/' };
    repo.save(input);
    assert.throws(() => repo.save(input));
    repo.save({ ...emptyItem('note'), title: '速记一', content: '1' });
    repo.save({ ...emptyItem('note'), title: '速记二', content: '2' });
    assert.equal(repo.list().length, 3);
  } finally {
    repo.close();
  }
});

test('从分享文字取链接，移除已知追踪参数和末尾标点', () => {
  assert.equal(
    extractUrl(
      '推荐你看 https://www.bilibili.com/video/BV123?vd_source=abc&utm_source=share&p=2 。',
    ),
    'https://www.bilibili.com/video/BV123?p=2',
  );
  assert.equal(extractUrl('来看看：https://example.com/a）。'), 'https://example.com/a');
  assert.equal(
    extractUrl('https://example.com/article#section'),
    'https://example.com/article#section',
  );
  assert.throws(() => extractUrl('没有链接'));
  assert.throws(() => extractUrl('https://user:secret@example.com'));
});

test('解析 HTML 元数据与相对封面，解码实体', () => {
  const result = parseMetadata(
    '<title>fallback</title><meta property="og:title" content="A &amp; B"><meta property="og:image" content="/cover.jpg"><meta property="og:type" content="article"><meta name="author" content="小明"><meta name="description" content="摘要">',
    'https://example.com/page',
  );
  assert.equal(result.title, 'A & B');
  assert.equal(result.cover, 'https://example.com/cover.jpg');
  assert.equal(result.type, 'article');
  assert.equal(result.author, '小明');
  assert.equal(result.description, '摘要');
  assert.equal(
    parseMetadata('<meta property="og:image" content="javascript:alert(1)">', 'https://example.com')
      .cover,
    '',
  );
});

test('区分常见平台，避免相似域名误判', () => {
  assert.equal(inferType('https://b23.tv/test'), 'video');
  assert.equal(inferType('https://www.xiaoyuzhoufm.com/episode/123'), 'audio');
  assert.equal(inferType('https://mp.weixin.qq.com/s/abc'), 'article');
  assert.equal(inferType('https://notbilibili.com/'), 'webpage');
});

test('拒绝本机、私网、保留与 IPv4 映射地址', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2001:db8::1',
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  await assert.rejects(fetchPublicHtml('http://127.0.0.1/'), /私有网络/);
  await assert.rejects(fetchPublicHtml('http://example.com:8080/'), /标准端口/);
  await assert.rejects(fetchPublicHtml('file:///etc/passwd'), /http\/https/);
});

test('输入校验阻止空收藏和不安全封面，去重标签', () => {
  assert.equal(itemSchema.safeParse({ ...emptyItem('note'), title: '记录' }).success, false);
  assert.equal(
    itemSchema.safeParse({ ...emptyItem(), title: '链接', url: 'javascript:alert(1)' }).success,
    false,
  );
  assert.equal(
    itemSchema.safeParse({
      ...emptyItem('image'),
      title: '图片',
      cover: 'data:image/svg+xml,<svg/>',
    }).success,
    false,
  );
  assert.deepEqual(
    itemSchema.parse({
      ...emptyItem('note'),
      title: '记录',
      content: '内容',
      tags: ['学习', ' 学习 '],
    }).tags,
    ['学习'],
  );
});

test('组合搜索、类型、标签、状态、星标筛选', () => {
  const repo = createRepository(':memory:');
  try {
    repo.save({
      ...emptyItem('note'),
      title: '观察',
      content: 'Agent 的工具调用',
      tags: ['开发'],
      starred: true,
    });
    repo.save({ ...emptyItem('note'), title: '另一条', content: '普通文字', status: 'done' });
    assert.equal(
      filterItems(repo.list(), {
        query: 'agent',
        type: 'note',
        tag: '开发',
        status: 'unread',
        starred: true,
      }).length,
      1,
    );
    assert.equal(
      filterItems(repo.list(), {
        query: 'agent',
        type: 'note',
        tag: '',
        status: 'done',
        starred: false,
      }).length,
      0,
    );
  } finally {
    repo.close();
  }
});
