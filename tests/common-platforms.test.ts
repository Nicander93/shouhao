import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLinkPreview,
  parseMetadata,
  inferType,
  extractUrl,
} from '../server/services/metadata.ts';
import { platformRules, findPlatform } from '../server/services/platform-rules.ts';
import { assignedJson } from '../server/services/page-state.ts';
import { itemSchema } from '../server/validation.ts';
import { emptyItem } from '../src/lib/content.ts';

const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const script = (id: string, value: unknown) => `<script id="${id}">${json(value)}</script>`;

test('全部登记平台可读取通用元数据，不把主页误判成视频或音频', async (t) => {
  const html =
    '<meta property="og:title" content="真实内容"><meta property="og:image" content="/cover.jpg"><meta name="author" content="真实作者"><meta name="keywords" content="技术,学习">';
  for (const rule of platformRules) {
    await t.test(rule.name + ' / ' + rule.id, () => {
      const url = 'https://' + rule.domains[0] + '/';
      const preview = parseMetadata(html, url);
      assert.equal(preview.source, rule.name);
      assert.equal(preview.title, '真实内容');
      assert.equal(preview.author, '真实作者');
      assert.equal(preview.cover, new URL('/cover.jpg', url).href);
      assert.equal(preview.type, 'webpage');
      assert.equal(itemSchema.safeParse({ ...emptyItem(), ...preview }).success, true);
      assert.equal(findPlatform('https://' + rule.domains[0] + '.example.com/'), undefined);
    });
  }
});

test('根据内容路径区分视频、图文与音频，处理域名重叠和分享短链', () => {
  const routes = [
    ['https://www.bilibili.com/read/cv123', 'article'],
    ['https://www.bilibili.com/video/BV123', 'video'],
    ['https://v.douyin.com/abc/', 'video'],
    ['https://www.douyin.com/note/123', 'article'],
    ['https://www.kuaishou.com/short-video/123', 'video'],
    ['https://www.youtube.com/shorts/abcdef12345', 'video'],
    ['https://youtu.be/abcdef12345', 'video'],
    ['https://www.iqiyi.com/v_abc.html', 'video'],
    ['https://v.youku.com/v_show/id_abc.html', 'video'],
    ['https://v.qq.com/x/cover/abc/def.html', 'video'],
    ['https://www.mgtv.com/b/123/456.html', 'video'],
    ['https://weibo.com/123/Abc123', 'article'],
    ['https://www.toutiao.com/article/123/', 'article'],
    ['https://www.toutiao.com/video/123/', 'video'],
    ['https://baijiahao.baidu.com/s?id=123', 'article'],
    ['https://news.qq.com/rain/a/20261003A123', 'article'],
    ['https://www.163.com/dy/article/ABC.html', 'article'],
    ['https://www.sohu.com/a/123_456', 'article'],
    ['https://news.ifeng.com/c/Abc123', 'article'],
    ['https://www.thepaper.cn/newsDetail_forward_123', 'article'],
    ['https://juejin.cn/post/123', 'article'],
    ['https://blog.csdn.net/user/article/details/123', 'article'],
    ['https://www.cnblogs.com/user/p/123.html', 'article'],
    ['https://www.jianshu.com/p/abc', 'article'],
    ['https://segmentfault.com/a/123', 'article'],
    ['https://www.infoq.cn/article/abc', 'article'],
    ['https://www.huxiu.com/article/123.html', 'article'],
    ['https://www.xiaoyuzhoufm.com/episode/abc', 'audio'],
    ['https://www.ximalaya.com/sound/123', 'audio'],
    ['https://music.163.com/#/song?id=123', 'audio'],
    ['https://y.qq.com/n/ryqq/songDetail/abc', 'audio'],
    ['https://open.spotify.com/episode/abc', 'audio'],
    ['https://podcasts.apple.com/cn/podcast/test/id123?i=456', 'audio'],
    ['https://www.v2ex.com/t/123', 'article'],
    ['https://stackoverflow.com/questions/123/test', 'article'],
    ['https://medium.com/@author/test-abcdef123456', 'article'],
    ['https://writer.substack.com/p/test', 'article'],
    ['https://www.reddit.com/r/test/comments/123/post', 'article'],
    ['https://x.com/user/status/123', 'article'],
    ['https://zh.wikipedia.org/wiki/Test', 'article'],
    ['https://www.huxiu.com/article/', 'webpage'],
    ['https://www.douyin.com/user/abc', 'webpage'],
  ] as const;
  for (const [url, type] of routes) assert.equal(inferType(url), type, url);
  assert.equal(findPlatform('https://music.163.com/song?id=123')?.name, '网易云音乐');
});

test('小红书选择当前笔记，兼容 undefined 字面量，保留字符串和话题', () => {
  const data = {
    note: {
      firstNoteId: 'abc123',
      noteDetailMap: {
        abc123: {
          note: {
            title: '我的笔记',
            desc: '字符串 undefined 不应被替换',
            user: { nickname: '笔记作者' },
            type: 'video',
            imageList: [{ urlDefault: 'https://cdn.example.com/note.jpg' }],
            tagList: [{ name: '生活' }, { name: '旅行' }],
          },
        },
        def456: { note: { title: '推荐笔记', user: { nickname: '其他人' } } },
      },
    },
    optional: null,
  };
  const preview = parseMetadata(
    `<script>window.__INITIAL_STATE__=${json(data).replace('"optional":null', '"optional":undefined')};throw new Error('不可执行')</script>`,
    'https://www.xiaohongshu.com/explore/abc123?xsec_token=token',
  );
  assert.equal(preview.title, '我的笔记');
  assert.equal(preview.description, '字符串 undefined 不应被替换');
  assert.equal(preview.author, '笔记作者');
  assert.equal(preview.cover, 'https://cdn.example.com/note.jpg');
  assert.deepEqual(preview.tags, ['生活', '旅行']);
  assert.equal(preview.type, 'video');
  assert.match(
    extractUrl('分享 https://www.xiaohongshu.com/explore/abc123?xsec_token=token&utm_source=share'),
    /xsec_token=token$/,
  );
});

test('抖音读取编码后的数据，按视频 ID 排除推荐，支持连续话题', () => {
  const data = {
    aweme: [
      { aweme_id: '111', desc: '推荐视频' },
      {
        aweme_id: '123',
        desc: '介绍#科技#知识',
        author: { nickname: '视频作者' },
        video: { cover: { url_list: ['https://cdn.example.com/video.jpg'] } },
        text_extra: [{ hashtag_name: '科技' }],
      },
    ],
  };
  const preview = parseMetadata(
    `<script id="RENDER_DATA">${encodeURIComponent(json(data))}</script>`,
    'https://www.douyin.com/video/123',
  );
  assert.equal(preview.title, '介绍#科技#知识');
  assert.equal(preview.author, '视频作者');
  assert.equal(preview.cover, 'https://cdn.example.com/video.jpg');
  assert.deepEqual(preview.tags, ['科技', '知识']);
});

test('快手读取当前视频的文案、作者和封面', () => {
  const data = {
    photos: [
      { photoId: 'other', caption: '推荐' },
      {
        photoId: 'abc',
        caption: '当前快手视频',
        userName: '快手作者',
        coverUrl: 'https://cdn.example.com/k.jpg',
      },
    ],
  };
  const preview = parseMetadata(
    `<script>window.INIT_STATE=${json(data)};</script>`,
    'https://www.kuaishou.com/short-video/abc',
  );
  assert.equal(preview.title, '当前快手视频');
  assert.equal(preview.author, '快手作者');
  assert.equal(preview.cover, 'https://cdn.example.com/k.jpg');
});

test('YouTube 提取作者和关键词，选择清晰封面，拒绝不匹配的视频数据', () => {
  const data = {
    videoDetails: {
      videoId: 'abcdef12345',
      title: '视频原题',
      author: '频道作者',
      shortDescription: '视频简介',
      keywords: ['技术'],
      thumbnail: {
        thumbnails: [
          { width: 120, url: 'https://cdn.example.com/s.jpg' },
          { width: 1280, url: 'https://cdn.example.com/l.jpg' },
        ],
      },
    },
  };
  const html = `<meta property="og:title" content="备用标题"><script>var ytInitialPlayerResponse = ${json(data)};someFunction();</script>`;
  const preview = parseMetadata(html, 'https://www.youtube.com/watch?v=abcdef12345');
  assert.equal(preview.author, '频道作者');
  assert.equal(preview.cover, 'https://cdn.example.com/l.jpg');
  assert.deepEqual(preview.tags, ['技术']);
  assert.equal(parseMetadata(html, 'https://www.youtube.com/watch?v=other').title, '备用标题');
});

test('小宇宙读取单集与播客信息，简书只读取公开描述和作者', () => {
  const podcast = parseMetadata(
    script('__NEXT_DATA__', {
      props: {
        pageProps: {
          episode: {
            eid: 'abc',
            title: '播客单集',
            shownotes: '<p>公开简介</p><script>bad()</script>',
            image: { picUrl: 'https://cdn.example.com/p.jpg' },
            podcast: { title: '播客节目', author: '播客作者' },
          },
        },
      },
    }),
    'https://www.xiaoyuzhoufm.com/episode/abc',
  );
  assert.equal(podcast.title, '播客单集');
  assert.equal(podcast.author, '播客作者');
  assert.equal(podcast.description, '公开简介');
  assert.equal(podcast.cover, 'https://cdn.example.com/p.jpg');
  assert.equal(podcast.type, 'audio');
  const note = parseMetadata(
    script('__NEXT_DATA__', {
      props: {
        initialState: {
          note: {
            data: {
              slug: 'abc',
              public_title: '简书文章',
              description: '免费简介',
              paid_content: '不应读取的付费内容',
              user: { nickname: '文章作者' },
              share_image_url: 'https://cdn.example.com/j.jpg',
            },
          },
        },
      },
    }),
    'https://www.jianshu.com/p/abc',
  );
  assert.equal(note.author, '文章作者');
  assert.equal(note.description, '免费简介');
  assert.equal(note.cover, 'https://cdn.example.com/j.jpg');
});

test('微博支持带美元符号的赋值变量，当前微博图文与话题可提取', () => {
  const data = [
    {
      status: {
        bid: 'Abc123',
        text_raw: '当前微博 #生活# #阅读#',
        user: { screen_name: '微博作者' },
        pic_ids: ['pic'],
        pic_infos: { pic: { large: { url: 'https://cdn.example.com/w.jpg' } } },
      },
    },
  ];
  const preview = parseMetadata(
    `<script>window.$render_data=${json(data)};</script>`,
    'https://weibo.com/123/Abc123',
  );
  assert.equal(preview.author, '微博作者');
  assert.equal(preview.cover, 'https://cdn.example.com/w.jpg');
  assert.deepEqual(preview.tags, ['生活', '阅读']);
});

test('技术网站正文作者、标签和懒加载封面可回退，不收录掘金推广关键词', () => {
  const preview = parseMetadata(
    '<h1 id="articleContentId">原始标题</h1><a class="follow-nickName">博主</a><a class="tag-link-new">#开发</a><div id="content_views"><img width="1" height="1" src="/tracking.png"><img data-original="/content.jpg"></div>',
    'https://blog.csdn.net/user/article/details/123',
  );
  assert.equal(preview.title, '原始标题');
  assert.equal(preview.author, '博主');
  assert.equal(preview.cover, 'https://blog.csdn.net/content.jpg');
  assert.deepEqual(preview.tags, ['开发']);
  const juejin = parseMetadata(
    '<h1 class="article-title">文章</h1><meta name="keywords" content="前端技术交流,前端开发社区"><script type="application/ld+json">{"@type":"Article","keywords":["JavaScript"]}</script>',
    'https://juejin.cn/post/123',
  );
  assert.deepEqual(juejin.tags, ['JavaScript']);
});

test('GitHub 仓库的拥有者和主题、音乐 JSON-LD 作者和封面可提取', () => {
  const github = parseMetadata(
    '<meta property="og:title" content="owner/repo"><meta name="octolytics-dimension-repository_nwo" content="owner/repo"><a class="topic-tag">typescript</a>',
    'https://github.com/owner/repo',
  );
  assert.equal(github.author, 'owner');
  assert.deepEqual(github.tags, ['typescript']);
  const music = parseMetadata(
    script('ignored', {}) +
      '<script type="application/ld+json">{"@type":"MusicRecording","name":"歌曲","author":{"name":"歌手"},"image":"/cover.jpg"}</script>',
    'https://music.163.com/song?id=123',
  );
  assert.equal(music.title, '歌曲');
  assert.equal(music.author, '歌手');
  assert.equal(music.type, 'audio');
});

test('不可用的小红书、脚本验证页和登录跳转保留原链接，不保存错误页封面', async () => {
  const xhsUrl = 'https://www.xiaohongshu.com/explore/abc';
  const preview = await getLinkPreview(`真实笔记标题 ${xhsUrl} #生活`, async () => ({
    url: 'https://www.xiaohongshu.com/404?source=security',
    html: '<title>小红书页面不见了</title><meta property="og:image" content="https://cdn.example.com/logo.jpg">',
  }));
  assert.equal(preview.url, xhsUrl);
  assert.equal(preview.title, '真实笔记标题');
  assert.equal(preview.cover, '');
  assert.match(preview.warning || '', /不可访问/);
  const douyin = await getLinkPreview('https://www.douyin.com/video/123', async (url) => ({
    url,
    html: '<html><body><script>document.cookie="challenge";</script></body></html>',
  }));
  assert.match(douyin.warning || '', /脚本或验证页面/);
  const weibo = await getLinkPreview('https://weibo.com/123/Abc', async () => ({
    url: 'https://passport.weibo.com/visitor/visitor',
    html: '<title>微博验证</title>',
  }));
  assert.equal(weibo.url, 'https://weibo.com/123/Abc');
  assert.match(weibo.warning || '', /登录或访问验证/);
});

test('动态数据损坏或缺失时不抛异常，错误变量名不会被识别成平台数据', () => {
  for (const url of [
    'https://www.douyin.com/video/123',
    'https://www.xiaohongshu.com/explore/abc',
    'https://www.kuaishou.com/short-video/123',
    'https://www.xiaoyuzhoufm.com/episode/abc',
  ]) {
    assert.equal(
      parseMetadata(
        '<meta property="og:title" content="备用标题"><script id="RENDER_DATA">%bad</script>',
        url,
      ).title,
      '备用标题',
    );
  }
  assert.equal(
    assignedJson(['var my__INITIAL_STATE__={"title":"错误"};'], '__INITIAL_STATE__'),
    undefined,
  );
  assert.deepEqual(
    assignedJson(
      ['window.__INITIAL_STATE__={"x":"undefined","y":undefined};'],
      '__INITIAL_STATE__',
      true,
    ),
    { x: 'undefined', y: null },
  );
  const value = parseMetadata(
    '<meta name="description" content="示例 &#160; https://example.com/a#123 #科技#知识">',
    'https://example.com',
  );
  assert.equal(value.tags.includes('160'), false);
});

test('简书和微博没有初始数据时仍保留正文中的作者与图片', () => {
  const note = parseMetadata(
    '<h1>正文标题</h1><div class="author"><a class="name">正文作者</a></div><div class="show-content"><img data-original="/content.jpg"></div>',
    'https://www.jianshu.com/p/abc',
  );
  assert.equal(note.author, '正文作者');
  assert.equal(note.cover, 'https://www.jianshu.com/content.jpg');
  const weibo = parseMetadata(
    '<h1>微博正文</h1><span class="head_name">微博作者</span>',
    'https://weibo.com/123/Abc123',
  );
  assert.equal(weibo.author, '微博作者');
});
