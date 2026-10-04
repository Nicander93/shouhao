import { load } from 'cheerio';
import type { LinkPreview } from '../../shared/types.ts';
import { assignedJson } from './page-state.ts';
import { parseExtendedPlatformMetadata } from './extended-platform-metadata.ts';

type PlatformMetadata = Partial<Omit<LinkPreview, 'url' | 'warning'>>;

export function parsePlatformMetadata($: ReturnType<typeof load>, url: string): PlatformMetadata {
  const baseline = parseExtendedPlatformMetadata($, url);
  const { hostname, pathname } = new URL(url);
  const scripts = $('script')
    .map((_index, element) => $(element).text())
    .get();
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const record = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const plainText = (value: unknown) => {
    const fragment = load(text(value));
    fragment('script, style').remove();
    fragment('p, li, h1, h2, h3').append(' ');
    return fragment.text().replace(/\s+/g, ' ').trim();
  };
  const names = (value: unknown, key: string) =>
    Array.isArray(value) ? value.map((entry) => text(record(entry)[key])).filter(Boolean) : [];

  if (/(^|\.)bilibili\.com$/.test(hostname) && /^\/video\//.test(pathname)) {
    const state = record(assignedJson(scripts, '__INITIAL_STATE__'));
    const video = record(state.videoData);
    const owner = record(video.owner);
    return {
      ...baseline,
      title: text(video.title),
      description: text(video.desc),
      cover: text(video.pic).replace(/^http:\/\//, 'https://'),
      author: text(owner.name) || text(record(state.upData).name),
      source: '哔哩哔哩',
      type: 'video',
      tags: Array.isArray(state.tags) ? names(state.tags, 'tag_name') : undefined,
    };
  }

  if (/(^|\.)zhihu\.com$/.test(hostname)) {
    let state: Record<string, unknown> = {};
    try {
      state = record(JSON.parse($('#js-initialData').text()));
    } catch {
      /* Some public pages use a different renderer. */
    }
    const entities = record(record(state.initialState || state).entities);
    const articleId = /\/(?:p|tardis\/zm\/art)\/(\d+)/.exec(pathname)?.[1];
    const answerId = /\/answer\/(\d+)/.exec(pathname)?.[1];
    const questionId = /\/question\/(\d+)/.exec(pathname)?.[1];
    const article = record(articleId ? record(entities.articles)[articleId] : undefined);
    const answer = record(answerId ? record(entities.answers)[answerId] : undefined);
    const question = record(questionId ? record(entities.questions)[questionId] : undefined);
    const reader = record(record(assignedJson(scripts, 'g_initialProps')).renderHtml);
    const content = articleId
      ? Object.keys(article).length
        ? article
        : reader
      : answerId
        ? answer
        : question;
    const author = record(content.author);
    const authorId = String(author.id ?? content.author ?? '');
    const authorName =
      text(author.name) ||
      text(record(record(entities.users)[authorId]).name) ||
      $('.AuthorInfo-name, .Post-Author .UserLink-link').first().text().trim();
    const image = $('.RichText img, .Post-RichTextContainer img, #contentRoot img').first();
    const title =
      text(articleId ? content.title : question.title || record(answer.question).title) ||
      $('.Post-Title, .QuestionHeader-title').first().text().trim();
    const topics = content.topics || question.topics;
    return {
      ...baseline,
      title,
      description: plainText(content.excerpt || content.content).slice(
        0,
        content.excerpt ? 5000 : 400,
      ),
      cover:
        text(content.titleImage || content.imageUrl) ||
        image.attr('data-original') ||
        image.attr('data-actualsrc') ||
        image.attr('src') ||
        '',
      author: authorName,
      source: '知乎',
      type: articleId || answerId || questionId ? 'article' : undefined,
      tags: Array.isArray(topics)
        ? topics
            .map(
              (topic) =>
                text(record(topic).name) ||
                text(record(record(entities.topics)[String(record(topic).id ?? topic)]).name),
            )
            .filter(Boolean)
        : undefined,
    };
  }

  if (hostname === 'mp.weixin.qq.com') {
    const scriptText = scripts.join('\n');
    function variable(name: string) {
      const literal = new RegExp(
        '(?:var|let|const)\\s+' +
          name +
          '\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')',
      ).exec(scriptText)?.[1];
      if (!literal) return '';
      const value = literal
        .slice(1, -1)
        .replace(/\\(u[\da-fA-F]{4}|x[\da-fA-F]{2}|[^\r\n])/g, (_match, escaped: string) => {
          if (/^[ux]/.test(escaped))
            return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));
          return (
            ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[escaped] ??
            escaped
          );
        });
      return plainText(value);
    }
    return {
      ...baseline,
      title: $('#activity-name').first().text().trim() || variable('msg_title'),
      description: variable('msg_desc'),
      cover: variable('msg_cdn_url'),
      author:
        $('#js_author_name').first().text().trim() ||
        variable('author') ||
        $('#js_name').first().text().trim(),
      source: $('#js_name').first().text().trim() || variable('nickname') || '微信公众号',
      type: baseline.type,
      tags: $('.article-tag__item, .js_article_tag_name').length
        ? $('.article-tag__item, .js_article_tag_name')
            .map((_index, element) => $(element).text().trim())
            .get()
        : undefined,
    };
  }
  return baseline;
}

export function zhihuArticleReaderUrl(url: string) {
  const { hostname, pathname } = new URL(url);
  if (!['zhuanlan.zhihu.com', 'www.zhihu.com', 'zhihu.com'].includes(hostname)) return '';
  const id = /^\/p\/(\d+)\/?$/.exec(pathname)?.[1];
  return id ? `https://www.zhihu.com/tardis/zm/art/${id}` : '';
}

export function platformAccessWarning(url: string, html: string) {
  const { hostname, pathname } = new URL(url);
  if (hostname === 'mp.weixin.qq.com' && /wappoc_appmsgcaptcha|captcha|verify/.test(pathname))
    return '微信公众号要求完成验证码，暂时无法自动读取';
  if (/(^|\.)zhihu\.com$/.test(hostname) && /^\/signin/.test(pathname))
    return '知乎要求登录，暂时无法自动读取';
  const $ = load(html);
  if (/(^|\.)xiaohongshu\.com$/.test(hostname) && /^\/(404|error)(?:[/?]|$)/.test(pathname))
    return '小红书笔记当前不可访问，可能需要有效分享链接或登录';
  if (
    /^\/(?:login|signin|passport|visitor)(?:[/.]|$)/.test(pathname) ||
    /passport\.weibo\./.test(hostname)
  )
    return '网站要求登录或访问验证，暂时无法自动读取';
  const body = $('body').clone();
  body.find('script,style').remove();
  if (
    /(^|\.)(douyin\.com|iesdouyin\.com|kuaishou\.com)$/.test(hostname) &&
    !body.text().trim() &&
    !$('meta[property="og:title"], meta[name="twitter:title"], #RENDER_DATA').length
  )
    return '网站当前仅返回脚本或验证页面，暂时无法自动读取';
  if (/^(安全验证|访问验证|验证中心|Just a moment|Access Denied)/i.test($('title').text().trim()))
    return '网站要求访问验证，暂时无法自动读取';
  return '';
}
