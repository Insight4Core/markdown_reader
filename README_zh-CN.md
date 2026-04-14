<div align="center">
  <!-- TODO: 在此处替换为你在 Github 上的真实 Logo URL -->
  <!-- <img src="./src-tauri/icons/128x128.png" alt="Markdown Reader Logo" width="128"> -->
  
  <h1>Pyrus (本地知识库版)</h1>
  <p><strong>一个快如闪电、设计精美的跨平台桌面端 Markdown 连载阅读与知识库管理利器。</strong></p>

  <p>
    [<a href="./README.md">🇺🇸 English</a>] | [<strong>🇨🇳 简体中文</strong>]
  </p>

  <p>
    <a href="https://github.com/Insight4Core/markdown_reader/releases/latest"><img src="https://img.shields.io/github/v/release/Insight4Core/markdown_reader?style=flat-square&color=007acc" alt="Release"></a>
    <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgray?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/badge/Stack-Tauri_v2%20%7C%20Svelte_5-ff3e00?style=flat-square" alt="Tech Stack">
  </p>
</div>

<br />

## ✨ 核心亮点

- ⚡️ **极速轻量**：由原生 Rust 🦀 与 Tauri v2 底层驱动，摒弃沉重架构，尽享丝滑原生桌面体验。
- 🗂️ **本地知识库透视**：一键挂载任意本地工作文件夹。强大且深度的全目录体系递归扫描，让凌乱的 `.md` 文件井然有序列在侧边栏。 
- 📑 **双核无缝导航**：独创选项卡交互逻辑，单击鼠标即可在**“全库文件目录”**与**“当前文章大纲 (TOC)”**之间来回丝滑切换。
- 🎨 **前沿的富文本解析**：内置全栈 Markdown 解析链，深度支持代码高亮标注、Katex 数学公式、Mermaid 数据流图谱、复选任务列表、EmoJi 渲染及 GitHub 式脚注高光支持。
- 🔄 **毫秒级热更感知**：借助系统底层 File System 原生监听，在你使用 Obsidian / VSCode 编辑文档的同时，阅读器界面实现 100毫秒级无感热刷新，完全无需手动保存或刷新。
- ☁️ **云端自动分发更新**：内置静默检测模块，无需手动重装，一键更新包直接投递至桌面。

## 📥 下载安装

请直接前往项目的 [Releases (发行版)](https://github.com/Insight4Core/markdown_reader/releases) 页面获取适合你的最新全平台安装包：
- **苹果 macOS 用户**: 下载 `.dmg` 文件
- **微软 Windows 用户**: 下载 `.exe` 文件
- **Linux 发行版系统**: 下载 `.deb` 或是 `.AppImage`

## 🛠️ 本地开发者指南

本项目是一套前后端高度分离的高性能架构框架。

### 运行环境要求

- Node.js (推荐 v24 LTS 版本)
- Rust (稳定版工具链)
- 对应底层操作系统的基础编译包依赖 (Windows 需 C++, Mac 需 Xcode 命令行)

### 唤醒本地开发服

```bash
# 克隆全量代码
git clone https://github.com/Insight4Core/markdown_reader.git
cd markdown_reader

# 下载 Svelte 前端依赖体系
npm install

# 一条指令编译并浮现 Tauri 开发视窗
npm run tauri dev
```

### 全自动构建发版流程

在这个强大的工作流中，作为库的主人，你只需要执行打包触发指令：
```bash
# 自动提升小版本、打下 Git 标签并向 Github 云端抛出构建流水线！
npm run release:patch
```

## 📝 反馈与代码贡献

如果你在软件使用中邂逅了 Bug 或是脑海里有更多牛皮的脑洞功能规划，欢迎随时在 Github 开启一个 Issue 或向我递交 PR！

---

> Crafted by [Insight4Core](https://github.com/Insight4Core)
