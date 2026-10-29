# 官网访问与下载入口统计

官网使用 GA4；桌面应用不包含此统计代码。

## 启用

1. 在 Google Analytics 创建或选择 GA4 媒体资源，时区选择中国标准时间。
2. 创建「网站」数据流，网址填写 `https://insight4core.github.io`，名称填写 `Pyrus website`。本站页面路径为 `/markdown_reader/`。
3. **关闭该数据流的增强型衡量**，避免额外自动事件、完整 URL 或重复统计；本站只显式发送下面两个事件。
4. 将数据流中的 `G-` 开头的衡量 ID 填入 `docs/assets/analytics-config.js` 的 `measurementId`。它是公开配置，不是 API 密钥；不要填写 Measurement Protocol API secret。
5. 推送到 GitHub，等待 Pages 部署。ID 为空时，不加载 Google 标签，也不显示统计选择界面。

只有正式域名 `insight4core.github.io` 下的 `/markdown_reader/` 页面启用统计；本地预览不发送数据。所有语言页面通过共享 `site.js` 自动接入。

## 收集范围

访客选择「允许统计」后才加载 Google 标签；拒绝时不加载、不发送统计。选择保存在本浏览器 localStorage 中 180 天，可在页脚「统计设置」更改。Google Analytics 在允许后使用 Cookie，并处理浏览器、设备、地区等标准信息。此功能不读取笔记或本地文件，也不是完全匿名统计。

显式页面地址去掉查询参数和 hash；来源只保留域名。禁用 Google Signals 和广告个性化。

| 事件 | 含义 | 属性 |
| --- | --- | --- |
| `page_view` | 允许统计后的页面访问 | `page_location`、`page_title`、`page_language`、来源域名 |
| `download_click` | 点击本仓库 GitHub Release 入口或安装包直链 | 页面属性、`button_location`、`target_platform`、`download_kind`、`artifact_format` |

`button_location` 为 `hero`、`closing`、`article_cta`、`article_inline`，或 Windows 教程新增的 `guide_start`（前部下载区）、`reader_section`（阅读方法中的下载链接）。
`download_kind` 区分 `installer`（安装包直链）和 `release_page`（GitHub Release 页面）；`artifact_format` 为 `exe` 等扩展名，Release 页面为 `none`。旧数据没有这两个新属性，不能事后补回。
`target_platform` 为 Windows 指南的 `windows`、Mac 指南的 `macos`，或其他页面的 `all`。**这是入口所指的平台，不是检测用户实际使用的操作系统或下载的安装包。**

事件使用浏览器后台发送，不拦截跳转。广告拦截、断网或立即关闭页面仍可能丢失数据，统计不作为下载完成证明。

## 如何查看

1. 线上页面允许统计后，在 GA4「实时」查看 `page_view`；点击下载入口查看 `download_click`。普通报表处理需要时间。
2. 在管理中的「自定义定义」创建事件范围维度：`button_location`、`target_platform`、`page_language`，名称可分别用「按钮位置」「目标平台」「页面语言」。
   新增事件范围维度 `download_kind`、`artifact_format` 后，可以区分安装包按钮和 Release 页面入口；尚未注册时，可先在实时／调试视图中核对参数。
3. 在「探索」中用页面路径配合事件名称，查看每个页面的访问和下载入口点击。可把 `download_click` 标记为关键事件以查看会话关键事件率。
4. 「点击事件数 ÷ 页面浏览量」是每次浏览产生的点击比例，不等于独立访客转化率；同一人重复点击会重复计数。观察真正的转化应使用包含 `download_click` 的会话或用户占比。

数据只覆盖允许统计且成功加载标签的访问者。GitHub 安装包下载次数另外查看，不能直接拼接成精确的个人安装漏斗。

## 怎么查看安装包的实际下载计数

在仓库根目录运行（Node.js 18.17+，不需要 GitHub Token）：

```bash
npm run downloads
npm run downloads -- --latest
npm run downloads -- --snapshot
```

- 默认汇总所有公开 Release（含预发布），分别列出 Windows、macOS、Linux 的安装包计数；`--latest` 只看最新正式版，并列出每个文件。
- `--snapshot` 把本次基线保存在被 Git 忽略的 `.local-stats/downloads/`，以后再运行同样命令，可看到与上次同范围快照相比的累计净变化。GitHub 当前计数本身不提供按日历史，不能追溯保存基线之前的下载日期。
- 统计 `.exe`、`.msi`、`.dmg`、`.deb`、`.rpm`、`.AppImage`；不把 `.sig`、`latest.json` 或源码包算作安装包。macOS `.app.tar.gz` 更新载荷单独列出，避免混作新安装用户。
- 删除／替换附件会影响累计值；`--latest` 对比跨版本时也会换统计对象，因此观察增长优先用全部 Release 的快照。
- 也可在浏览器打开 [公开 Releases API](https://api.github.com/repos/Insight4Core/markdown_reader/releases?per_page=100)，查看每个 `assets` 条目里的 `name` 和 `download_count`；超过 100 个版本时需要继续翻页。

**GitHub 的 `download_count` 是文件下载计数，不是独立下载人数，也不保证每次完整传输或安装成功。** 重复下载、自己的测试、脚本、自动更新都可能产生计数。GA4 的点击和 GitHub 的计数分别观察，不能逐个人关联或精确归因到 Google 搜索。

Windows 教程的 `.exe` 链接默认指向 HTML 中明确标注的版本；页面会尝试通过 GitHub 的公开 API 更新成最新正式版的 x64 安装包。这个请求不带 Cookie，也不发送页面 referrer，但 GitHub 仍会收到普通网络请求信息。API 被拦截、超时或找不到安装包时，保留已标明版本的可用链接，并保留「所有下载」入口。查看文档不会触发安装包下载，测试也不应真正点击下载，以免污染计数。

## 验证重点

- 未配置 ID、本地预览、未选择、拒绝时均不加载 Google 标签。
- 同意后每次页面加载仅显式发送一次 `page_view`。
- 中文、英文以及教程内链接均能识别；GitHub 源码和 Issues 链接不算下载。
- Windows 安装包直链与 Release 页面入口分开归类，`.sig`、示例 `.md` 不算安装包点击；下载不会等待统计完成。
- 安装包 API 不可用或 JavaScript 被禁用时，已标明版本的静态下载链接仍可使用。
- 拒绝、更改选择、存储被禁用时，下载链接仍正常跳转。

参考：[GA4 事件](https://developers.google.com/analytics/devguides/collection/ga4/events)、[基本同意模式](https://developers.google.com/tag-platform/security/concepts/consent-mode)、[GitHub Release assets API](https://docs.github.com/en/rest/releases/assets)。
