import type { ContentType } from '../../shared/types.ts';

export interface PlatformRule {
  id: string;
  name: string;
  domains: string[];
  paths: Partial<Record<'article' | 'video' | 'audio', RegExp>>;
  author?: string;
  tags?: string;
  title?: string;
  cover?: string;
}

export const platformRules: PlatformRule[] = [
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    domains: ['bilibili.com'],
    paths: { video: /^\/video\//, article: /^\/read\//, audio: /^\/audio\// },
  },
  { id: 'b23', name: '哔哩哔哩', domains: ['b23.tv'], paths: { video: /^\/.+/ } },
  {
    id: 'zhihu',
    name: '知乎',
    domains: ['zhihu.com'],
    paths: { article: /^\/(p\/\d+|question\/\d+|tardis\/zm\/art\/\d+)/ },
  },
  {
    id: 'wechat',
    name: '微信公众号',
    domains: ['mp.weixin.qq.com'],
    paths: { article: /^\/s(?:[/?]|$)/ },
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    domains: ['xiaohongshu.com', 'xhslink.com'],
    paths: { article: /^\/(explore\/|discovery\/item\/|a\/|o\/)/ },
  },
  {
    id: 'douyin',
    name: '抖音',
    domains: ['douyin.com', 'iesdouyin.com'],
    paths: { video: /^\/(video\/|share\/video\/|m\/video\/)/, article: /^\/note\// },
  },
  {
    id: 'kuaishou',
    name: '快手',
    domains: ['kuaishou.com', 'gifshow.com'],
    paths: { video: /^\/(short-video\/|photo\/|fw\/photo\/)/ },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domains: ['youtube.com', 'youtu.be'],
    paths: { video: /^\/(watch\?.*\bv=|shorts\/|embed\/|live\/)/ },
  },
  { id: 'vimeo', name: 'Vimeo', domains: ['vimeo.com'], paths: { video: /^\/(?:video\/)?\d+/ } },
  { id: 'iqiyi', name: '爱奇艺', domains: ['iqiyi.com'], paths: { video: /^\/v_[\w]+\.html/ } },
  { id: 'youku', name: '优酷', domains: ['youku.com'], paths: { video: /^\/v_show\/id_/ } },
  {
    id: 'tencent-video',
    name: '腾讯视频',
    domains: ['v.qq.com'],
    paths: { video: /^\/(x\/(cover|page)\/|cover\/)/ },
  },
  { id: 'mango', name: '芒果TV', domains: ['mgtv.com'], paths: { video: /^\/b\/\d+\// } },
  {
    id: 'weibo',
    name: '微博',
    domains: ['weibo.com', 'weibo.cn'],
    paths: { article: /^\/(detail\/|status\/|\d+\/\w+|ttarticle\/)/ },
    author: '.head_name, .username',
    tags: 'a[href*="search?containerid=100808"], a[href*="s.weibo.com/weibo"]',
  },
  {
    id: 'douban',
    name: '豆瓣',
    domains: ['douban.com'],
    paths: { article: /^\/(note\/|review\/|group\/topic\/)/ },
    author: '.note-author, .note-header .author, .main-hd .name',
    tags: '.note-tags a, .review-tags a',
    cover: '#mainpic img',
  },
  {
    id: 'toutiao',
    name: '今日头条',
    domains: ['toutiao.com'],
    paths: { article: /^\/(article\/|i\d+)/, video: /^\/video\// },
    author: '.article-author .name, .article-author-name',
  },
  {
    id: 'baijiahao',
    name: '百家号',
    domains: ['baijiahao.baidu.com'],
    paths: { article: /^\/s\?/ },
    author: '.author-name',
  },
  {
    id: 'tencent-news',
    name: '腾讯新闻',
    domains: ['news.qq.com'],
    paths: { article: /^\/(rain\/a\/|a\/)/ },
    author: '.author-name, .qq_author',
  },
  {
    id: 'netease-news',
    name: '网易新闻',
    domains: ['163.com'],
    paths: { article: /\/article\/|\/\d{2}\/.*\.html/ },
    author: '.post_author, .post_info a',
  },
  {
    id: 'sohu',
    name: '搜狐',
    domains: ['sohu.com'],
    paths: { article: /^\/a\// },
    author: '.user-info h4, .user-info .name',
  },
  { id: 'ifeng', name: '凤凰网', domains: ['ifeng.com'], paths: { article: /^\/c\// } },
  {
    id: 'thepaper',
    name: '澎湃新闻',
    domains: ['thepaper.cn'],
    paths: { article: /newsDetail_forward/ },
    author: '.news_about .name, .news_about',
  },
  {
    id: 'csdn',
    name: 'CSDN',
    domains: ['csdn.net'],
    paths: { article: /\/article\/details\// },
    author: '.follow-nickName, #uid',
    tags: '.tag-link, .tag-link-new',
    title: '#articleContentId',
    cover: '#content_views img',
  },
  {
    id: 'juejin',
    name: '掘金',
    domains: ['juejin.cn'],
    paths: { article: /^\/post\// },
    author: '.author-info-block .username, .author-name',
    tags: '.tag-list .tag, .tag-list-box .tag',
    title: '.article-title',
    cover: '.article-content img',
  },
  {
    id: 'cnblogs',
    name: '博客园',
    domains: ['cnblogs.com'],
    paths: { article: /\/(p|articles)\/.+\.html/ },
    author: '#Header1_HeaderTitle, #blogTitle .headermaintitle',
    tags: '#BlogPostCategory a, #EntryTag a',
    title: '#cb_post_title_url',
    cover: '#cnblogs_post_body img',
  },
  {
    id: 'jianshu',
    name: '简书',
    domains: ['jianshu.com'],
    paths: { article: /^\/p\// },
    author: '.author .name',
    tags: '.note .tag',
    cover: '.show-content img',
  },
  {
    id: 'segmentfault',
    name: '思否',
    domains: ['segmentfault.com'],
    paths: { article: /^\/(a|q)\// },
    author: '.author a',
    tags: '.tag-list .tag',
    cover: '.article-content img',
  },
  {
    id: '51cto',
    name: '51CTO',
    domains: ['51cto.com'],
    paths: { article: /\/article\/|\/art\/|\/\d+\/\d+/ },
    author: '.author-name',
  },
  {
    id: 'infoq',
    name: 'InfoQ',
    domains: ['infoq.cn', 'infoq.com'],
    paths: { article: /^\/(article|articles|news)\// },
    author: '.author-name, .author__name',
  },
  {
    id: 'sspai',
    name: '少数派',
    domains: ['sspai.com'],
    paths: { article: /^\/post\// },
    author: '.article-author .nickname, .author-name',
    tags: '.article-tag a',
    cover: '.article-content img',
  },
  {
    id: '36kr',
    name: '36氪',
    domains: ['36kr.com'],
    paths: { article: /^\/p\// },
    author: '.author-name, .article-author',
    cover: '.article-content img',
  },
  {
    id: 'huxiu',
    name: '虎嗅',
    domains: ['huxiu.com'],
    paths: { article: /^\/article\/[\w-]+(?:\.html)?/ },
    author: '.author-name',
    cover: '.article-content img',
  },
  {
    id: 'xiaoyuzhou',
    name: '小宇宙',
    domains: ['xiaoyuzhoufm.com'],
    paths: { audio: /^\/episode\// },
  },
  {
    id: 'ximalaya',
    name: '喜马拉雅',
    domains: ['ximalaya.com'],
    paths: { audio: /^\/sound\/|\/\d+\/\d+(?:[/?#]|$)/ },
  },
  {
    id: 'netease-music',
    name: '网易云音乐',
    domains: ['music.163.com'],
    paths: { audio: /(?:\/|#\/)song\?/ },
  },
  {
    id: 'qq-music',
    name: 'QQ音乐',
    domains: ['y.qq.com'],
    paths: { audio: /\/(songDetail|song)\// },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    domains: ['spotify.com'],
    paths: { audio: /^\/(?:intl-[^/]+\/)?(episode|track)\// },
  },
  {
    id: 'apple-podcasts',
    name: 'Apple Podcasts',
    domains: ['podcasts.apple.com'],
    paths: { audio: /\/podcast\// },
  },
  { id: 'github', name: 'GitHub', domains: ['github.com'], paths: {}, tags: '.topic-tag' },
  {
    id: 'v2ex',
    name: 'V2EX',
    domains: ['v2ex.com'],
    paths: { article: /^\/t\// },
    author: '.header small a[href^="/member/"]',
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    domains: ['stackoverflow.com'],
    paths: { article: /^\/questions\// },
    tags: '.post-tag',
  },
  {
    id: 'medium',
    name: 'Medium',
    domains: ['medium.com'],
    paths: { article: /^\/(?:@[^/]+|[^/]+)\/[^/]+-[\da-f]{10,}/ },
  },
  {
    id: 'substack',
    name: 'Substack',
    domains: ['substack.com'],
    paths: { article: /^\/p\// },
    author: '.byline-names',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    domains: ['reddit.com'],
    paths: { article: /^\/r\/[^/]+\/comments\// },
  },
  {
    id: 'x',
    name: 'X',
    domains: ['x.com', 'twitter.com'],
    paths: { article: /^\/[^/]+\/status\// },
  },
  {
    id: 'wikipedia',
    name: '维基百科',
    domains: ['wikipedia.org'],
    paths: { article: /^\/wiki\// },
    title: '#firstHeading',
  },
];

export function findPlatform(url: string) {
  const hostname = new URL(url).hostname;
  // A narrower domain wins, so music.163.com does not become 网易新闻.
  return platformRules
    .map((rule) => ({
      rule,
      length: Math.max(
        0,
        ...rule.domains
          .filter((domain) => hostname === domain || hostname.endsWith('.' + domain))
          .map((domain) => domain.length),
      ),
    }))
    .filter(({ length }) => length > 0)
    .sort((a, b) => b.length - a.length)[0]?.rule;
}

export function platformContentType(url: string): ContentType | undefined {
  const parsed = new URL(url);
  if (parsed.hostname === 'youtu.be' && /^\/[\w-]{11}(?:[/?#]|$)/.test(parsed.pathname))
    return 'video';
  if (['v.douyin.com', 'v.kuaishou.com'].includes(parsed.hostname) && parsed.pathname !== '/')
    return 'video';
  const rule = findPlatform(url);
  const path = parsed.pathname + parsed.search + parsed.hash;
  return (['video', 'audio', 'article'] as const).find((type) => rule?.paths[type]?.test(path));
}
