<div align="center">
  <img src="./src-tauri/icons/128x128.png" alt="Pyrus logo" width="96" />
  <h1>Pyrus</h1>
  <p><strong>A calm, local-first reading space for your Markdown knowledge base.</strong></p>
  <p><strong>English</strong> · <a href="./README_zh-CN.md">简体中文</a></p>
</div>

## Early Access

Pyrus is free while it grows. It is built for people who already keep notes in Markdown and want a more focused place to read, revisit, and find them—without accounts, cloud sync, or an editor getting in the way.

![Pyrus welcome screen](./docs/screenshots/welcome.png)

## What makes it useful

- **Local knowledge spaces** — Open an existing folder or create a new knowledge base with a ready-to-read `Welcome.md`.
- **Pick up where you stopped** — Pyrus saves your reading position for every document and surfaces it on the knowledge home.
- **Pin what matters** — Keep essential notes one click away.
- **Find knowledge instantly** — Press `⌘K` on macOS or `Ctrl+K` elsewhere to search file names and document content, then jump to the matching passage.
- **Read long documents with context** — A live outline follows your position in the document, alongside a subtle reading-progress indicator.
- **Private by default** — Notes, pins, recents, and progress stay on your device.

## Getting started

1. Launch Pyrus.
2. Select **New knowledge base** to create a folder and a starter note, or choose **Open knowledge base** to use an existing Markdown folder.
3. Use the Explorer to browse files, the Outline to navigate a document, and `⌘K` / `Ctrl+K` to search the whole knowledge base.

## Download

Pre-release builds will be published on the [Releases](https://github.com/Insight4Core/markdown_reader/releases) page.

## Feedback

Pyrus is shaped by early readers. Use **Send feedback** in Preferences, or open a [GitHub issue](https://github.com/Insight4Core/markdown_reader/issues) to share an idea or report a problem.

## Development

Requirements: Node.js, Rust, and the platform prerequisites for Tauri.

```bash
git clone https://github.com/Insight4Core/markdown_reader.git
cd markdown_reader
npm install
npm run tauri dev
```

## License

MIT
