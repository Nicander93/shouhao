import { z } from 'zod';
import { contentTypes } from '../shared/types.ts';
export const publicUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, '请输入 http 或 https 链接');
export const itemSchema = z
  .object({
    title: z.string().trim().min(1, '请填写标题').max(300),
    type: z.enum(contentTypes),
    url: publicUrl.default(''),
    content: z.string().max(100_000).default(''),
    description: z.string().max(5000).default(''),
    cover: z
      .string()
      .max(2048)
      .refine(
        (value) =>
          !value ||
          /^\/uploads\/[\w-]+\.(png|jpg|webp|gif)$/.test(value) ||
          publicUrl.safeParse(value).success,
        '封面地址无效',
      )
      .default(''),
    source: z.string().max(200).default(''),
    author: z.string().max(200).default(''),
    tags: z
      .array(z.string().trim().min(1).max(30))
      .max(20)
      .default([])
      .transform((tags) => [...new Set(tags)]),
    status: z.enum(['unread', 'done']).default('unread'),
    starred: z.boolean().default(false),
  })
  .superRefine((item, ctx) => {
    if (!['note', 'image'].includes(item.type) && !item.url)
      ctx.addIssue({ code: 'custom', path: ['url'], message: '请填写原文链接' });
    if (item.type === 'image' && !item.cover)
      ctx.addIssue({ code: 'custom', path: ['cover'], message: '请选择图片' });
    if (item.type === 'note' && !item.content.trim())
      ctx.addIssue({ code: 'custom', path: ['content'], message: '请填写速记内容' });
  });
export const previewSchema = z.object({ url: publicUrl.refine(Boolean, '请填写链接') });
export const aiSchema = z.object({
  title: z.string().max(300),
  content: z.string().max(100_000),
  description: z.string().max(5000),
});
export const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(1000),
  tags: z.array(z.string().trim().min(1).max(30)).max(5),
});
