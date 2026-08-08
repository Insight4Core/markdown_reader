<div align="center">
  <img src="./src-tauri/icons/128x128.png" alt="Pyrus logo" width="96" />
  <h1>Pyrus</h1>
  <p><strong>A calm, local-first reading space that brings forgotten Markdown notes back to you.</strong></p>
  <p><strong>English</strong> · <a href="./README_zh-CN.md">简体中文</a></p>
</div>

## Early Access

Pyrus is free while it grows. It is built for people who already keep notes in Markdown and want a more focused place to read, rediscover, and find them—without accounts, cloud sync, or an editor getting in the way.

## Rediscover what you already know

Writing a note is easy. Remembering that it exists months later is harder.

Pyrus brings up to three worthwhile notes back to your knowledge home: something you have not read yet, something you once pinned, or something you have not opened for a while. Each suggestion explains why it appeared, and you can skip it for today, bring it back in 30 days, or hide it.

The recommendation is calculated entirely on your device from local reading activity. Pyrus does not upload or inspect your knowledge base through an external service.

## Preview

| Rediscover forgotten notes | Find anything with `⌘K` |
| --- | --- |
| ![Pyrus Rediscover suggestions](./docs/screenshots/rediscover-en.png) | ![Pyrus global search](./docs/screenshots/global-search-en.png) |

| Continue reading | Preferences |
| --- | --- |
| ![Pyrus reading screen](./docs/screenshots/reading-en.png) | ![Pyrus preferences](./docs/screenshots/preferences-en.png) |

## What makes it useful

- **Rediscover forgotten notes** — Bring back unread, previously pinned, and long-unvisited notes instead of letting them disappear into a folder.
- **Local knowledge spaces** — Open an existing folder or create a new knowledge base with a ready-to-read `Welcome.md`.
- **Pick up where you stopped** — Pyrus saves your reading position for every document and surfaces it on the knowledge home.
- **Pin what matters** — Keep essential notes one click away.
- **Find knowledge instantly** — Press `⌘K` on macOS or `Ctrl+K` elsewhere to search file names and document content, then jump to the matching passage.
- **Read long documents with context** — A live outline follows your position in the document, alongside a subtle reading-progress indicator.
- **Private by default** — Notes, pins, recents, progress, and rediscovery preferences stay on your device.

## Getting started

1. Launch Pyrus.
2. Select **New knowledge base** to create a folder and a starter note, or choose **Open knowledge base** to use an existing Markdown folder.
3. Return to the knowledge home to rediscover notes, use the Explorer and Outline to navigate, or press `⌘K` / `Ctrl+K` to search the whole knowledge base.

## Download

Download the latest macOS, Windows, or Linux build from [GitHub Releases](https://github.com/Insight4Core/markdown_reader/releases/latest).

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
