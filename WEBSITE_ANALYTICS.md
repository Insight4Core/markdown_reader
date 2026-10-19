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
| `download_click` | 点击通往本仓库 GitHub 最新 Release 的入口 | 页面属性、`button_location`、`target_platform` |

`button_location` 为 `hero`、`closing`、`article_cta` 或 `article_inline`。
`target_platform` 为 Windows 指南的 `windows`、Mac 指南的 `macos`，或其他页面的 `all`。**这是入口所指的平台，不是检测用户实际使用的操作系统或下载的安装包。**

事件使用浏览器后台发送，不拦截跳转。广告拦截、断网或立即关闭页面仍可能丢失数据，统计不作为下载完成证明。

## 如何查看

1. 线上页面允许统计后，在 GA4「实时」查看 `page_view`；点击下载入口查看 `download_click`。普通报表处理需要时间。
2. 在管理中的「自定义定义」创建事件范围维度：`button_location`、`target_platform`、`page_language`，名称可分别用「按钮位置」「目标平台」「页面语言」。
3. 在「探索」中用页面路径配合事件名称，查看每个页面的访问和下载入口点击。可把 `download_click` 标记为关键事件以查看会话关键事件率。
4. 「点击事件数 ÷ 页面浏览量」是每次浏览产生的点击比例，不等于独立访客转化率；同一人重复点击会重复计数。观察真正的转化应使用包含 `download_click` 的会话或用户占比。

数据只覆盖允许统计且成功加载标签的访问者。GitHub 安装包下载次数另外查看，不能直接拼接成精确的个人安装漏斗。

## 验证重点

- 未配置 ID、本地预览、未选择、拒绝时均不加载 Google 标签。
- 同意后每次页面加载仅显式发送一次 `page_view`。
- 中文、英文以及教程内链接均能识别；GitHub 源码和 Issues 链接不算下载。
- 拒绝、更改选择、存储被禁用时，下载链接仍正常跳转。

参考：[GA4 事件](https://developers.google.com/analytics/devguides/collection/ga4/events)、[基本同意模式](https://developers.google.com/tag-platform/security/concepts/consent-mode)。
