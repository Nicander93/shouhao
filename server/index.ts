import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRepository } from './database.ts';
import { createApp } from './app.ts';
const dataDir = resolve(process.env.DATA_DIR || './data');
mkdirSync(dataDir, { recursive: true });
const host = process.env.HOST || '127.0.0.1';
const password = process.env.APP_PASSWORD || '';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !password) {
  throw new Error('远程访问必须设置 APP_PASSWORD；本机使用可保持 HOST=127.0.0.1');
}
const repository = createRepository(join(dataDir, 'shouhao.sqlite'));
const app = createApp(repository, {
  dataDir,
  password,
  staticDir: resolve('dist'),
  ai: {
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
  },
});
const server = app.listen(Number(process.env.PORT || 3000), host, () =>
  console.log(`收好已启动：http://${host}:${process.env.PORT || 3000}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      repository.close();
      process.exit(0);
    }),
  );
