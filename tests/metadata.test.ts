import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLinkPreview, parseMetadata } from '../server/services/metadata.ts';
import { itemSchema } from '../server/validation.ts';
import { emptyItem } from '../src/lib/content.ts';

test('读取重复标签与关键词，跳过空元数据和无效封面', () => {
  const preview = parseMetadata(
    `
    <meta property="og:title" content="">
    <meta property="OG:TITLE" content=" 标题 &amp; 内容 ">
    <meta property="og:image" content="javascript:alert(1)">
    <meta property="og:image" content="/cover.jpg">
    <meta property="article:tag" content="学习">
    <meta property="article:tag" content="工具">
    <meta name="keywords" content="学习，开发;工具">
    <a rel="tag">设计</a>
  `,
    'https://example.com/article',
  );
  assert.equal(preview.title, '标题 & 内容');
  assert.equal(preview.cover, 'https://example.com/cover.jpg');
  assert.deepEqual(preview.tags, ['学习', '工具', '开发', '设计']);
  assert.equal(itemSchema.safeParse({ ...emptyItem(), ...preview }).success, true);
});

test('读取 JSON-LD 图中的文章、作者和封面引用，忽略损坏块和站点名称', () => {
  const preview = parseMetadata(
    `
    <title>站点首页</title>
    <script type="application/ld+json">invalid JSON</script>
    <script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'WebSite', name: '站点名称' },
        { '@id': '#author', '@type': 'Person', name: '小明' },
        { '@id': '#cover', '@type': 'ImageObject', contentUrl: '/images/cover.webp' },
        {
          '@type': ['CreativeWork', 'BlogPosting'],
          headline: '真正的文章标题',
          description: '文章摘要',
          author: { '@id': '#author' },
          image: { '@id': '#cover' },
          keywords: ['产品', { '@type': 'DefinedTerm', name: '设计' }],
          publisher: { name: '内容站' },
        },
      ],
    })}</script>
  `,
    'https://example.com/read/123',
  );
  assert.equal(preview.title, '真正的文章标题');
  assert.equal(preview.author, '小明');
  assert.equal(preview.cover, 'https://example.com/images/cover.webp');
  assert.equal(preview.description, '文章摘要');
  assert.equal(preview.source, '内容站');
  assert.equal(preview.type, 'article');
  assert.deepEqual(preview.tags, ['产品', '设计']);
});

test('支持 JSON-LD 数组中的视频缩略图和多个作者', () => {
  const preview = parseMetadata(
    `<script type="application/ld+json">${JSON.stringify([
      {
        '@type': 'VideoObject',
        name: '一个视频',
        thumbnailUrl: ['data:image/png;base64,bad', '//cdn.example.com/video.jpg'],
        author: [{ name: '甲' }, { name: '乙' }],
      },
    ])}</script>`,
    'https://example.com/watch',
  );
  assert.equal(preview.type, 'video');
  assert.equal(preview.cover, 'https://cdn.example.com/video.jpg');
  assert.equal(preview.author, '甲、乙');
});

test('作者主页地址不会当作作者名，泛用网页类型不遮蔽结构化内容类型', () => {
  const preview = parseMetadata(
    `<meta property="article:author" content="https://example.com/author"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify({ '@type': 'Article', headline: '文章', author: { name: '真正的作者' } })}</script>`,
    'https://example.com/123',
  );
  assert.equal(preview.author, '真正的作者');
  assert.equal(preview.type, 'article');
  assert.equal(
    parseMetadata(
      '<meta property="article:author" content="https://example.com/author">',
      'https://example.com',
    ).author,
    '',
  );
});

test('没有元数据时读取正文标题、作者、摘要与懒加载图片，排除小图', () => {
  const preview = parseMetadata(
    `
    <title>泛用网页标题</title><base href="/assets/">
    <article><h1>正文标题</h1><a rel="author">作者名字</a><p>正文第一段。</p>
      <img src="/avatar.jpg"><img src="/tracking.png" width="1" height="1">
      <img data-src="cover.jpg" width="600" height="400">
    </article>
  `,
    'https://example.com/blog/post',
  );
  assert.equal(preview.title, '正文标题');
  assert.equal(preview.author, '作者名字');
  assert.equal(preview.description, '正文第一段。');
  assert.equal(preview.cover, 'https://example.com/assets/cover.jpg');
});

test('微信正文的标题、公众号名和图片可以补全', () => {
  const preview = parseMetadata(
    '<h1 id="activity-name">微信文章</h1><a id="js_name">公众号名</a><div id="js_content"><p>摘要</p><img data-src="https://cdn.example.com/wx.jpg"></div>',
    'https://mp.weixin.qq.com/s/123',
  );
  assert.equal(preview.title, '微信文章');
  assert.equal(preview.author, '公众号名');
  assert.equal(preview.type, 'article');
  assert.equal(preview.cover, 'https://cdn.example.com/wx.jpg');
});

test('网页失败仍提取分享标题和话题，保留限制提示', async () => {
  const preview = await getLinkPreview(
    '【一篇有用的文章】\n#学习 #工具\nhttps://example.com/post\n复制链接打开App',
    async () => {
      throw new Error('网页返回 403');
    },
  );
  assert.equal(preview.title, '一篇有用的文章');
  assert.deepEqual(preview.tags, ['学习', '工具']);
  assert.equal(preview.cover, '');
  assert.match(preview.warning || '', /403.*封面/);
});

test('识别使用跳转后的地址，合并分享标签，字段不全时不会谎报成功', async () => {
  const preview = await getLinkPreview('https://example.com/short #阅读', async () => ({
    url: 'https://content.example.com/articles/123',
    html: '<h1>文章标题</h1><meta name="keywords" content="阅读,笔记">',
  }));
  assert.equal(preview.url, 'https://content.example.com/articles/123');
  assert.equal(preview.type, 'article');
  assert.deepEqual(preview.tags, ['阅读', '笔记']);
  assert.match(preview.warning || '', /未读取到封面/);
  const complete = await getLinkPreview('https://example.com/123', async () => ({
    url: 'https://example.com/123',
    html: '<meta property="og:title" content="标题"><meta property="og:image" content="/cover.jpg">',
  }));
  assert.equal(complete.warning, undefined);
});

test('过长或重复标签、危险封面不进入收藏字段', () => {
  const tags = Array.from({ length: 25 }, (_value, index) => `标签${index}`);
  const preview = parseMetadata(
    `<meta name="keywords" content="${['x'.repeat(31), ...tags, ...tags].join(',')}"><meta property="og:image" content="https://user:password@example.com/cover.png"><meta property="og:image" content="file:///image.png">`,
    'https://example.com',
  );
  assert.equal(preview.tags.length, 20);
  assert.equal(preview.cover, '');
  assert.equal(itemSchema.safeParse({ ...emptyItem(), ...preview }).success, true);
});
