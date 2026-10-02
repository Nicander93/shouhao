import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { suggestOrganization } from '../server/services/ai.ts';

test('AI 兼容接口的认证、输入截断、建议解析与异常格式', async () => {
  let malformed = false;
  let received: { headers: http.IncomingHttpHeaders; body: Record<string, any> } | undefined;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) };
    assert.equal(req.url, '/v1/chat/completions');
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: malformed
                ? 'not json'
                : '```json\n{"title":"整理后的标题","description":"简短摘要","tags":["学习"]}\n```',
            },
          },
        ],
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const config = {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`,
    apiKey: 'test-key',
    model: 'test-model',
  };
  try {
    const result = await suggestOrganization(
      { title: '标题', description: '描述', content: '甲'.repeat(15_000) },
      config,
    );
    assert.equal(result.title, '整理后的标题');
    assert.deepEqual(result.tags, ['学习']);
    assert.equal(received?.headers.authorization, 'Bearer test-key');
    assert.equal(received?.body.model, 'test-model');
    assert.equal(JSON.parse(received?.body.messages[1].content).content.length, 12_000);
    malformed = true;
    await assert.rejects(
      suggestOrganization({ title: '标题', content: '', description: '' }, config),
      /格式不正确/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
