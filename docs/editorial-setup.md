# 后台首次连接

文章原稿位于私有仓库 `yxsci66/harlen-blog-content`。公开仓库 `yxsci66/yxsci66.github.io` 只负责网站代码和可公开的发布产物。两套应用各自只授权需要的仓库，不选择所有仓库。

## 1. 连接写作后台

打开 <https://app.pagescms.org/>，使用 `yxsci66` 的 GitHub 账号登录，按提示安装 Pages CMS GitHub App，只选择 `harlen-blog-content`。打开该仓库的 `main` 分支。

后台应该出现「写作与草稿」「发布与版本」「访问口令」。不要邀请其他协作者。原稿和口令以 GitHub 私有文件为准；Pages CMS 会读取并缓存这些文件，因此它是受信任的内容处理服务。

在手机上创建一篇测试草稿，点击保存；电脑重新打开确认正文和图片一致。没有点击保存的输入不能保证跨端恢复。无需提交任何测试内容到公开站点。

## 2. 连接公开评论

打开 <https://github.com/apps/giscus>，安装时只选择 `yxsci66.github.io`。该仓库已开启 Discussions，评论分类使用 Announcements。评论正文公开存放在 Discussions；无需也不应授权私有内容仓库。

## 3. 设置发布凭据

在 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建专用令牌：

- 名称：`Harlen blog publisher`。
- Resource owner：`yxsci66`。
- Repository access：只选择 `yxsci66.github.io`。
- Repository permissions：`Contents: Read and write`、`Actions: Read and write`；其余保持默认。
- 设定合理有效期，例如 90 天；到期后替换下面同名 Secret。

将令牌直接保存到私有仓库 Settings → Secrets and variables → Actions，Secret 名称为 `PUBLISH_TOKEN`。也可以在自己的终端运行下面命令，再按提示输入：

```powershell
gh secret set PUBLISH_TOKEN --repo yxsci66/harlen-blog-content
```

不要把令牌发到聊天、写进 Markdown 或提交到 Git。不要用已有的宽权限日常 GitHub 登录令牌代替。

网站代码版本通过私有仓库 Actions variable `PUBLIC_CODE_SHA` 固定为已验证的公开代码提交；这是普通版本号，不是 Secret，由部署流程设置。后续代码升级先完成检查，再更新这个变量并从后台重建已发布站点。

## 使用前检查

确认私有仓库仅本人拥有人工访问权限；后台能保存草稿并在另一设备读到；发布管理记录会随保存更新。先验证公开、仅链接、密码、仅自己四种测试样本，再启用正式发布链。令牌缺失、过期或额度不足时发布应失败，不能把未验证产物替换线上站点。

已公开的历史版本、评论和读者已下载的副本不能通过改权限或换口令收回。
