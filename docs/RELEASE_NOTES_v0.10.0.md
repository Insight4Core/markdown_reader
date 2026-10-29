# 知返 0.10.0 / Pyrus 0.10.0

**发布日期 / Released:** 2026-10-28

## 简体中文

知返 0.10.0 让 AI 写出来的 Markdown 更好读、更好用：一眼看到刚刚新增或改动了什么，同时打开几篇来回对照，读完一键导出或分享。

### 新功能

- **最近变化**：知识库首页列出过去 7 天新增或修改过的笔记，并标出「新」「有更新」「已读」。AI 工具在后台写入的文件会自动出现，无需手动刷新。
- **多标签页**：按住 ⌘（Windows / Linux 为 Ctrl）点击笔记，或用鼠标中键点击，会在新标签页中打开。每个标签页记住自己的阅读位置和前进 / 后退记录，重启后自动恢复，每个知识库各自记住自己的标签页。⌘T 新建，⌘W 关闭，⌘1–9 切换。
- **导出与分享**：阅读页右上角的「导出」菜单可以导出 PDF / 打印（⌘P）、复制为富文本（粘贴到邮件和文档时保留格式）、复制 Markdown 原文。PDF 始终白底排版，长代码块可以跨页，表格和图片的标题不会和内容分开。

### 改进与修复

- 数学公式不再重复显示。
- Mermaid 图表恢复正常绘制，并跟随主题切换；语法有误时显示原始代码和一句说明。
- 中文段落不再提前换行，右侧边缘更整齐。
- 非中文系统默认使用英文界面；在设置中手动选择的语言会一直保留。
- macOS：⌘W 现在关闭当前标签页，关闭窗口改为 ⇧⌘W。

## English

Pyrus 0.10.0 makes Markdown written by AI easier to read and share: see what was just added or changed, keep several notes open and switch between them, and export when you are done.

### What's new

- **Recent changes**: the knowledge home lists notes added or edited in the past 7 days, marked New, Updated or Read. Notes written in the background by AI tools appear on their own.
- **Tabs**: ⌘-click (Ctrl-click on Windows and Linux) or middle-click a note to open it in a new tab. Each tab keeps its own reading position and back / forward history; tabs come back after a restart, and each knowledge base remembers its own. ⌘T new tab, ⌘W close, ⌘1–9 switch.
- **Export**: the Export menu in the reading view offers Export PDF / Print (⌘P), Copy as rich text (keeps formatting in mail and docs) and Copy Markdown. PDFs are laid out on white paper, long code continues across pages, and captions stay with their tables and images.

### Improvements and fixes

- Math formulas no longer appear twice.
- Mermaid diagrams render again and follow the theme; a broken diagram shows its source with a short note.
- Chinese paragraphs no longer break lines early.
- Systems in languages other than Chinese now start in English; a language chosen in Settings is kept.
- macOS: ⌘W closes the current tab; Close Window moved to ⇧⌘W.

Download: [GitHub Releases](https://github.com/Insight4Core/markdown_reader/releases/tag/v0.10.0)
