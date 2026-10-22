# Harlen's World

个人主页与中文博客，站点为 https://yxsci66.github.io，作者 Harlen，简介“重度文青，搬砖码农”。

采用 Astro 静态生成、Markdown 文章集合、Pagefind 全文搜索、GitHub Actions 发布。视觉为米白底、深色文字、暖色点缀，兼顾技术与生活写作。站点不使用后台、评论、统计或自定义域名。

唯一发布源码仓库是 yxsci66.github.io。旧 master 的四篇 HTML 文章和旧 main 的一条短文迁入新集合，原文、日期、分类、标签和旧链接保留。myblog.dev.repo 作为历史资料保留，不修改。

所有公开文章消费者使用 src/lib/posts.ts 的 getPosts()，确保草稿不出现在页面、搜索、Feed 或站点地图中。文章以文件名作为稳定 slug；legacyPaths 描述旧站入口。

站点资料在 src/config/site.ts，项目列表在 src/data/projects.ts，文章在 src/content/blog。项目资源本地托管，不沿用旧评论凭证或旧邮箱等未确认资料。
