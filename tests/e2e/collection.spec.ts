import { test, expect, type Page } from '@playwright/test';
import type { LinkPreview } from '../../shared/types';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ request }) => {
  const items = await (await request.get('/api/items')).json();
  for (const item of items) await request.delete(`/api/items/${item.id}`);
});

test('桌面：新增速记、标签、搜索、状态、编辑、刷新与删除', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一件收藏' }).click();
  await page.getByRole('tab', { name: '速记' }).click();
  await page.getByLabel('标题', { exact: true }).fill('关于收藏的想法');
  await page.getByLabel('速记内容').fill('保留有价值的内容，稍后慢慢看。');
  await page.getByLabel('标签', { exact: true }).fill('产品,思考');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '关于收藏的想法' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '关于收藏的想法' })).toBeVisible();
  await page.getByRole('button', { name: '标为看过 关于收藏的想法' }).click();
  await expect(page.getByRole('button', { name: '标为待看 关于收藏的想法' })).toBeVisible();
  await page.getByLabel('搜索收藏').fill('不存在的关键词');
  await expect(page.getByRole('heading', { name: '还没有符合条件的收藏' })).toBeVisible();
  await page.getByLabel('搜索收藏').fill('稍后');
  await page.getByRole('button', { name: '查看 关于收藏的想法' }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('标题', { exact: true }).fill('重新整理的想法');
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('heading', { name: '重新整理的想法' })).toBeVisible();
  await page.getByRole('button', { name: '查看 重新整理的想法' }).click();
  await page.getByRole('button', { name: '删除收藏', exact: true }).click();
  await page.getByRole('button', { name: '确定删除', exact: true }).click();
  await expect(page.getByRole('heading', { name: '第一件收藏，从喜欢开始' })).toBeVisible();
});

test('手机：上传图片与侧栏，页面没有横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await page.getByRole('tab', { name: '图片' }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: '灵感.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByAltText('已选择的图片')).toBeVisible();
  await page.getByRole('button', { name: '收藏', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '灵感' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: '打开菜单' }).click();
  await expect(page.getByRole('navigation', { name: '收藏导航' })).toBeVisible();
  await page
    .getByRole('button', { name: /看过了/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: '还没有符合条件的收藏' })).toBeVisible();
});

test('链接：手动补全、类型筛选、重复提示与原文链接', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一件收藏' }).click();
  await page.getByLabel('链接或分享文字').fill('推荐 https://example.com/video?utm_source=share');
  await page.getByLabel('标题', { exact: true }).fill('一个视频');
  await page.getByRole('dialog').getByLabel('内容类型').selectOption('video');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.getByRole('link', { name: '打开原文 一个视频' })).toHaveAttribute(
    'href',
    'https://example.com/video',
  );
  await page.getByRole('group', { name: '内容类型' }).getByRole('button', { name: '视频' }).click();
  await expect(page.getByRole('heading', { name: '一个视频' })).toBeVisible();
  await page.getByRole('button', { name: '添加收藏' }).click();
  await page.getByLabel('链接或分享文字').fill('https://example.com/video');
  await page.getByLabel('标题', { exact: true }).fill('重复视频');
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('这个链接已经收藏过了');
});

async function pasteLink(page: Page, text: string) {
  await page.getByLabel('链接或分享文字').evaluate((element, value) => {
    const input = element as HTMLTextAreaElement;
    input.focus();
    input.select();
    const clipboardData = new DataTransfer();
    clipboardData.setData('text', value);
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, text);
}

function linkPreview(url = 'https://example.com/articles/123'): LinkPreview {
  return {
    url,
    title: '自动识别的文章',
    description: '从网页提取的摘要',
    cover: 'https://example.com/cover.png',
    source: '示例站',
    author: '作者小明',
    type: 'article',
    tags: ['学习', '工具'],
  };
}

test('粘贴自动识别标题、标签、作者和封面，保存并刷新后保留', async ({ page }) => {
  let previewRequests = 0;
  await page.route('**/api/preview', async (route) => {
    previewRequests += 1;
    expect(route.request().postDataJSON().text).toContain('分享文字');
    await route.fulfill({ json: linkPreview() });
  });
  await page.route('https://example.com/cover.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一件收藏' }).click();
  await pasteLink(page, '分享文字 https://example.com/short #学习');
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('自动识别的文章');
  await expect(page.getByLabel('作者（可选）')).toHaveValue('作者小明');
  await expect(page.getByRole('button', { name: '移除标签 学习' })).toBeVisible();
  await expect(page.getByRole('button', { name: '移除标签 工具' })).toBeVisible();
  await expect(page.getByAltText('封面预览')).toBeVisible();
  expect(previewRequests).toBe(1);
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '自动识别的文章' })).toBeVisible();
  const saved = await (await page.request.get('/api/items')).json();
  expect(saved[0]).toMatchObject({ ...linkPreview() });
});

test('识别等待期间和再次识别时，保留手动标题和标签修改', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/api/preview', async (route) => {
    requests += 1;
    if (requests === 1) await waiting;
    await route.fulfill({ json: linkPreview() });
  });
  await page.route('https://example.com/cover.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一件收藏' }).click();
  await pasteLink(page, 'https://example.com/articles/123');
  await expect(page.getByRole('button', { name: '正在识别…' })).toBeVisible();
  await page.getByLabel('标题', { exact: true }).fill('我自己写的标题');
  release();
  await expect(page.getByRole('status')).toContainText('已自动提取');
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('我自己写的标题');
  await page.getByRole('button', { name: '移除标签 学习' }).click();
  await page.getByLabel('标签', { exact: true }).fill('手动标签');
  await page.getByLabel('标签', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '识别', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已自动提取');
  await expect(page.getByRole('button', { name: '移除标签 学习' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '移除标签 手动标签' })).toBeVisible();
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('我自己写的标题');
});

test('更换链接取消旧识别，旧响应不覆盖新链接结果', async ({ page }) => {
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/preview', async (route) => {
    const text = route.request().postDataJSON().text as string;
    if (text.includes('/old')) await waiting;
    await route.fulfill({
      json: { ...linkPreview(text), title: text.includes('/old') ? '旧文章' : '新文章' },
    });
  });
  await page.route('https://example.com/cover.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一件收藏' }).click();
  await pasteLink(page, 'https://example.com/old');
  await expect(page.getByRole('button', { name: '正在识别…' })).toBeVisible();
  await pasteLink(page, 'https://example.com/new');
  await expect(page.getByLabel('标题', { exact: true })).toHaveValue('新文章');
  release();
  await page.getByRole('button', { name: '收藏', exact: true }).click();
  const saved = await (await page.request.get('/api/items')).json();
  expect(saved[0].url).toBe('https://example.com/new');
  expect(saved[0].title).toBe('新文章');
});

test('新链接缺少封面和作者时清除旧链接的自动字段，显示补全提示', async ({ page }) => {
  await page.route('**/api/preview', (route) => {
    const text = route.request().postDataJSON().text as string;
    const preview = linkPreview(text);
    if (text.includes('/partial'))
      Object.assign(preview, {
        title: '不完整的文章',
        cover: '',
        author: '',
        description: '',
        tags: [],
        warning: '未读取到封面；可补全后收藏。',
      });
    return route.fulfill({ json: preview });
  });
  await page.route('https://example.com/cover.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '添加第一件收藏' }).click();
  await pasteLink(page, 'https://example.com/full');
  await expect(page.getByAltText('封面预览')).toBeVisible();
  await pasteLink(page, 'https://example.com/partial');
  await expect(page.getByRole('status')).toContainText('未读取到封面');
  await expect(page.getByAltText('封面预览')).toHaveCount(0);
  await expect(page.getByLabel('作者（可选）')).toHaveValue('');
  await expect(page.getByRole('button', { name: '移除标签 学习' })).toHaveCount(0);
});
