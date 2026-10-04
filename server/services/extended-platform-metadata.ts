import { load } from 'cheerio';
import type { LinkPreview } from '../../shared/types.ts';
import { findPlatform, platformContentType } from './platform-rules.ts';
import { assignedJson, jsonScript, record, text } from './page-state.ts';

export function parseExtendedPlatformMetadata(
  $: ReturnType<typeof load>,
  url: string,
): Partial<Omit<LinkPreview, 'url' | 'warning'>> {
  const rule = findPlatform(url);
  if (!rule) return {};
  const parsed = new URL(url);
  const contentType = platformContentType(url);
  const field = (selector?: string) => (selector ? $(selector).first().text().trim() : '');
  const image = rule.cover
    ? $(rule.cover)
        .filter((_i, element) => {
          const candidate = $(element);
          const src =
            candidate.attr('data-original-src') ||
            candidate.attr('data-original') ||
            candidate.attr('data-actualsrc') ||
            candidate.attr('data-src') ||
            candidate.attr('src') ||
            '';
          const width = Number.parseInt(candidate.attr('width') || '', 10);
          const height = Number.parseInt(candidate.attr('height') || '', 10);
          return (
            !/avatar|logo|icon|emoji/i.test(src) &&
            !(width && width < 160) &&
            !(height && height < 100)
          );
        })
        .first()
    : undefined;
  const baseline = {
    source: rule.name,
    type: contentType,
    title: contentType ? field(rule.title) : '',
    author: contentType ? field(rule.author) : '',
    tags:
      rule.tags && $(rule.tags).length
        ? $(rule.tags)
            .map((_i, e) => $(e).text().trim())
            .get()
        : undefined,
    cover: contentType
      ? image?.attr('data-original-src') ||
        image?.attr('data-original') ||
        image?.attr('data-actualsrc') ||
        image?.attr('data-src') ||
        image?.attr('src') ||
        ''
      : '',
  };
  const scripts = $('script')
    .map((_i, e) => $(e).text())
    .get();
  const next = record(jsonScript($, '__NEXT_DATA__'));
  const htmlText = (value: unknown) => {
    const fragment = load(text(value));
    fragment('script,style').remove();
    fragment('p,li,br').append(' ');
    return fragment.text().replace(/\s+/g, ' ').trim();
  };
  const names = (value: unknown, key: string) =>
    Array.isArray(value)
      ? value.map((entry) => text(record(entry)[key]) || text(entry)).filter(Boolean)
      : undefined;
  const imageUrl = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(imageUrl).find(Boolean) || '';
    if (typeof value !== 'object' || value === null) return '';
    const image = record(value);
    return (
      text(image.url || image.picUrl || image.urlDefault || image.url_pre || image.urlPre) ||
      imageUrl(image.url_list || image.urlList)
    );
  };

  if (rule.id === 'xiaohongshu') {
    const state = record(assignedJson(scripts, '__INITIAL_STATE__', true));
    const id = /\/(?:explore|discovery\/item)\/([\da-f]+)/i.exec(parsed.pathname)?.[1];
    const notes = record(state.note);
    const selectedId = id || text(notes.firstNoteId);
    const note = record(record(record(notes.noteDetailMap)[selectedId]).note);
    return {
      ...baseline,
      title: text(note.title),
      description: text(note.desc),
      author: text(record(note.user).nickname),
      cover: imageUrl(note.imageList),
      tags: names(note.tagList, 'name'),
      type: note.type === 'video' ? 'video' : baseline.type,
    };
  }

  if (rule.id === 'douyin') {
    const id =
      /\/(?:video|note)\/(\d+)/.exec(parsed.pathname)?.[1] ||
      /\/share\/video\/(\d+)/.exec(parsed.pathname)?.[1];
    const state = jsonScript($, 'RENDER_DATA', true) || assignedJson(scripts, '_ROUTER_DATA');
    const video = findEntry(
      state,
      (entry) => Boolean(id) && String(entry.aweme_id ?? entry.awemeId ?? '') === id,
    );
    return {
      ...baseline,
      title: text(video.desc || video.description),
      description: text(video.desc || video.description),
      author: text(record(video.author).nickname),
      cover:
        imageUrl(
          record(video.video).cover ||
            record(video.video).origin_cover ||
            record(video.video).originCover,
        ) || imageUrl(video.images),
      tags: names(video.text_extra, 'hashtag_name') || names(video.textExtra, 'hashtagName'),
    };
  }

  if (rule.id === 'kuaishou') {
    const id = /\/(?:short-video|photo|fw\/photo)\/([\w-]+)/.exec(parsed.pathname)?.[1];
    const state =
      assignedJson(scripts, 'INIT_STATE') || assignedJson(scripts, '__APOLLO_STATE__') || next;
    const photo = findEntry(
      state,
      (entry) =>
        Boolean(id) &&
        String(entry.photoId ?? entry.photo_id ?? entry.id ?? '') === id &&
        Boolean(entry.caption || entry.coverUrl),
    );
    return {
      ...baseline,
      title: text(photo.caption),
      description: text(photo.caption),
      author: text(photo.userName) || text(record(photo.user).name),
      cover: imageUrl(photo.coverUrl || photo.coverUrls || photo.poster),
    };
  }

  if (rule.id === 'youtube') {
    const state = record(assignedJson(scripts, 'ytInitialPlayerResponse'));
    const video = record(state.videoDetails);
    const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).at(-1);
    if (video.videoId && text(video.videoId) !== id) return baseline;
    const thumbnails = record(video.thumbnail).thumbnails;
    const images = Array.isArray(thumbnails)
      ? thumbnails.map(record).sort((a, b) => Number(b.width || 0) - Number(a.width || 0))
      : [];
    return {
      ...baseline,
      title: text(video.title),
      description: text(video.shortDescription),
      author: text(video.author),
      cover: imageUrl(images),
      tags: names(video.keywords, 'name'),
    };
  }

  if (rule.id === 'xiaoyuzhou') {
    const props = record(record(next.props).pageProps);
    const episode = record(props.episode);
    const episodeId = /^\/episode\/([^/?]+)/.exec(parsed.pathname)?.[1];
    if (episode.eid && episodeId && text(episode.eid) !== episodeId) return baseline;
    const podcast = record(episode.podcast || props.podcast);
    return {
      ...baseline,
      title: text(episode.title) || text(podcast.title),
      description: htmlText(episode.description || episode.shownotes || podcast.description).slice(
        0,
        400,
      ),
      author: text(podcast.author) || text(podcast.title),
      cover: imageUrl(episode.image || podcast.image),
      tags: names(episode.tags, 'name'),
    };
  }

  if (rule.id === 'jianshu') {
    const note = record(record(record(record(next.props).initialState).note).data);
    if (note.slug && text(note.slug) !== parsed.pathname.split('/').at(-1)) return baseline;
    return {
      ...baseline,
      title: text(note.public_title) || baseline.title,
      author: text(record(note.user).nickname) || baseline.author,
      description: htmlText(note.description || note.free_content).slice(0, 400),
      cover: text(note.share_image_url) || baseline.cover,
    };
  }

  if (rule.id === 'weibo') {
    const id = parsed.pathname.split('/').filter(Boolean).at(-1);
    const state = assignedJson(scripts, '$render_data') || next;
    const status = findEntry(
      state,
      (entry) =>
        Boolean(id) &&
        [entry.id, entry.mid, entry.bid].some((value) => String(value ?? '') === id) &&
        Boolean(entry.text_raw || entry.text),
    );
    const pictures = record(status.pic_infos);
    const pictureId = Array.isArray(status.pic_ids) ? String(status.pic_ids[0] || '') : '';
    return {
      ...baseline,
      title: htmlText(status.text_raw || status.text).slice(0, 300) || baseline.title,
      description: htmlText(status.text_raw || status.text),
      author: text(record(status.user).screen_name) || baseline.author,
      cover: imageUrl(record(pictures[pictureId]).large) || imageUrl(status.pics) || baseline.cover,
    };
  }

  if (rule.id === 'github') {
    const repository = $('meta[name="octolytics-dimension-repository_nwo"]').attr('content') || '';
    return { ...baseline, author: repository.split('/')[0] || '' };
  }
  // The site's search-engine keywords are not the article's own labels.
  if (rule.id === 'juejin' && !baseline.tags) return { ...baseline, tags: [] };
  return baseline;
}

function findEntry(value: unknown, matches: (entry: Record<string, unknown>) => boolean) {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let remaining = 5000;
  while (pending.length && remaining-- > 0) {
    const current = pending.pop();
    if (!current || current.depth > 10) continue;
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ value, depth: current.depth + 1 });
    } else {
      const entry = record(current.value);
      if (matches(entry)) return entry;
      for (const value of Object.values(entry))
        if (typeof value === 'object' && value !== null)
          pending.push({ value, depth: current.depth + 1 });
    }
  }
  return {};
}
