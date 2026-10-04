import { load } from 'cheerio';
import type { ContentType, LinkPreview } from '../../shared/types.ts';
import { fetchPublicHtml } from './safe-fetch.ts';
import {
  parsePlatformMetadata,
  platformAccessWarning,
  zhihuArticleReaderUrl,
} from './platform-metadata.ts';
import { platformContentType } from './platform-rules.ts';

export function extractUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s<>"“”]+/i);
  if (!match) throw new Error('没有找到链接，请粘贴 http 或 https 地址');
  const url = new URL(match[0].replace(/[，。；、）)\]】]+$/g, ''));
  if (url.username || url.password) throw new Error('链接不能包含账号密码');
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(spm|from_spmid|share_source|share_medium|vd_source)$/i.test(key))
      url.searchParams.delete(key);
  return url.href;
}

export function inferType(url: string, declaredType = ''): ContentType {
  const knownType = platformContentType(url);
  if (knownType) return knownType;
  const { pathname } = new URL(url);
  if (/video/i.test(declaredType)) return 'video';
  if (/music|audio|podcast/i.test(declaredType)) return 'audio';
  if (
    /article|posting/i.test(declaredType) ||
    /\/(?:articles?|blog|posts?)\/[^/?#]+/i.test(pathname)
  )
    return 'article';
  return 'webpage';
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTags(values: string[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => value.split(/[,，;；\n]/))
        .map((tag) => cleanText(tag).replace(/^[#＃]+|[#＃]+$/g, ''))
        .filter((tag) => tag.length > 0 && tag.length <= 30),
    ),
  ].slice(0, 20);
}

function hashtagTags(text: string) {
  return [...text.replace(/https?:\/\/[^\s<>"“”]+/gi, '').matchAll(/[#＃]([\p{L}\p{N}_-]{1,30})/gu)]
    .map((match) => match[1])
    .filter((tag) => /\p{L}/u.test(tag));
}

function publicUrl(value: string, base: string) {
  try {
    const url = new URL(value, base);
    if (
      value &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= 2048
    )
      return url.href;
  } catch {
    // Ignore an invalid optional address and try the next candidate.
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function structuredContent($: ReturnType<typeof load>) {
  const nodes: Record<string, unknown>[] = [];
  function collect(value: unknown, depth = 0) {
    if (depth > 8) return;
    if (Array.isArray(value)) value.forEach((entry) => collect(entry, depth + 1));
    else if (isRecord(value)) {
      nodes.push(value);
      collect(value['@graph'], depth + 1);
      collect(value.mainEntity, depth + 1);
    }
  }
  $('script[type="application/ld+json"]').each((_index, element) => {
    try {
      collect(JSON.parse($(element).text()));
    } catch {
      // A broken block should not hide valid metadata elsewhere on the page.
    }
  });
  const typeOf = (node: Record<string, unknown>) =>
    (Array.isArray(node['@type']) ? node['@type'] : [node['@type']])
      .filter((value) => typeof value === 'string')
      .join(' ');
  const content =
    nodes.find((node) =>
      /Article|Posting|VideoObject|AudioObject|PodcastEpisode|MusicRecording|MusicAlbum|Recipe|Book|Product/i.test(
        typeOf(node),
      ),
    ) ||
    nodes.find((node) => /WebPage/i.test(typeOf(node))) ||
    {};
  function strings(value: unknown, keys: string[], depth = 0): string[] {
    if (depth > 5) return [];
    if (typeof value === 'string') return [cleanText(value)];
    if (Array.isArray(value)) return value.flatMap((entry) => strings(entry, keys, depth + 1));
    if (!isRecord(value)) return [];
    const resolved =
      typeof value['@id'] === 'string'
        ? nodes.find((node) => node['@id'] === value['@id']) || value
        : value;
    return keys.flatMap((key) => strings(resolved[key], keys, depth + 1));
  }
  return {
    title: strings(content.headline || content.name, ['name'])[0] || '',
    description: strings(content.description, ['name'])[0] || '',
    images: strings(content.image, ['url', 'contentUrl']).concat(
      strings(content.thumbnailUrl, ['url', 'contentUrl']),
    ),
    author: strings(content.author || content.creator, ['name']).join('、'),
    source: strings(content.publisher || content.isPartOf, ['name'])[0] || '',
    tags: strings(content.keywords, ['name']),
    type: typeOf(content),
  };
}

export function parseMetadata(html: string, url: string): LinkPreview {
  const $ = load(html);
  const metadata = new Map<string, string[]>();
  $('meta').each((_index, element) => {
    const value = cleanText($(element).attr('content') || '');
    const name = ($(element).attr('property') || $(element).attr('name') || '').toLowerCase();
    if (name && value) metadata.set(name, [...(metadata.get(name) || []), value]);
  });
  const metaValues = (...names: string[]) => names.flatMap((name) => metadata.get(name) || []);
  const meta = (...names: string[]) => metaValues(...names)[0] || '';
  function field(selector: string) {
    const element = $(selector).first();
    return cleanText(element.attr('content') || element.text());
  }
  const structured = structuredContent($);
  const platform = parsePlatformMetadata($, url);
  const hostname = new URL(url).hostname;
  const base = publicUrl($('base[href]').first().attr('href') || '', url) || url;
  const candidates = [
    platform.cover || '',
    ...metaValues(
      'og:image:secure_url',
      'og:image',
      'og:image:url',
      'twitter:image',
      'twitter:image:src',
    ),
    ...structured.images,
    $('[itemprop="image"]').first().attr('content') ||
      $('[itemprop="image"]').first().attr('src') ||
      '',
    $('link[rel="image_src"]').first().attr('href') || '',
    $('video[poster]').first().attr('poster') || '',
  ];
  $('article img, main img, #js_content img').each((_index, element) => {
    const image = $(element);
    const src = image.attr('data-src') || image.attr('data-original') || image.attr('src') || '';
    const width = Number.parseInt(image.attr('width') || '', 10);
    const height = Number.parseInt(image.attr('height') || '', 10);
    if ((width && width < 160) || (height && height < 100) || /avatar|logo|icon|emoji/i.test(src))
      return;
    candidates.push(src);
  });
  const title =
    platform.title ||
    meta('og:title', 'twitter:title') ||
    structured.title ||
    field('[itemprop="headline"], #activity-name, article h1, main h1, h1') ||
    cleanText($('title').first().text());
  const description =
    platform.description ||
    meta('og:description', 'twitter:description', 'description') ||
    structured.description ||
    field('[itemprop="description"], article p, main p, #js_content p');
  const tags = normalizeTags([
    ...(platform.tags ?? metaValues('article:tag', 'keywords', 'news_keywords')),
    ...structured.tags,
    ...$('[rel="tag"], [itemprop="keywords"]')
      .map((_index, element) => $(element).attr('content') || $(element).text())
      .get(),
    ...hashtagTags(title + ' ' + description),
  ]);
  const author =
    platform.author ||
    metaValues('author', 'byl').find((value) => !/^https?:\/\//i.test(value)) ||
    structured.author ||
    field('[itemprop="author"] [itemprop="name"], [itemprop="author"], [rel="author"], #js_name') ||
    metaValues('article:author', 'twitter:creator').find((value) => !/^https?:\/\//i.test(value)) ||
    '';
  return {
    url,
    title: (title || hostname).slice(0, 300),
    description: description.slice(0, 5000),
    cover: candidates.map((candidate) => publicUrl(candidate, base)).find(Boolean) || '',
    source: (
      platform.source ||
      meta('og:site_name', 'application-name') ||
      structured.source ||
      hostname.replace(/^www\./, '')
    ).slice(0, 200),
    author: author.slice(0, 200),
    type: platform.type || inferType(url, [meta('og:type'), structured.type].join(' ')),
    tags,
  };
}

function shareMetadata(text: string) {
  const withoutUrls = text.replace(/https?:\/\/[^\s<>"“”]+/gi, '');
  const title = withoutUrls
    .split(/\r?\n/)
    .map((line) => cleanText(line.replace(/[#＃][^\s#＃,，。;；!?！？]+/gu, '')))
    .find(
      (line) => line.length > 3 && !/复制|打开|点击|分享自|快来|推荐你看|^推荐[：: ]?$/.test(line),
    );
  return {
    title: (title || '').replace(/^[【「《]|[】」》，。；、）)\]]+$/g, '').slice(0, 300),
    tags: normalizeTags(hashtagTags(withoutUrls)),
  };
}

export async function getLinkPreview(
  text: string,
  fetchHtml = fetchPublicHtml,
): Promise<LinkPreview> {
  const url = extractUrl(text);
  const shared = shareMetadata(text);
  let preview: LinkPreview;
  let failure = '';
  try {
    const deadline = Date.now() + 12_000;
    let page: Awaited<ReturnType<typeof fetchPublicHtml>>;
    let readerUsed = false;
    try {
      page = await fetchHtml(url, 0, deadline);
    } catch (error) {
      const readerUrl = zhihuArticleReaderUrl(url);
      if (!readerUrl || !(error instanceof Error) || !/^网页返回 403$/.test(error.message))
        throw error;
      page = await fetchHtml(readerUrl, 0, deadline);
      readerUsed = true;
    }
    const accessWarning = platformAccessWarning(page.url, page.html);
    if (accessWarning) throw new Error(accessWarning);
    preview = parseMetadata(page.html, page.url);
    if (readerUsed) preview.url = url;
  } catch (error) {
    failure = error instanceof Error ? error.message : '读取失败';
    preview = {
      url,
      title: new URL(url).hostname,
      description: '',
      cover: '',
      source: new URL(url).hostname,
      author: '',
      type: inferType(url),
      tags: [],
    };
    const platform = parsePlatformMetadata(load(''), url);
    preview.source = platform.source || preview.source;
    preview.type = platform.type || preview.type;
  }
  if (preview.title === new URL(preview.url).hostname && shared.title) preview.title = shared.title;
  preview.tags = normalizeTags([...preview.tags, ...shared.tags]);
  const missing = [
    preview.title === new URL(preview.url).hostname ? '标题' : '',
    !preview.cover ? '封面' : '',
  ].filter(Boolean);
  if (failure || missing.length)
    preview.warning = [
      failure,
      missing.length ? '未读取到' + missing.join('、') : '',
      '已保留可提取的信息，可补全后收藏。',
    ]
      .filter(Boolean)
      .join('；');
  return preview;
}
