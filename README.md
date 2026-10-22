# Harlen's World

个人主页与中文博客：<https://yxsci66.github.io/>。Astro + GitHub Pages 提供前台，Pages CMS 管理私有稿件，GitHub Actions 构建发布，giscus 使用公开 Discussions 保存评论。无需租服务器。

## 写作与发布

从网站的 `/admin/` 进入 [Pages CMS](https://app.pagescms.org/)，使用自己的 GitHub 账号打开私有仓库 `yxsci66/harlen-blog-content`。首次使用按 [后台连接说明](docs/editorial-setup.md) 安装应用并设置专用发布凭据。

手机、平板和电脑使用同一后台。正文支持可视化编辑和 Markdown 源码模式，文章可以设置日期、标签、分类和可见性。

1. 在写作集合创建或修改文章，上传图片，**手动点击保存**。
2. 保存后等待发布管理记录同步。保存仅更新私有稿件，线上版本保持不变。
3. 在发布管理中打开对应文章，执行发布或更新操作。工作流核验保存版本，冻结正文及媒体，只更新选中的文章。
4. GitHub Pages 部署成功后，管理记录才显示新的线上状态。失败保留原线上版本；再次操作会先核对未完成的部署。

未保存的输入不保证恢复。新建文章默认仅自己可见；文章 ID 创建后保持不变。长文正文和访问口令不作为后台操作参数发送。

| 可见性 | 阅读方式 | 发现与评论 |
|---|---|---|
| 公开 | 任何人阅读 | 首页、标签、分类、搜索、RSS、sitemap；可开启评论 |
| 仅链接 | 知道链接的人阅读，内容仍是公开文件 | 不进入发现入口，noindex，不启用评论 |
| 密码 | UUID 链接与独立口令，浏览器内解密正文、元数据和媒体 | 通用锁定页，不进入发现入口，不启用评论 |
| 仅自己 | 私有后台内编辑与阅读 | 不生成公开页面或附件 |

密码首次发布时随机生成，在私有访问口令集合中查看和复制。换口令只重发当前线上内容，不会夹带未发布草稿。加密文章支持 JPEG、PNG、WebP、GIF，以及 PDF、TXT、ZIP 下载附件；单篇原始媒体合计上限 10 MiB，不支持外链图片、执行脚本或嵌入页面。

恢复历史版本按单篇正文和媒体进行，保留当前可见性与当前口令。修改稿件为仅自己后，仍须执行发布或撤回操作，才能改变线上状态。以前公开的 Git 历史、评论、缓存和读者已下载的副本无法收回；Pages CMS 和 GitHub 是受信任的内容处理服务。

## 仓库与发布边界

- 本公开仓库 `main` 存网站代码和五篇已公开的开发样例。不要在这里写私有稿件、口令或令牌。
- 私有 `harlen-blog-content` 保存原稿、媒体、发布快照、线上记录与口令。仅本人具有人工访问权限。
- 私有 Actions 使用已验证的 `PUBLIC_CODE_SHA` 构建当前已发布快照，审查输出后，将静态成品推到本仓库 `site-release`。
- 公开工作流只部署指定完整 SHA 的已审查成品，永远不读取私有仓库。`main` 推送运行验证，不直接重发开发样例。

代码升级先通过检查，再将私有仓库 Actions variable `PUBLIC_CODE_SHA` 更新为对应公开提交，从后台重建已发布站点。不要通过重跑旧整站发布来回滚文章：旧成品可能包含已经撤回的内容。

## 本地开发

需要 Node.js 22.22.0 或更新的兼容版本，以及 pnpm 10.33.2。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

普通开发使用公开的五篇样例。全文搜索需要完整构建：

```powershell
pnpm build
pnpm preview
```

真实发布输入由私有快照生成，通过绝对路径 `HARLEN_CONTENT_ROOT` 指定。生产设置 `HARLEN_PRODUCTION=1`；缺失完整输入时构建失败，不会回退到开发样例。生产构建只复制站点通用静态资源，以及快照实际引用的公开媒体和密文。

资料在 `src/config/site.ts`，项目列表在 `src/data/projects.ts`，评论配置在 `src/config/comments.ts`。发现入口统一使用 `getPosts()`；直接可读路由使用 `getRoutablePosts()`。旧链接由 `legacyPaths` 保留。请运行完整 `pnpm build`，不要部署 `astro build` 中间产物。

## 验证

```powershell
pnpm test
pnpm check
pnpm build
pnpm test:e2e
pnpm test:drafts
pnpm test:editorial
```

`test:editorial` 生成混合可见性与零公开文章两种生产输入，实际构建并验证手机解锁、重新锁定、附件回收、索引隔离和空搜索；结束后恢复普通开发构建。`test:drafts` 通过独立副本验证旧草稿隔离。浏览器测试默认使用本机 4322 端口，不复用其他预览进程。

Windows 自动复用标准路径安装的 Chrome。没有浏览器时，将下载和临时目录留在项目缓存：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/ms-playwright'
$browserTempDirectory = Join-Path (Get-Location) '.cache/tmp'
New-Item -ItemType Directory -Path $browserTempDirectory -Force | Out-Null
$env:TEMP = $browserTempDirectory
$env:TMP = $browserTempDirectory
$env:TMPDIR = $browserTempDirectory
pnpm exec playwright install chromium
```

Linux CI 使用 `pnpm exec playwright install --with-deps chromium`。工作流 Actions 固定到提交 SHA；发布任务单独获得 Pages 部署权限。更多接口与安全边界见 [实现契约](docs/editorial-contract.md)。
