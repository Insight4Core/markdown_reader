<div align="center">
  <img src="./src-tauri/icons/128x128.png" alt="Pyrus 图标" width="96" />
  <h1>Pyrus</h1>
  <p><strong>一个让被遗忘的本地 Markdown 笔记重新回到你面前的阅读空间。</strong></p>
  <p><a href="./README.md">English</a> · <strong>简体中文</strong></p>
</div>

## 早期体验版

Pyrus 在成长阶段保持免费。它服务于已经用 Markdown 记录内容的人：提供一个更专注的地方阅读、重新发现和找回知识，而不要求账户、云同步，也不把编辑器塞到你的面前。

## 重新发现你已经知道的内容

写下一篇笔记并不难，难的是几个月后还记得它曾经存在。

Pyrus 会在知识库首页带回最多三篇值得阅读的内容：一篇还没有读过的笔记、一篇曾经固定的笔记，或一篇很久没有打开的笔记。每条推荐都会说明出现原因，你也可以选择今天跳过、30 天后再看，或者不再推荐。

推荐完全根据设备上的本地阅读记录计算。Pyrus 不会把知识库上传到外部服务，也不依赖云端分析文档内容。

## 产品预览

| 重新发现旧笔记 | 使用 `⌘K` 找回知识 |
| --- | --- |
| ![Pyrus 重新发现推荐](./docs/screenshots/rediscover.png) | ![Pyrus 全局搜索](./docs/screenshots/global-search.png) |

| 继续阅读 | 偏好设置 |
| --- | --- |
| ![Pyrus 阅读页](./docs/screenshots/reading.png) | ![Pyrus 偏好设置](./docs/screenshots/preferences.png) |

## 它解决了什么

- **重新发现旧笔记**：带回尚未阅读、曾经固定或很久没有打开的内容，不再让它们沉入文件夹深处。
- **本地知识空间**：打开已有文件夹，或新建一个带 `Welcome.md` 的知识库。
- **从上次停下的地方继续**：Pyrus 为每篇文章保存阅读位置，并在知识库首页优先展示。
- **固定重要内容**：将关键笔记固定，一键回到它们。
- **快速找回知识**：按下 `⌘K`（Windows/Linux 使用 `Ctrl+K`）搜索文件名和正文，并直接跳到匹配段落。
- **带着上下文阅读长文**：大纲会随滚动自动标记当前章节，顶部细进度线提示阅读进度。
- **默认私密**：笔记、固定内容、最近阅读、阅读进度和重新发现偏好都只保存在你的设备上。

## 开始使用

1. 启动 Pyrus。
2. 选择「新建知识库」创建文件夹和示例笔记，或选择「打开知识库」使用已有的 Markdown 文件夹。
3. 回到知识库首页重新发现笔记，用文件浏览器和大纲定位内容，或通过 `⌘K` / `Ctrl+K` 搜索整个知识库。

## 下载

前往 [GitHub Releases](https://github.com/Insight4Core/markdown_reader/releases/latest) 下载最新的 macOS、Windows 或 Linux 版本。

## 反馈

Pyrus 由早期读者共同塑造。请在设置页使用「发送反馈」，或前往 [GitHub Issues](https://github.com/Insight4Core/markdown_reader/issues) 提交建议与问题。

## 本地开发

需要 Node.js、Rust 以及 Tauri 对应平台的构建环境。

```bash
git clone https://github.com/Insight4Core/markdown_reader.git
cd markdown_reader
npm install
npm run tauri dev
```

## 许可证

MIT
