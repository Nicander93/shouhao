import type { CollectionItem, ContentType, ItemInput } from '../../shared/types';
export const typeLabels: Record<ContentType, string> = {
  webpage: '网页',
  article: '文章',
  video: '视频',
  audio: '音频',
  note: '速记',
  image: '图片',
};
export function emptyItem(type: ContentType = 'webpage'): ItemInput {
  return {
    title: '',
    type,
    url: '',
    content: '',
    description: '',
    cover: '',
    source: '',
    author: '',
    tags: [],
    status: 'unread',
    starred: false,
  };
}
export function itemInput(item: CollectionItem): ItemInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = item;
  return input;
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}
export function filterItems(
  items: CollectionItem[],
  filter: { query: string; type: string; status: string; tag: string; starred: boolean },
) {
  const query = filter.query.toLocaleLowerCase().trim();
  return items.filter((item) => {
    if (filter.type && item.type !== filter.type) return false;
    if (filter.status && item.status !== filter.status) return false;
    if (filter.tag && !item.tags.includes(filter.tag)) return false;
    if (filter.starred && !item.starred) return false;
    return (
      !query ||
      [item.title, item.content, item.description, item.source, item.author, ...item.tags]
        .join('\n')
        .toLocaleLowerCase()
        .includes(query)
    );
  });
}
export function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    return Promise.reject(new Error('支持 PNG、JPG、WebP 和 GIF 图片'));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('图片大小需在 8 MB 以内'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}
