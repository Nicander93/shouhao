import { test, expect, type Page, type Locator } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

test.beforeEach(async ({ request }) => {
  const items = await (await request.get('/api/items')).json();
  for (const item of items) await request.delete(`/api/items/${item.id}`);
});

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) {
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
}

async function expectTouchTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 667, height: 375 },
]) {
  test(`手机 ${viewport.width}×${viewport.height}：收藏、搜索、标签、详情和编辑`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/preview', (route) =>
      route.fulfill({
        json: {
          url: 'https://example.com/mobile',
          title: '手机上收藏的文章',
          description: '适合在手机上阅读和整理的内容。',
          type: 'article',
          source: '示例站',
          author: '作者'.repeat(30),
          cover: '',
          tags: ['这是一个很长的收藏标签用来验证窄屏换行与菜单导航'],
          warning: '未读取到封面；可补全后收藏。',
        },
      }),
    );
    await page.goto('/');
    const add = page.getByRole('button', { name: '收藏', exact: true });
    await expectTouchTarget(add);
    await add.tap();
    const editor = page.getByRole('dialog', { name: '添加收藏' });
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await expect(page.getByLabel('链接或分享文字')).toHaveCSS('font-size', '16px');
    await page.getByLabel('链接或分享文字').fill('https://example.com/mobile');
    await page.getByRole('button', { name: '识别', exact: true }).tap();
    await expect(page.getByLabel('标题', { exact: true })).toHaveValue('手机上收藏的文章');
    await expectNoOverflow(page);
    await editor.screenshot({ path: `test-results/mobile-${viewport.width}-editor.png` });
    await editor.getByRole('button', { name: '收藏', exact: true }).tap();
    await expect(page.getByRole('heading', { name: '手机上收藏的文章' })).toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    await page.reload();
    await page.getByLabel('搜索收藏').fill('没有这篇文章');
    await expect(page.getByRole('heading', { name: '还没有符合条件的收藏' })).toBeVisible();
    await page.getByRole('button', { name: '清空搜索' }).tap();
    const menu = page.getByRole('button', { name: '打开菜单' });
    await expectTouchTarget(menu);
    await menu.tap();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.getByRole('button', { name: /#.*这是一个很长的收藏标签/ }).tap();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expectNoOverflow(page);
    await page.getByRole('button', { name: '查看 手机上收藏的文章' }).tap();
    const detail = page.getByRole('dialog', { name: '收藏详情' });
    await expectNoOverflow(page);
    await detail.getByRole('button', { name: '星标', exact: true }).tap();
    await expect(detail.getByRole('button', { name: '取消星标' })).toBeVisible();
    await detail.getByRole('button', { name: '标为看过', exact: true }).tap();
    await expect(detail.getByRole('button', { name: '标为待看', exact: true })).toBeVisible();
    await detail.getByRole('button', { name: '编辑', exact: true }).tap();
    await page.getByLabel('标题', { exact: true }).fill('手机上修改的文章');
    await page.getByRole('button', { name: '保存修改' }).tap();
    await expect(page.getByRole('heading', { name: '手机上修改的文章' })).toBeVisible();
    await page.getByRole('group', { name: '内容类型' }).getByRole('button', { name: '速记' }).tap();
    await expect(page.getByRole('heading', { name: '还没有符合条件的收藏' })).toBeVisible();
    await page.getByRole('group', { name: '内容类型' }).getByRole('button', { name: '全部' }).tap();
    await expect(page.getByRole('heading', { name: '手机上修改的文章' })).toBeVisible();
    await expectNoOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/mobile-${viewport.width}-collection.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: '查看 手机上修改的文章' }).tap();
    await page.getByRole('button', { name: '删除收藏', exact: true }).tap();
    await expectNoOverflow(page);
    await page.getByRole('button', { name: '确定删除', exact: true }).tap();
    await expect(page.getByRole('heading', { name: '第一件收藏，从喜欢开始' })).toBeVisible();
  });
}

test('手机菜单：关闭、焦点、滚动恢复与桌面切换', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: '打开菜单' });
  await menu.tap();
  await expect(page.getByRole('button', { name: '收起菜单' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: '导出收藏' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '收起菜单' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await menu.tap();
  await page.getByRole('button', { name: '收起菜单' }).tap();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.tap();
  await page
    .getByRole('button', { name: '关闭菜单', exact: true })
    .tap({ position: { x: 380, y: 400 } });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.tap();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.main')).not.toHaveAttribute('inert');
  await expect(page.getByRole('navigation', { name: '收藏导航' })).toBeVisible();
  await expectNoOverflow(page);
});

test('手机登录：输入框字号和窄屏布局', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { authenticated: false, requiresPassword: true, aiEnabled: false } }),
  );
  await page.goto('/');
  await expect(page.getByLabel('访问密码')).toHaveCSS('font-size', '16px');
  await expectTouchTarget(page.getByRole('button', { name: '打开收好' }));
  await expectNoOverflow(page);
});

test('手机可用高度缩小时：速记表单能滚动到保存按钮', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto('/');
  await page.getByRole('button', { name: '记个想法' }).tap();
  await page.getByLabel('标题', { exact: true }).fill('短视口速记');
  await page.getByLabel('速记内容').fill('表单的底部按钮需要通过滚动到达。');
  await page.getByLabel('标签', { exact: true }).fill('手机');
  await expectNoOverflow(page);
  const save = page.getByRole('dialog').getByRole('button', { name: '收藏', exact: true });
  await save.scrollIntoViewIfNeeded();
  const box = await save.boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(360);
  await save.tap();
  await expect(page.getByRole('heading', { name: '短视口速记' })).toBeVisible();
});

test('平板：双列收藏、标签菜单与详情', async ({ page, request }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const tag = '这是一个很长的收藏标签用来验证窄屏换行与菜单导航';
  for (const title of ['第一件收藏', '第二件收藏']) {
    const response = await request.post('/api/items', {
      data: { title, type: 'note', content: '平板阅读内容', tags: [tag] },
    });
    expect(response.ok()).toBe(true);
  }
  await page.goto('/');
  await expect(page.locator('.item-card')).toHaveCount(2);
  const cards = await page.locator('.item-card').all();
  const first = await cards[0].boundingBox();
  const second = await cards[1].boundingBox();
  expect(first?.y).toBe(second?.y);
  await page.getByRole('button', { name: new RegExp(`#.*${tag}`) }).tap();
  await expectNoOverflow(page);
  await page.getByRole('button', { name: '查看 第一件收藏' }).tap();
  await expectNoOverflow(page);
  await page.getByRole('button', { name: '关闭', exact: true }).tap();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
