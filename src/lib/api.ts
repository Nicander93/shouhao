import type {
  AiSuggestion,
  AppConfig,
  CollectionItem,
  ItemInput,
  LinkPreview,
} from '../../shared/types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    // 页面在 useAppSession 里听这个事件，收回登录页。
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.error || '请求失败，请检查网络后重试');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export const api = {
  // 会话
  config: () => request<AppConfig>('/config'),
  login: (password: string) => request('/session', json('POST', { password })),
  logout: () => request('/session', { method: 'DELETE' }),

  // 收藏
  list: () => request<CollectionItem[]>('/items'),
  save: (input: ItemInput, id?: string) =>
    request<CollectionItem>(id ? `/items/${id}` : '/items', json(id ? 'PUT' : 'POST', input)),
  remove: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),

  // 识别、整理、图片
  preview: (text: string, signal?: AbortSignal) =>
    request<LinkPreview>('/preview', { ...json('POST', { text }), signal }),
  organize: (input: Pick<ItemInput, 'title' | 'content' | 'description'>, signal?: AbortSignal) =>
    request<AiSuggestion>('/ai/organize', { ...json('POST', input), signal }),
  upload: (data: string, name: string) =>
    request<{ url: string }>('/uploads', json('POST', { data, name })),
};
