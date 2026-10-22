# Harlen's World

个人主页与中文博客：<https://yxsci66.github.io/>。使用 Astro、Markdown、Pagefind，通过 GitHub Actions 发布到 GitHub Pages。无后台、评论、统计或自定义域名。

## 本地维护

需要 Node.js 22.22.0 或更新的兼容版本，以及 pnpm 10.33.2。在当前工作树中运行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

生产预览：

```powershell
pnpm build
pnpm preview
```

全文搜索索引由生产构建生成，使用 `build` 后的 `preview` 检查搜索；开发服务器不会生成索引。构建同时生成 RSS、站点地图、robots.txt 和旧链接跳转页，临时别名清单会在发布前删除。请使用完整的 `pnpm build`，不要单独发布 `astro build` 的中间产物。

发布前检查：

```powershell
pnpm test
pnpm check
pnpm build
pnpm test:e2e
pnpm test:drafts
```

浏览器测试在 Windows 自动复用已安装的标准路径 Chrome。没有 Chrome 时，先安装匹配当前 Playwright 版本的 Chromium；浏览器和临时构建均留在项目 `.cache/`：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.cache/ms-playwright'
$browserTempDirectory = Join-Path (Get-Location) '.cache/tmp'
New-Item -ItemType Directory -Path $browserTempDirectory -Force | Out-Null
$env:TEMP = $browserTempDirectory
$env:TMP = $browserTempDirectory
$env:TMPDIR = $browserTempDirectory
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:drafts
```

Linux CI 使用 `pnpm exec playwright install --with-deps chromium`。`test:drafts` 在 `.cache/` 临时副本注入草稿并真实构建，核验页面、分类标签、Feed、站点地图、旧入口和 Pagefind 搜索，完成后清理副本。

本仓库原始 master 工作区有保留的未提交改动。继续在当前工作树维护；不要直接在原工作区 checkout 或 pull 覆盖这些改动。

## 写文章与更新资料

新增 `src/content/blog/my-new-post.md`，文件名决定稳定地址 `/blog/my-new-post/`。示例：

```markdown
---
title: 一篇新文章
description: 用一两句话概括内容。
pubDate: 2026-10-22
updatedDate: 2026-10-23
category: engineering
tags: [随笔, TypeScript]
draft: false
featured: false
legacyPaths: []
---

从这里开始正文。
```

`title`、`description`、`pubDate` 必填；`updatedDate`、`category` 可省略，其余字段有上述默认值。日期保留真实发布日期。`featured: true` 显示在首页精选。图片放 `public/images/`，正文写 `/images/文件名.webp`。

`draft: true` 会从构建页面、搜索、RSS、站点地图和旧链接别名中排除。仓库源码是公开的，草稿也不能包含密码、令牌、私人资料或其他秘密。

资料集中在 `src/config/site.ts`，项目列表在 `src/data/projects.ts`。文章公开入口统一使用 `src/lib/posts.ts` 的 `getPosts()`，新增功能也遵守此约定。

迁移文章时用 `legacyPaths` 记录原根路径，例如 `[/2021/09/23/日记210923/]`；构建生成静态 meta refresh、可点击链接与新地址 canonical，目录入口及 `index.html` 均可访问。重复别名、与现有页面冲突或无效目标会使构建失败。Windows 默认文件系统不区分大小写，`Engineering` 旧分类本地复用小写分类正文并保留小写 canonical；Linux CI 会额外生成实际跳转页并测试。不要改写已有文章文件名；确需修改时同时保留旧入口。

## 自动发布与回滚

PR 自动运行单元测试、类型检查、构建、浏览器测试及草稿隔离检查。main 推送和 main 上手动运行 `Validate and deploy Pages` 时，通过全部检查后上传官方 Pages artifact，再部署到 `github-pages` 环境；其他分支手动运行只验证。相同 ref 的新运行会取消旧运行，避免旧构建覆盖新部署。

首次上线需在仓库 Pages 设置选择 GitHub Actions；不需要 CNAME。工作流的默认权限为 `contents: read`，只有部署任务获得 `pages: write` 和 `id-token: write`。Actions 版本固定为经过官方仓库核对的 commit SHA。

回滚时在 Actions 找到之前已验证成功、属于 main 的运行，核对其完整 commit SHA，然后选择 **Re-run all jobs**，以该 SHA 重新构建并发布。也可用已认证的 GitHub CLI：

```powershell
gh run list --workflow pages.yml --branch main --status success
gh run view <运行ID> --json headSha,conclusion,url
gh run rerun <运行ID>
gh run watch <运行ID>
```

回滚后核对线上首页、文章、搜索、RSS 和旧入口。若 main 正在发布新版本，先协调暂停新提交，避免后续 main 运行再次覆盖回滚结果；随后用新的提交修复源码，使 main 与预期版本一致。
