# Tasks: v0.11 极致阅读工艺（Reading Craft）

- **关联设计**：[design.md](./design.md)
- **关联规范**：[spec.md](./spec.md)
- **状态**：`Completed`

---

## 阶段 A：纯逻辑层与单元测试（TDD / 可独立验证）

- [x] **T1 — 页内查找纯逻辑与 DOM 高亮模块**（`FR-1`, AC-1.1 ~ AC-1.5）
  - 新增 `src/lib/in-page-find.ts`（`findMatchRanges`、`nextMatchIndex`、`sanitizeFindSeed`、`applyInPageHighlights`、`clearInPageHighlights`、`setActiveHighlight`）
  - 新增 `tests/in-page-find.test.mjs`
  - 更新 `src/lib/export-document.ts` 解包 `mark.in-page-find`，确保复制富文本零污染

- [x] **T2 — 阅读排版配置校验与映射模块**（`FR-2`, AC-2.1 ~ AC-2.4）
  - 新增 `src/lib/reading-typography.ts`（预设常量、`normalizeTypography`、`isDefaultTypography`、`typographyCssVars`）
  - 新增 `tests/reading-typography.test.mjs`

- [x] **T3 — 媒体灯箱纯逻辑与 SVG ID 隔离模块**（`FR-3`, AC-3.1 ~ AC-3.4）
  - 新增 `src/lib/media-lightbox.ts`（`clampZoom`、`stepZoom`、`formatZoomPercent`、`shouldOpenImageLightbox`、`scopeSvgIds`）
  - 新增 `tests/media-lightbox.test.mjs`

- [x] **T4 — 最近工作区管理纯逻辑模块**（`FR-5`, AC-5.1 ~ AC-5.5）
  - 新增 `src/lib/recent-workspaces.ts`（`normalizeWorkspacePath`、`workspaceDisplayName`、`recordRecentWorkspace`、`removeRecentWorkspace`、`restoreRecentWorkspaces`）
  - 新增 `tests/recent-workspaces.test.mjs`

---

## 阶段 B：Rust 后端命令与单元测试

- [x] **T5 — 外部打开与文件管理器定位命令**（`FR-4`, AC-4.1 ~ AC-4.3）
  - 在 `src-tauri/src/lib.rs` 实现 `validate_markdown_file_path`、`normalize_editor_arg`、`open_file_externally`、`reveal_file_in_manager` 并注册到 `invoke_handler`
  - 在 `src-tauri/src/lib.rs` 的 `tests` 模块补充单元测试

---

## 阶段 C：双语词条与独立 Svelte 5 子组件

- [x] **T6 — 中英双语词条**（`NFR-1`）
  - 在 `src/lib/i18n.svelte.ts` 补齐 `find.*`、`typography.*`、`lightbox.*`、`external.*`、`workspace.recent_*` 中英文文案

- [x] **T7 — 独立 UI 子组件**（`FR-1`, `FR-3`, `FR-5`, `NFR-2`）
  - 新增 `src/lib/components/FindBar.svelte`
  - 新增 `src/lib/components/MediaLightbox.svelte`
  - 新增 `src/lib/components/WorkspaceSwitcher.svelte`

---

## 阶段 D：页面集成、样式与持久化

- [x] **T8 — 主页面集成与样式适配**（`FR-1` ~ `FR-5`, `NFR-2`）
  - 更新 `src/style/index.less`：正文排版 CSS 变量与 `@media print` 隔离、页内查找高亮样式、可缩放图片/Mermaid `zoom-in` 指针
  - 更新 `src/routes/+page.svelte`：
    - 接入排版设置 UI 与重置按钮、自定义外部编辑器设置项，读写 `.settings.dat`
    - 接入 `Mod+F` 与分层 `Esc` 调度、文档切换/热重载后自动更新 `FindBar`
    - 接入点击图片与 Mermaid 打开 `MediaLightbox`
    - 接入阅读工具栏「外部打开 / 在访达(资源管理器)中显示」下拉菜单
    - 接入侧边栏 `WorkspaceSwitcher`、目录有效性校验与工作区切换持久化

---

## 阶段 E：全量自动化测试与构建门禁

- [x] **T9 — 自动化验证与回归检查**（`NFR-4`）
  - `node --test tests/*.test.mjs`：41 / 41 通过（含 12 项新增单测）
  - `cd src-tauri && cargo test`：8 / 8 通过（含外部打开校验单测）
  - `npm run build`：静态生产构建通过且无新增 Svelte 警告
  - `cd src-tauri && cargo check`：编译通过零警告
  - `npm run check`：所有新增/修改模块 0 错误、0 警告（仓库遗留未改动文件的历史 `svelte-check` 报错未触碰）

---

## 阶段 F：实测反馈修订（FR-2 排版精调增强与覆盖修复）

- [x] **T10 — 排版精调 Spec 修订落地与 CSS 优先级修复**（`FR-2`, AC-2.1 ~ AC-2.4）
  - 扩展 `src/lib/reading-typography.ts` 字号范围至 `14–32px`，宽度预设改为基于阅读区窗口宽度的 `cqi` 响应式表达式（纯正文 `56/74/94cqi`、带回响栏 `68/82/100cqi - 48px`）
  - 修复 `src/style/index.less` 中 `.theme()` 覆盖容器 `font-size`/`line-height` 及子元素固定 `px`/`rem` 的问题，确保正文段落/标题/列表/代码/表格全部实时响应
  - 修复 `src/routes/+page.svelte` 中 `.reading-context` 和 `@container reading-area` 带回响时写死 `820px`/`900px`/`1160px` 的问题
  - 更新 `tests/reading-typography.test.mjs` 并重跑全量测试与构建

- [x] **T11 — 修复自定义外部编辑器启动与工作区切换权限问题**（`FR-4`, `FR-5`）
  - 在 `src-tauri/src/lib.rs` 实现 `launch_with_custom_editor`（支持 CLI 查找、常用别名映射、同步检查 `open -a` 退出码避免静默失败）并补充 `cargo test`
  - 修复 `src/routes/+page.svelte` 的 `switchWorkspace` 去掉受限的 `exists(path)` 改为 `readDir(path)` 校验，并在初始化时从 `tabsByWorkspace` 迁移历史工作区路径
