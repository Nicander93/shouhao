import { test, expect } from '@playwright/test';
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
