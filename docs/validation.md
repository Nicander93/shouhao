# 初版验证记录

- Node.js 24.19.0；本地依赖按 package-lock.json 安装。
- `npm test`：13 项通过，覆盖 SQLite 重新打开后的数据保留、修改删除、链接去重、元数据解析、分享链接提取、输入校验、私网读取限制、访问密码与会话、跨站写请求、图片签名、AI 兼容接口格式与输入截断。
- `npm run build`：通过，前后端 TypeScript 检查和 Vite 生产构建成功。
- `npm run format:check`：通过。
- Playwright + Chromium 153：3 项端到端流程通过，覆盖桌面速记闭环、手机图片上传和菜单、链接手动补全/类型筛选/重复提示。
- 1440px 桌面和 390px 手机截图已检查；无页面 JavaScript 异常，手机无横向溢出。截图使用独立的演示数据，不写入实际启动数据目录。

当前环境无法通过标准 Playwright 下载源取得浏览器，验证使用等价 Chromium 153 可执行文件和 `PLAYWRIGHT_EXECUTABLE_PATH`。CI 和普通本机仍使用 Playwright 标准安装方式。

尚未进行真实模型服务调用、各视频/播客平台逐项适配验证，以及 Docker 镜像实际运行测试。AI 测试使用本地兼容接口；实际网页识别受目标平台登录、反爬与动态渲染限制，需要在使用中继续校验。Docker/Compose 配置已提供。
