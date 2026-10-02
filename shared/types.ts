export const contentTypes = ['webpage', 'article', 'video', 'audio', 'note', 'image'] as const;
export type ContentType = (typeof contentTypes)[number];
export type ItemStatus = 'unread' | 'done';
export interface CollectionItem {
  id: string;
  title: string;
  type: ContentType;
  url: string;
  content: string;
  description: string;
  cover: string;
  source: string;
  author: string;
  tags: string[];
  status: ItemStatus;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}
export type ItemInput = Omit<CollectionItem, 'id' | 'createdAt' | 'updatedAt'>;
export interface LinkPreview {
  title: string;
  description: string;
  cover: string;
  source: string;
  author: string;
  type: ContentType;
  url: string;
  warning?: string;
}
export interface AiSuggestion {
  title: string;
  description: string;
  tags: string[];
}
export interface AppConfig {
  aiEnabled: boolean;
  authenticated: boolean;
  requiresPassword: boolean;
}
