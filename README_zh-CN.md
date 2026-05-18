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

## ✨ 核心亮点 (Unfair Advantages)

Pyrus 并非套壳浏览器的“又一个 Markdown 阅读器”，而是从底层构建的性能怪兽与美学引擎：

- ⚡️ **Rust 毫秒级极速全量检索**：底层搭载 `ignore` 与 `rayon` 多核并发引擎。不管你的知识库有几千还是上万篇文档，哪怕 10 毫秒内，也能瞬间撕裂并检索出带有上下文快照的匹配结果。
- 🔗 **原生系统级文件接管 (OS Integration)**：已深度植入操作系统。支持右键 `打开方式 -> Pyrus`。双击电脑任意 `.md` 文件，瞬间拉起软件并在屏幕中央绝美排版。
- 💅 **出版级美学排版 (Typography Engine)**：内置极具质感的 `Glassmorphism` (毛玻璃) 交互系统，并开箱即用内置了**「霞鹜文楷 (LXGW WenKai)」**与**「Fira Code」**神仙字体。即使不安装任何字体，也能获得极致阅读享受。
- 📉 **反 Electron 的极限内存**：完全由原生 Rust 🦀 与 Tauri v2 底层驱动。包体积不到 10MB，常驻内存极低，再也不用忍受开启文档时电脑风扇的轰鸣。
- 🗂️ **双核无缝导航**：独创选项卡交互逻辑，单击鼠标即可在**“全库文件目录”**与**“当前文章大纲 (TOC)”**之间来回丝滑切换。
- 🔄 **毫秒级热更感知**：完美配合 VS Code / Obsidian / Typora。当你用其他软件保存文档，Pyrus 借助系统底层监听实现 100 毫秒级无感热刷新，打造终极“第二屏双屏利器”。

## 📥 下载安装

请直接前往项目的 [Releases (发行版)](https://github.com/Insight4Core/markdown_reader/releases) 页面获取适合你的最新全平台安装包：
- **苹果 macOS 用户**: 下载 `.dmg` 文件
- **微软 Windows 用户**: 下载 `.exe` 文件
- **Linux 发行版系统**: 下载 `.deb` 或是 `.AppImage`

## 💖 支持与打赏 (Sponsor)

Pyrus 是一款用极客精神打造的独立开源产品。如果你觉得这个项目为你带来了优雅的阅读体验，或者提升了你的工作效率，欢迎请我喝杯咖啡！你的支持是我持续迭代这款“最美阅读器”的绝对动力。

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>☕ Buy Me A Coffee</strong></td>
      <td align="center"><strong>🟢 微信支付 (WeChat Pay)</strong></td>
      <td align="center"><strong>🔵 支付宝 (AliPay)</strong></td>
    </tr>
    <tr>
      <td align="center">
        <!-- 替换为你自己的 Buy Me A Coffee 链接 -->
        <a href="https://www.buymeacoffee.com/YOUR_USERNAME" target="_blank">
          <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
        </a>
      </td>
      <td align="center">
        <!-- 替换为你自己的微信收款码 URL -->
        <img src="https://via.placeholder.com/200x200.png?text=WeChat+Pay+QR" width="200" alt="WeChat Pay">
      </td>
      <td align="center">
        <!-- 替换为你自己的支付宝收款码 URL -->
        <img src="https://via.placeholder.com/200x200.png?text=AliPay+QR" width="200" alt="AliPay">
      </td>
    </tr>
  </table>
</div>

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

## 📝 反馈与代码贡献

如果你在软件使用中邂逅了 Bug 或是脑海里有更多牛皮的脑洞功能规划，欢迎随时在 Github 开启一个 Issue 或向我递交 PR！

---

> Crafted with ❤️ by [Insight4Core](https://github.com/Insight4Core)
