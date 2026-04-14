<div align="center">
  <!-- TODO: Replace with the actual URL to your logo when you upload it -->
  <!-- <img src="./src-tauri/icons/128x128.png" alt="Markdown Reader Logo" width="128"> -->
  
  <h1>Pyrus (Local Knowledge Base Edition)</h1>
  <p><strong>A lightning-fast, beautifully designed cross-platform desktop Markdown continuous reader and knowledge management tool.</strong></p>

  <p>
    [<strong>🇺🇸 English</strong>] | [<a href="./README_zh-CN.md">🇨🇳 简体中文</a>]
  </p>

  <p>
    <a href="https://github.com/Insight4Core/markdown_reader/releases/latest"><img src="https://img.shields.io/github/v/release/Insight4Core/markdown_reader?style=flat-square&color=007acc" alt="Release"></a>
    <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgray?style=flat-square" alt="Platform">
    <img src="https://img.shields.io/badge/Stack-Tauri_v2%20%7C%20Svelte_5-ff3e00?style=flat-square" alt="Tech Stack">
  </p>
</div>

<br />

## ✨ Features

- ⚡️ **Blazing Fast**: Powered by Rust 🦀 and Tauri v2 for native desktop performance.
- 🗂️ **Knowledge Base Mode**: Select any local directory to deeply scan and manage your `.md` files in a seamless tree.
- 📑 **Dual-Tab Navigation**: Smoothly switch between your local **File Library** and the **Table of Contents (TOC)** of the current document with a single click.
- 🎨 **Rich Formatting Support**: Full parsing support for core elements, Mermaid diagrams, Katex Math, Task Lists, GitHub alerts, Footnotes, Emojis, and more.
- 🔄 **Live Watch**: Automatically detects file changes in your markdown via OS-level file watching, updating the preview instantly without saving.
- ☁️ **Built-in Auto Update**: Cross-platform auto-updater embedded. You will be notified the second a new release drops.

## 📥 Download & Install

Head over to the [Releases](https://github.com/Insight4Core/markdown_reader/releases) page to download the latest setup for your operating system:
- **macOS**: Download `.dmg`
- **Windows**: Download `.exe`
- **Linux**: Download `.deb` or `.AppImage`

## 🛠️ Development

This project leverages a highly optimized frontend paired with a minimal Rust core. 

### Prerequisites

- Node.js (v24 LTS recommended)
- Rust (stable toolchain)
- macOS / Windows / Linux build essentials for Tauri

### Start Local Environment

```bash
# Clone the repository
git clone https://github.com/Insight4Core/markdown_reader.git
cd markdown_reader

# Install frontend dependencies
npm install

# Start the Tauri development window
npm run tauri dev
```

### Build & Release

We use a fully automated release pipeline. If you want to build locally:
```bash
npm run tauri build
```

## 📝 Roadmap & Contributing

If you found a bug or have a feature request, please feel free to open an issue or submit a PR! Contributions are always welcome.

---

> Crafted by [Insight4Core](https://github.com/Insight4Core)
