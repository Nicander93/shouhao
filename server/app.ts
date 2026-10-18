import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ItemRepository } from './database.ts';
import { itemSchema, aiSchema } from './validation.ts';
import { extractUrl, getLinkPreview } from './services/metadata.ts';
import { suggestOrganization } from './services/ai.ts';
import type { AiConfig } from './services/ai.ts';

export interface ServerConfig {
  dataDir: string;
  password: string;
  ai: AiConfig;
  staticDir: string;
}
export function createApp(repository: ItemRepository, config: ServerConfig) {
  const app = express();
  const uploadDir = join(config.dataDir, 'uploads');
  mkdirSync(uploadDir, { recursive: true });
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '12mb' }));
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { count: number; expires: number }>();
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    for (const [key, expiry] of sessions) if (expiry <= Date.now()) sessions.delete(key);
    for (const [key, value] of attempts) if (value.expires <= Date.now()) attempts.delete(key);
  }, 60_000);
  timer.unref();

  function sessionToken(req: Request) {
    return (
      req.headers.cookie
        ?.split('; ')
        .find((value) => value.startsWith('shouhao_session='))
        ?.split('=')[1] || ''
    );
  }

  function authenticated(req: Request) {
    return !config.password || (sessions.get(sessionToken(req)) || 0) > Date.now();
  }

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get('Origin');
    // Compare the external host, including when deployed behind a reverse proxy.
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('Host')) {
          res.status(403).json({ error: '请求来源不匹配' });
          return;
        }
      } catch {
        res.status(403).json({ error: '请求来源无效' });
        return;
      }
    }
    if (req.get('Sec-Fetch-Site') === 'cross-site') {
      res.status(403).json({ error: '不接受跨站请求' });
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (req, res) => {
    res.json({
      aiEnabled: Boolean(config.ai.apiKey && config.ai.model),
      authenticated: authenticated(req),
      requiresPassword: Boolean(config.password),
    });
  });

  app.post('/api/session', (req, res) => {
    const key = req.socket.remoteAddress || 'unknown';
    const current = attempts.get(key);
    if (current && current.expires > Date.now() && current.count >= 10) {
      res.status(429).json({ error: '尝试次数过多，请 15 分钟后重试' });
      return;
    }
    const supplied = Buffer.from(typeof req.body?.password === 'string' ? req.body.password : '');
    const expected = Buffer.from(config.password);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      const active = current && current.expires > Date.now();
      attempts.set(key, {
        count: (active ? current.count : 0) + 1,
        expires: active ? current.expires : Date.now() + 15 * 60_000,
      });
      res.status(401).json({ error: '密码不正确' });
      return;
    }
    attempts.delete(key);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + sessionTtl);
    // The request Origin reflects HTTPS even behind a TLS-terminating proxy.
    const secure = req.secure || req.get('Origin')?.startsWith('https://');
    res.cookie('shouhao_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: Boolean(secure),
      maxAge: sessionTtl,
    });
    res.json({ ok: true });
  });

  app.use(['/api', '/uploads'], (req, res, next) => {
    if (!authenticated(req)) {
      res.status(401).json({ error: '请先输入访问密码' });
      return;
    }
    next();
  });

  app.delete('/api/session', (req, res) => {
    sessions.delete(sessionToken(req));
    res.clearCookie('shouhao_session');
    res.json({ ok: true });
  });

  // 收藏
  app.get('/api/items', (_req, res) => {
    res.json(repository.list());
  });

  app.post('/api/items', (req, res) => {
    const input = itemSchema.parse(req.body);
    if (input.url) input.url = extractUrl(input.url);
    if (input.url && repository.findUrl(input.url)) {
      res.status(409).json({ error: '这个链接已经收藏过了' });
      return;
    }
    res.status(201).json(repository.save(input));
  });

  app.put('/api/items/:id', (req, res) => {
    const id = String(req.params.id);
    if (!repository.get(id)) {
      res.status(404).json({ error: '收藏不存在' });
      return;
    }
    const input = itemSchema.parse(req.body);
    if (input.url) input.url = extractUrl(input.url);
    const duplicate = input.url ? repository.findUrl(input.url) : undefined;
    if (duplicate && duplicate.id !== id) {
      res.status(409).json({ error: '这个链接已经收藏过了' });
      return;
    }
    res.json(repository.save(input, id));
  });

  app.delete('/api/items/:id', (req, res) => {
    if (!repository.remove(String(req.params.id))) {
      res.status(404).json({ error: '收藏不存在' });
      return;
    }
    res.status(204).end();
  });

  app.post('/api/preview', async (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(6000) }).parse(req.body);
    try {
      res.json(await getLinkPreview(text));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : '链接格式不正确' });
    }
  });

  app.post('/api/ai/organize', async (req, res) => {
    if (!config.ai.apiKey || !config.ai.model) {
      res.status(503).json({ error: '尚未配置 AI 服务，可以先手动整理' });
      return;
    }
    const input = aiSchema.parse(req.body);
    try {
      res.json(await suggestOrganization(input, config.ai));
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'AI 服务暂不可用' });
    }
  });

  app.post('/api/uploads', (req, res) => {
    const input = z
      .object({ data: z.string().max(11_200_000), name: z.string().max(300) })
      .parse(req.body);
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      input.data,
    );
    if (!match) {
      res.status(400).json({ error: '支持 PNG、JPG、WebP 和 GIF 图片' });
      return;
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: '图片大小需在 8 MB 以内' });
      return;
    }
    const type = match[1];
    const valid =
      type === 'png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === 'jpeg'
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : type === 'gif'
            ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
            : bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) {
      res.status(400).json({ error: '图片内容与格式不一致' });
      return;
    }
    const filename = `${randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`;
    writeFileSync(join(uploadDir, filename), bytes, { flag: 'wx' });
    res.status(201).json({ url: `/uploads/${filename}` });
  });

  app.get('/api/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="shouhao-export.json"');
    res.json({ version: 1, exportedAt: new Date().toISOString(), items: repository.list() });
  });

  app.use('/uploads', express.static(uploadDir, { index: false }));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  app.use(express.static(config.staticDir, { index: false }));

  app.get('/', (_req, res) => {
    res.sendFile(join(config.staticDir, 'index.html'));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message || '输入格式不正确' });
      return;
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
      res.status(413).json({ error: '上传内容过大' });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: '请求内容格式不正确' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: '操作失败，请稍后重试' });
  });
  return app;
}
