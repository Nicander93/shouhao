import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLinkPreview, parseMetadata } from '../server/services/metadata.ts';
import { itemSchema } from '../server/validation.ts';
import { emptyItem } from '../src/lib/content.ts';

test('B站初始数据提供原始标题、简介、UP主、封面与真正的视频标签', () => {
  const state = {
    videoData: {
      title: '视频标题',
      desc: '视频简介',
      pic: 'http://i0.hdslb.com/cover.jpg',
      owner: { name: 'UP主' },
    },
    tags: [{ tag_name: '编程' }, { tag_name: '学习' }],
    related: [{ title: '推荐视频' }],
  };
  const preview = parseMetadata(
    `<meta name="keywords" content="视频标题,哔哩哔哩,bilibili,B站,弹幕"><meta name="description" content="SEO推广文案"><script>window.__INITIAL_STATE__=${JSON.stringify(state)};(function(){throw new Error('不能执行网页脚本')})()</script>`,
    'https://www.bilibili.com/video/BV114421U75X/',
  );
  assert.equal(preview.title, '视频标题');
  assert.equal(preview.description, '视频简介');
  assert.equal(preview.author, 'UP主');
  assert.equal(preview.cover, 'https://i0.hdslb.com/cover.jpg');
  assert.deepEqual(preview.tags, ['编程', '学习']);
  assert.equal(preview.source, '哔哩哔哩');
  assert.equal(preview.type, 'video');
  assert.equal(itemSchema.safeParse({ ...emptyItem(), ...preview }).success, true);
});

test('B站数据字符串中有括号、引号或换行时仍能解析，坏数据回退元数据', () => {
  const state = {
    videoData: { title: '括号 } ] 与 "引号"', desc: '第一行\n第二行', owner: { name: '作者' } },
  };
  assert.equal(
    parseMetadata(
      `<script>__INITIAL_STATE__=${JSON.stringify(state)};alert(1)</script>`,
      'https://www.bilibili.com/video/BV123',
    ).title,
    state.videoData.title,
  );
  assert.equal(
    parseMetadata(
      '<meta property="og:title" content="可用标题"><script>window.__INITIAL_STATE__={videoData: getPrivateData()};</script>',
      'https://www.bilibili.com/video/BV123',
    ).title,
    '可用标题',
  );
});

test('B站短链接采用跳转后视频信息和地址', async () => {
  const preview = await getLinkPreview('https://b23.tv/example', async () => ({
    url: 'https://www.bilibili.com/video/BV123/',
    html: '<meta property="og:title" content="短链视频"><meta property="og:image" content="https://i0.hdslb.com/cover.jpg">',
  }));
  assert.equal(preview.url, 'https://www.bilibili.com/video/BV123/');
  assert.equal(preview.title, '短链视频');
  assert.equal(preview.source, '哔哩哔哩');
});

test('知乎专栏按 URL 选中文章，不把推荐文章或头像当主内容和封面', () => {
  const state = {
    initialState: {
      entities: {
        articles: {
          '123': {
            title: '当前文章',
            excerpt: '<p>摘要<script>alert(1)</script></p>',
            titleImage: 'https://pic1.zhimg.com/cover.jpg',
            author: { name: '作者甲' },
            topics: [{ name: '机器学习' }],
          },
          '999': { title: '推荐文章', author: { name: '作者乙' } },
        },
      },
    },
  };
  const preview = parseMetadata(
    `<script id="js-initialData" type="text/json">${JSON.stringify(state).replace(/</g, '\\u003c')}</script><img class="Avatar" src="https://pic1.zhimg.com/avatar.jpg">`,
    'https://zhuanlan.zhihu.com/p/123',
  );
  assert.equal(preview.title, '当前文章');
  assert.equal(preview.description, '摘要');
  assert.equal(preview.author, '作者甲');
  assert.equal(preview.cover, 'https://pic1.zhimg.com/cover.jpg');
  assert.deepEqual(preview.tags, ['机器学习']);
  assert.equal(preview.type, 'article');
  assert.equal(preview.source, '知乎');
});

test('知乎回答结合问题标题、回答作者和话题实体', () => {
  const state = {
    initialState: {
      entities: {
        questions: { '456': { title: '问题标题', topics: ['topic-id', { id: 'another-id' }] } },
        answers: {
          '789': { content: '<p>回答第一段</p><p>回答第二段</p>', author: { id: 'user-id' } },
        },
        users: { 'user-id': { name: '回答者' } },
        topics: { 'topic-id': { name: '开发' }, 'another-id': { name: '工具' } },
      },
    },
  };
  const preview = parseMetadata(
    `<script id="js-initialData">${JSON.stringify(state)}</script>`,
    'https://www.zhihu.com/question/456/answer/789',
  );
  assert.equal(preview.title, '问题标题');
  assert.equal(preview.author, '回答者');
  assert.equal(preview.description, '回答第一段 回答第二段');
  assert.deepEqual(preview.tags, ['开发', '工具']);
});

test('知乎文章403时尝试公开阅读页，保留原文章地址并共用请求期限', async () => {
  const calls: { url: string; deadline: number | undefined }[] = [];
  const preview = await getLinkPreview(
    'https://zhuanlan.zhihu.com/p/123',
    async (url, _redirects, deadline) => {
      calls.push({ url, deadline });
      if (url.includes('zhuanlan')) throw new Error('网页返回 403');
      return {
        url,
        html: `<script>window.g_initialProps=${JSON.stringify({ renderHtml: { title: '公开文章', content: '<p>公开内容</p>', author: { name: '公开作者' }, type: 'art' } })};</script>`,
      };
    },
  );
  assert.equal(preview.title, '公开文章');
  assert.equal(preview.author, '公开作者');
  assert.equal(preview.url, 'https://zhuanlan.zhihu.com/p/123');
  assert.deepEqual(
    calls.map(({ url }) => url),
    ['https://zhuanlan.zhihu.com/p/123', 'https://www.zhihu.com/tardis/zm/art/123'],
  );
  assert.equal(calls[0].deadline, calls[1].deadline);
});

test('公开阅读页不可用时保留分享文字，不对知乎回答或相似域名改写请求', async () => {
  for (const url of [
    'https://www.zhihu.com/question/456/answer/789',
    'https://notzhihu.com/p/123',
  ]) {
    let calls = 0;
    const preview = await getLinkPreview(url, async () => {
      calls++;
      throw new Error('网页返回 403');
    });
    assert.equal(calls, 1);
    assert.equal(preview.url, url);
  }
  const preview = await getLinkPreview(
    '一篇分享的文章 https://zhuanlan.zhihu.com/p/123 #学习',
    async () => {
      throw new Error('网页返回 403');
    },
  );
  assert.equal(preview.title, '一篇分享的文章');
  assert.deepEqual(preview.tags, ['学习']);
  assert.match(preview.warning || '', /403/);
});

test('公众号识别正文作者、公众号名、封面变量，安全解码转义和实体', () => {
  const preview = parseMetadata(
    String.raw`<h1 id="activity-name">文章标题</h1><span id="js_author_name">文章作者</span><a id="js_name">公众号名字</a><script>var msg_title = '旧标题'; var msg_desc = '摘要\x26amp;解释'; var msg_cdn_url = "https:\/\/mmbiz.qpic.cn\/cover.jpg?x=1&amp;y=2"; var nickname = '旧名字';</script>`,
    'https://mp.weixin.qq.com/s/123',
  );
  assert.equal(preview.title, '文章标题');
  assert.equal(preview.author, '文章作者');
  assert.equal(preview.source, '公众号名字');
  assert.equal(preview.description, '摘要&解释');
  assert.equal(preview.cover, 'https://mmbiz.qpic.cn/cover.jpg?x=1&y=2');
  assert.equal(preview.type, 'article');
});

test('公众号纯分享变量补全标题、封面和来源，不运行变量后面的代码', () => {
  const preview = parseMetadata(
    String.raw`<script>var msg_title = '\u6587\u7ae0标题'; var msg_cdn_url = 'https://mmbiz.qpic.cn/cover.jpg'; var nickname = '测试公众号'; throw new Error('不可执行');</script>`,
    'https://mp.weixin.qq.com/s/123',
  );
  assert.equal(preview.title, '文章标题');
  assert.equal(preview.source, '测试公众号');
  assert.equal(preview.cover, 'https://mmbiz.qpic.cn/cover.jpg');
});

test('验证码与登录页不作为文章，保留原始微信链接和分享标题', async () => {
  const url = 'https://mp.weixin.qq.com/s/real-article';
  const preview = await getLinkPreview(`分享的真实文章 ${url}`, async () => ({
    url: 'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?target_url=secret',
    html: '<title>微信公众平台</title>',
  }));
  assert.equal(preview.url, url);
  assert.equal(preview.title, '分享的真实文章');
  assert.equal(preview.source, '微信公众号');
  assert.match(preview.warning || '', /验证码/);
  const zhihu = await getLinkPreview('https://zhuanlan.zhihu.com/p/123', async () => ({
    url: 'https://www.zhihu.com/signin',
    html: '<title>登录知乎</title>',
  }));
  assert.equal(zhihu.url, 'https://zhuanlan.zhihu.com/p/123');
  assert.match(zhihu.warning || '', /登录/);
});

test('普通网站与相似域名不套用平台数据，平台危险封面仍被过滤', () => {
  const html =
    '<script>window.__INITIAL_STATE__={"videoData":{"title":"伪造平台标题","pic":"javascript:alert(1)"}}</script><meta property="og:title" content="网页标题">';
  assert.equal(parseMetadata(html, 'https://notbilibili.com/video/123').title, '网页标题');
  assert.equal(parseMetadata(html, 'https://www.bilibili.com/video/BV123').cover, '');
});
