import { load } from 'cheerio';
import type { ContentType, LinkPreview } from '../../shared/types.ts';
import { fetchPublicHtml } from './safe-fetch.ts';

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
  const { hostname, pathname } = new URL(url);
  if (
    /video/i.test(declaredType) ||
    /(^|\.)(bilibili\.com|b23\.tv|youtube\.com|youtu\.be|douyin\.com|vimeo\.com)$/.test(hostname)
  )
    return 'video';
  if (
    /music|audio/i.test(declaredType) ||
    /(^|\.)(xiaoyuzhoufm\.com|music\.163\.com|podcasts\.apple\.com|ximalaya\.com)$/.test(hostname)
  )
    return 'audio';
  if (
    /article/i.test(declaredType) ||
    hostname === 'mp.weixin.qq.com' ||
    /\/articles?\/|\/blog\/|\/posts?\//i.test(pathname)
  )
    return 'article';
  return 'webpage';
}
export function parseMetadata(html: string, url: string): LinkPreview {
  const $ = load(html);
  function meta(...names: string[]) {
    for (const name of names) {
      const value = $(`meta[property="${name}"], meta[name="${name}"]`)
        .first()
        .attr('content')
        ?.trim();
      if (value) return value;
    }
    return '';
  }
  const hostname = new URL(url).hostname;
  const coverValue = meta('og:image', 'twitter:image', 'twitter:image:src');
  let cover = '';
  try {
    const image = new URL(coverValue, url);
    if (
      coverValue &&
      ['https:', 'http:'].includes(image.protocol) &&
      !image.username &&
      !image.password
    )
      cover = image.href;
  } catch {
    /* Invalid optional image metadata can be ignored. */
  }
  return {
    url,
    title: (
      meta('og:title', 'twitter:title') ||
      $('title').first().text().trim() ||
      hostname
    ).slice(0, 300),
    description: meta('og:description', 'twitter:description', 'description').slice(0, 5000),
    cover,
    source: (meta('og:site_name') || hostname.replace(/^www\./, '')).slice(0, 200),
    author: meta('author', 'article:author').slice(0, 200),
    type: inferType(url, meta('og:type')),
  };
}
export async function getLinkPreview(text: string): Promise<LinkPreview> {
  const url = extractUrl(text);
  try {
    const page = await fetchPublicHtml(url);
    return parseMetadata(page.html, page.url);
  } catch (error) {
    return {
      url,
      title: new URL(url).hostname,
      description: '',
      cover: '',
      source: new URL(url).hostname,
      author: '',
      type: inferType(url),
      warning: `${error instanceof Error ? error.message : '读取失败'}，可手动填写后收藏。`,
    };
  }
}
