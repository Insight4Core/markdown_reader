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

## ✨ Core Features (Unfair Advantages)

Pyrus is not just "another Markdown reader in a browser shell." It's a performance beast and aesthetic engine built from the ground up:

- ⚡️ **Rust-Powered Lightning Full-Text Search**: Driven by the `ignore` and `rayon` crates. Whether your knowledge base has thousands or tens of thousands of documents, Pyrus can instantly tear through and retrieve text-matching snippets with precise line numbers in under 10 milliseconds.
- 🔗 **Deep OS Integration (Open With)**: Fully integrated into your operating system. Right-click any `.md` file on your computer and open it with Pyrus to instantly launch the app and render your document beautifully in the center of your screen.
- 💅 **Publisher-Grade Typography Engine**: Features a premium `Glassmorphism` UI system and comes pre-bundled with god-tier fonts out-of-the-box, including **"LXGW WenKai"** and **"Fira Code"**. Enjoy the ultimate reading experience without installing any extra fonts.
- 📉 **Anti-Electron Memory Footprint**: Completely powered by native Rust 🦀 and Tauri v2. The package size is under 10MB, and the background memory footprint is incredibly low. Say goodbye to your laptop fans spinning up just to read a document.
- 🗂️ **Dual-Tab Seamless Navigation**: A unique tabbed interaction logic allows you to switch between your **"Full Library Directory"** and the **"Table of Contents (TOC)"** of the current document with a single click.
- 🔄 **Millisecond Live Reload**: Perfectly complements VS Code, Obsidian, or Typora. As you save documents in other editors, Pyrus leverages OS-level file system watching to achieve a 100-millisecond invisible hot-refresh, making it the ultimate "second-screen companion."

## 📥 Download & Install

Head over to the [Releases](https://github.com/Insight4Core/markdown_reader/releases) page to download the latest setup for your operating system:
- **macOS**: Download `.dmg`
- **Windows**: Download `.exe`
- **Linux**: Download `.deb` or `.AppImage`

## 💖 Support & Sponsor

Pyrus is an independent, open-source product crafted with a hacker spirit. If you feel this project has brought you an elegant reading experience or improved your workflow, consider buying me a coffee! Your support is the absolute driving force for me to continuously iterate on this "most beautiful reader."

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>☕ Buy Me A Coffee</strong></td>
      <td align="center"><strong>🟢 WeChat Pay</strong></td>
      <td align="center"><strong>🔵 AliPay</strong></td>
    </tr>
    <tr>
      <td align="center">
        <!-- Replace with your Buy Me A Coffee link -->
        <a href="https://www.buymeacoffee.com/YOUR_USERNAME" target="_blank">
          <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50">
        </a>
      </td>
      <td align="center">
        <!-- Replace with your WeChat Pay QR Code URL -->
        <img src="https://via.placeholder.com/200x200.png?text=WeChat+Pay+QR" width="200" alt="WeChat Pay">
      </td>
      <td align="center">
        <!-- Replace with your AliPay QR Code URL -->
        <img src="https://via.placeholder.com/200x200.png?text=AliPay+QR" width="200" alt="AliPay">
      </td>
    </tr>
  </table>
</div>

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

## 📝 Roadmap & Contributing

If you found a bug or have a feature request, please feel free to open an issue or submit a PR! Contributions are always welcome.

---

> Crafted with ❤️ by [Insight4Core](https://github.com/Insight4Core)
