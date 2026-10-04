# 架构说明

项目保持一个应用、一个服务、一个数据库，按功能组织代码。

```text
src/
  App.tsx                 收藏库与筛选
  components/             卡片、编辑器、详情、对话框、访问密码
  hooks/useCollection.ts  收藏加载与修改
  lib/                    API 客户端与内容工具
shared/types.ts           前后端共享类型
server/
  index.ts                环境变量、服务启动与退出
  app.ts                  API、会话、文件上传、静态页面
  database.ts             SQLite 数据访问
  validation.ts           输入校验
  services/
    metadata.ts           分享文字提取与网页元数据解析
    platform-rules.ts     常用平台域名、内容路径与正文选择规则
    platform-metadata.ts  B站、知乎、公众号数据解析与访问限制识别
    extended-platform-metadata.ts  其他平台初始数据与正文字段解析
    page-state.ts         安全提取页面 JSON 与赋值数据
    safe-fetch.ts         公开网页读取边界
    ai.ts                 可选 AI 整理
```

Node 24 直接执行仅含可擦除类型的 TypeScript；构建时 `tsc --noEmit` 同时检查前后端，Vite 构建浏览器代码。不引入额外后端编译步骤。SQLite WAL 模式与唯一 URL 索引提供基础持久化和重复保护。

## API

| 接口                  | 用途                     |
| --------------------- | ------------------------ |
| GET /api/config       | AI 可用性与当前访问状态  |
| POST /api/session     | 访问密码登录             |
| DELETE /api/session   | 退出                     |
| GET /api/items        | 读取收藏                 |
| POST /api/items       | 新增收藏                 |
| PUT /api/items/:id    | 修改收藏                 |
| DELETE /api/items/:id | 删除收藏                 |
| POST /api/preview     | 提取分享链接和网页元数据 |
| POST /api/uploads     | 图片上传                 |
| POST /api/ai/organize | 生成整理建议             |
| GET /api/export       | JSON 导出记录            |
| GET /api/health       | 存活检查                 |

## 访问与读取边界

远程绑定地址必须设置访问密码。会话使用随机令牌、HttpOnly 和 SameSite=Strict Cookie；登录有限次重试；写请求检查 Origin 与 Sec-Fetch-Site。服务端图片与收藏接口都要求有效会话。

链接读取仅允许 HTTP(S) 的 80/443 标准端口。查询 DNS 后拒绝非公开地址，并将验证后的地址固定给请求，跳转时重新验证。限制跳转次数、总超时、响应大小和 HTML 类型。封面地址只允许 HTTP(S)，上传拒绝 SVG，检查文件签名，使用随机文件名。收藏内容以纯文本渲染，不执行网页 HTML。

识别依次读取 [Open Graph](https://ogp.me/) / Twitter 元数据、[Schema.org](https://schema.org/Article) JSON-LD、正文标题/作者/图片；无效封面会跳过并继续尝试后续候选，正文图片排除已标明尺寸的小图和常见头像/图标。JSON-LD 只做 JSON 解析，不执行页面脚本。标签读取关键词、文章标签和分享话题，网页失败时保留可提取的分享标题与标签。粘贴触发识别，用户手动修改的字段受到保护，取消或换链接后忽略过期结果；保存使用已识别的跳转地址。

平台专用数据优先于通用元数据：B站使用初始数据中的视频和标签；知乎根据 URL 的文章/问题/回答 ID 选中对应实体，专栏 403 时在同一 12 秒期限内尝试知乎公开阅读页，仍保留原文章地址；公众号使用正文元素和分享变量。页面脚本只提取可解析的 JSON 和字符串，不执行。验证码或登录跳转会降级为原链接和分享信息，不保存验证页地址。网页读取支持 gzip、deflate、Brotli，传输字节和解压后的字节均限制在 2 MB。

平台规则登记 45 个品牌，按域名边界匹配，重叠时优先较具体的域名；类型依据内容路径而非整个站点判断。扩展解析读取小红书、抖音、快手、YouTube、小宇宙、简书和微博的页面数据，并按 URL 中的 ID 排除推荐条目。初始数据缺失时继续尝试正文与通用元数据。赋值解析仅截取完整 JSON，小红书裸 `undefined` 转为 `null`，字符串中的内容保持不变；不使用 `eval` 或执行客户端脚本。平台覆盖与真实验证范围见[平台识别支持](platform-support.md)。

AI 凭据通过环境变量提供，不出现在浏览器代码、收藏导出或返回的配置中。AI 返回经过结构校验，由用户确认后采用。图片本身不送入模型。

## 部署

生产模式下 Express 同时提供构建后的页面、API 与上传图片。Docker 以 node 用户运行，用命名卷保存 SQLite 和图片。公网部署通过 HTTPS 反向代理连接；首次创建的数据目录自动建表。当前是 v0.1 的单表结构，后续改变表结构时需要增加显式数据库迁移。
