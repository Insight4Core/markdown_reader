# Design: v0.11 极致阅读工艺（Reading Craft）

- **关联规范**：[spec.md](./spec.md)
- **状态**：`Approved`（已确认）

---

## 1. 架构原则与模块拆分

为了落实 [intent.md](./intent.md) 中“不再无节制堆大 `src/routes/+page.svelte`”的目标，本期采用**纯逻辑模块 + 独立 Svelte 5 子组件 + Rust 安全命令**的分层结构：

```text
src/
├── lib/
│   ├── in-page-find.ts              # FR-1 纯匹配算法 + DOM 高亮/清除工具
│   ├── reading-typography.ts        # FR-2 排版预设、校验与 CSS 变量映射
│   ├── media-lightbox.ts            # FR-3 缩放计算、触发判定逻辑
│   ├── recent-workspaces.ts         # FR-5 最近工作区去重/置顶/迁移/移除纯逻辑
│   ├── export-document.ts           # [修改] 复制富文本时解包页内查找 <mark>
│   ├── i18n.svelte.ts               # [修改] 新增中英双语词条
│   └── components/
│       ├── FindBar.svelte           # FR-1 页内查找浮条组件
│       ├── MediaLightbox.svelte     # FR-3 图片与 Mermaid 矢量灯箱组件
│       └── WorkspaceSwitcher.svelte # FR-5 侧边栏工作区导航 + 切换下拉菜单
├── routes/
│   └── +page.svelte                 # [修改] 轻量状态粘合、快捷键调度、持久化读写
└── style/
    └── index.less                   # [修改] 排版 CSS 变量、查找高亮与打印隔离样式

src-tauri/src/
└── lib.rs                           # [修改] 新增 open_file_externally & reveal_file_in_manager
```

---

## 2. 逐项技术设计

### 2.1 FR-1：页内查找（`src/lib/in-page-find.ts` + `FindBar.svelte`）

#### 纯逻辑 API
```ts
export interface TextMatchRange {
  start: number;
  end: number;
}

export const FIND_SEED_MAX_LENGTH = 80;

/** 大小写不敏感的纯文本字面量匹配（不构造未转义正则，避免特殊字符异常） */
export function findMatchRanges(text: string, query: string): TextMatchRange[];

/** 循环切换匹配序号，total === 0 时返回 -1 */
export function nextMatchIndex(current: number, total: number, delta: 1 | -1): number;

/** 若选中文本为单行且 ≤ 80 字符则返回作为查找初始词，否则返回 '' */
export function sanitizeFindSeed(selected: string): string;
```

#### DOM 高亮与安全还原策略
- **清除（`clearInPageHighlights(root)`）**：
  - 查找 `root.querySelectorAll('mark.in-page-find')`，将每个 `<mark>` 替换为 `document.createTextNode(mark.textContent || '')`，随后对受影响的父节点调用 `parent.normalize()`，保证文本节点完整还原、不留碎片节点。
- **遍历与跳过（`applyInPageHighlights(root, query)`）**：
  - 先执行 `clearInPageHighlights(root)`；若 `query.trim() === ''` 返回 `[]`。
  - 使用 `document.createTreeWalker(root, NodeFilter.SHOW_TEXT)` 收集所有目标文本节点（先收集数组再原地替换，防止遍历过程中 DOM 变更干扰迭代）。
  - 节点过滤：若文本节点的祖先命中以下任一选择器则跳过：
    `script, style, noscript, button, .md-reader__btn, .mermaid-diagram, svg, .katex-mathml, .sr-only`
  - 对命中的文本节点切分为普通文本与 `<mark class="in-page-find">` 插入 `DocumentFragment` 并替换原节点，返回有序的 `HTMLElement[]`。
- **激活项定位（`setActiveHighlight(marks, index, reducedMotion)`）**：
  - 移除旧的 `in-page-find--active`，给 `marks[index]` 添加 `in-page-find--active`，调用 `scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' })`。
- **防抖与生命周期**：
  - 文本长度较小直接同步执行，大文档输入走轻量防抖（`80ms`）以防长文卡顿。
  - 在 `loadContent()` 完成文章渲染（含 Mermaid）后，如果 `findBarOpen && findQuery.trim()`，自动重新执行匹配并 clamp 保留接近的 `findIndex`。
  - 离开阅读视图（回到知识库首页或关闭工作区）时自动关闭 `FindBar`。
- **导出/打印双重隔离**：
  1. `src/lib/export-document.ts` 的 `articleHtmlForClipboard()` 在克隆节点后，将 `clone.querySelectorAll('mark.in-page-find')` 解包为纯文本节点，避免把查找高亮粘进邮件/文档。
  2. `src/style/index.less` 的 `@media print` 中隐藏 `.find-bar`，并将 `mark.in-page-find` 重置为 `background: transparent; color: inherit; box-shadow: none;`。

---

### 2.2 FR-2：阅读排版精调（`src/lib/reading-typography.ts`）

#### 数据模型与校验
```ts
export type ReadingWidthPreset = 'narrow' | 'comfortable' | 'wide';
export type ReadingLineHeightPreset = 'compact' | 'standard' | 'relaxed';

export interface ReadingTypography {
  fontSize: number; // 14..32, integer
  width: ReadingWidthPreset;
  lineHeight: ReadingLineHeightPreset;
}

export const DEFAULT_TYPOGRAPHY: ReadingTypography = {
  fontSize: 16,
  width: 'comfortable',
  lineHeight: 'standard',
};

/** Responsive widths based on reading-area container inline size (cqi). */
export const WIDTH_PRESET_CSS: Record<ReadingWidthPreset, string> = {
  narrow: 'clamp(520px, 56cqi, 100cqi)',
  comfortable: 'clamp(680px, 74cqi, 100cqi)',
  wide: 'clamp(880px, 94cqi, 100cqi)',
};

export const ECHO_SHELL_WIDTH_CSS: Record<ReadingWidthPreset, string> = {
  narrow: 'clamp(840px, 68cqi, calc(100cqi - 48px))',
  comfortable: 'clamp(960px, 82cqi, calc(100cqi - 48px))',
  wide: 'calc(100cqi - 48px)',
};

export const LINE_HEIGHT_PRESET_VALUE: Record<ReadingLineHeightPreset, number> = {
  compact: 1.5,
  standard: 1.65,
  relaxed: 1.85,
};
```
- `normalizeTypography(raw: unknown): ReadingTypography`：校验每个字段，字号取整并 clamp 在 `[14, 32]`，枚举不在白名单则回退默认值。
- `typographyCssVars(t: ReadingTypography)`：输出 `--reader-font-size: ${t.fontSize}px`、`--reader-max-width: ${WIDTH_PRESET_CSS[t.width]}`、`--reader-line-height: ${LINE_HEIGHT_PRESET_VALUE[t.lineHeight]}`。

#### CSS 作用域隔离与覆盖修复
- 变量注入到 `.md-reader__body` 下的阅读容器（`.reading-context` 与 `.reading-shell` / `.md-reader__markdown-content`），使其作为 `container-name: reading-area` 的子元素正确按当前阅读区宽度解析 `cqi`。
- 在 `src/style/index.less` 中，将 `font-size: var(--reader-font-size, 16px)` 与 `line-height: var(--reader-line-height, 1.65)` 放在 `.theme()` 展开**之后**，并将 `.theme()` 内部写死 `px`/`rem` 的 `h3–h6`、`code`、`pre > code`、`pre`、`figure figcaption` 覆写为相对 `em` 与 `inherit`，确保正文全元素实时按比例响应字号与行距调节。
- 在 `+page.svelte` 的 `@container reading-area (min-width: 1100px)` 规则中移除写死的 `820px` / `1160px`，改为跟随 `var(--reader-max-width)` 计算含知识回响侧栏时的布局宽度，保证大屏与带回响栏时宽度档位同样明显生效。
- `@media print` 中显式重置 `.md-reader__markdown-content` 的 `font-size` / `line-height` / `max-width: none`，保持既有的优雅打印排版。

---

### 2.3 FR-3：图片与 Mermaid 图表灯箱查看（`src/lib/media-lightbox.ts` + `MediaLightbox.svelte`）

#### 触发判定（接入 `+page.svelte` 的 `handleMarkdownClick`）
- 点击事件发生在 `.md-reader__markdown-content` 内时：
  1. 既有逻辑优先处理 Copy 按钮和 `<a>` 链接（因此 `<a><img /></a>` 会先被 `target.closest('a')` 拦截，天然不误触灯箱）。
  2. 命中 `img`：提取 `img.currentSrc || img.src`、`img.alt || img.title || ''`，记录触发元素用于关闭后归还焦点，打开灯箱（`kind: 'image'`）。
  3. 命中 `.mermaid-diagram:not(.mermaid-diagram--failed):not(.mermaid-diagram--pending)`：查找当前屏幕上可见的 SVG（`.mermaid-diagram__screen svg` 或 `.mermaid-diagram__both svg`），序列化/克隆其安全 SVG markup 与原始宽高（来自 `getBoundingClientRect` / `viewBox`），打开灯箱（`kind: 'svg'`）。

#### 灯箱交互设计（`MediaLightbox.svelte`）
- 使用原生 `<dialog class="media-lightbox">` + `showModal()`，顶层渲染、自带 `::backdrop`，在 `oncancel` 中拦截并执行关闭清理。
- 缩放状态：`scale` 范围 `[0.5, 4.0]`（默认 `1.0`），通过 `clampZoom` / `stepZoom` 计算；拖拽偏移 `(offsetX, offsetY)` 仅在 `scale > 1` 时允许鼠标指针拖拽平移（使用 `pointerdown` / `pointermove` / `pointerup` + `setPointerCapture`），点击复位或缩放回 `<= 1` 时自动归零偏移。
- 键盘操作：`+`/`=` 放大，`-` 缩小，`0` 复位，`Esc` 关闭。
- 滚轮缩放：在灯箱舞台区域滚轮向上放大、向下缩小（`preventDefault` 防止背后页面滚动）。
- Mermaid 展示衬底：在深色主题（`dark` / `terminal` / `glass`）下用 `var(--color-bg)` 卡片衬底，浅色主题用浅色衬底，保证矢量图与文字高对比度。

---

### 2.4 FR-4：外部工作流快捷动作（Rust 命令 + 工具栏菜单）

#### 为什么放在 Rust 后端而非直接前端调 `plugin-opener`
`tauri-plugin-opener` 的默认前端 capability scope 会限制任意路径打开；而 Pyrus 面向磁盘任意位置的 Markdown 文件。放在 Rust 后端通过 `tauri_plugin_opener::OpenerExt` 实现，可以：
1. 在后端做严格的白名单校验（文件必须存在、是常规文件、且扩展名为 `.md` / `.markdown` / `.mdx`），杜绝任意可执行文件被触发的安全风险；
2. 跨平台（macOS / Windows / Linux）统一处理自定义编辑器参数与错误信息。

#### Rust 端接口（`src-tauri/src/lib.rs`）
```rust
fn validate_markdown_file_path(raw: &str) -> Result<PathBuf, String> {
    // 1. 非空校验
    // 2. Path::is_file() 校验存在且为文件
    // 3. 扩展名大小写不敏感匹配 md | markdown | mdx
}

fn normalize_editor_arg(editor: Option<String>) -> Option<String> {
    // trim 后为空返回 None，否则返回 Some(trimmed)
}

#[tauri::command]
fn open_file_externally(
    app: tauri::AppHandle,
    path: String,
    editor: Option<String>,
) -> Result<(), String> {
    let target = validate_markdown_file_path(&path)?;
    match normalize_editor_arg(editor) {
        None => app
            .opener()
            .open_path(target.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|error| error.to_string()),
        Some(ed) => launch_with_custom_editor(&target, &ed),
    }
}

#[tauri::command]
fn reveal_file_in_manager(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = validate_markdown_file_path(&path)?;
    app.opener()
        .reveal_item_in_dir(target)
        .map_err(|error| error.to_string())
}
```
*(注册到 `tauri::generate_handler![...]`，无需修改 `capabilities/default.json` 扩大前端高危权限。其中 `launch_with_custom_editor` 在 macOS 上优先查找 `PATH` 与常见 CLI 路径及 `.app` 内置 `bin`，未命中时通过常用别名映射如 `code`→`Visual Studio Code`、`cursor`→`Cursor` 调用 `open -a` 并同步检查退出码，失败必返回错误给前端 Toast。)*

#### 前端入口设计
- 在阅读视图的 `.reading-toolbar` 上，紧邻「导出」按钮放置轻量的「外部打开（Open）」下拉菜单（或工具栏分组按钮），包含：
  1. 「在外部编辑器中打开」（副标题显示已配置的编辑器名或「系统默认应用」）
  2. 「在访达中显示」/「在资源管理器中显示」/「在文件管理器中显示」（根据平台区分文案）
- 在设置抽屉「阅读」或「工作区」分区增加一项可选文本输入：`外部编辑器（可选）`，占位符示例 `code, cursor, Typora...`（留空则使用系统默认应用），持久化键为 `externalEditor`。

---

### 2.5 FR-5：最近工作区快速切换（`src/lib/recent-workspaces.ts` + `WorkspaceSwitcher.svelte`）

#### 纯逻辑 API
```ts
export const RECENT_WORKSPACES_LIMIT = 8;

export function normalizeWorkspacePath(path: string): string;
export function workspaceDisplayName(path: string): string;
export function recordRecentWorkspace(list: string[], path: string, limit?: number): string[];
export function removeRecentWorkspace(list: string[], path: string): string[];
export function restoreRecentWorkspaces(raw: unknown, currentFolderPath?: string): string[];
```
- 路径规范化：统一将 `\` 转为 `/`，去除尾部多余 `/`，保留盘符/根路径语义，避免 Windows 路径分隔符不一致导致的重复项。
- 首次从 `v0.10.0` 升级时，`restoreRecentWorkspaces(saved, folderPath)` 自动把当前 `folderPath` 放入首位。

#### UI 与失效目录容错（`WorkspaceSwitcher.svelte`）
- 保持侧边栏顶部左侧区域为「返回知识库首页」按钮（现有肌肉记忆完全保留）。
- 右侧提供一个紧凑的下拉触发按钮（`aria-haspopup="menu"`, `aria-expanded`），点击展开切换菜单：
  - 展示最近工作区列表（名称 + 精简父路径 + 当前勾选标记）；
  - 非当前项提供轻量的 `×` 移除按钮（`stopPropagation`，仅移出列表不删文件）；
  - 底部提供「打开其他文件夹…」「新建知识库…」快捷项。
- 切换前直接通过已配置 `fs:allow-read-dir` 权限的 `readDir(targetPath)` 校验目标目录是否存在且可访问（避免调用未配置 `**` scope 的 `exists` 被权限拦截）；若不存在或无法读取，给出 Toast 提示并保持当前工作区完全不变。

---

## 3. 持久化与快捷键汇总

### 3.1 `.settings.dat` 新增字段（100% 向后兼容）
| Key | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `readingTypography` | `ReadingTypography` | `{ fontSize: 16, width: 'comfortable', lineHeight: 'standard' }` | FR-2 阅读排版配置 |
| `externalEditor` | `string` | `''` | FR-4 自定义外部编辑器命令/名称 |
| `recentWorkspaces` | `string[]` | `[]` | FR-5 最近打开的知识库路径列表（≤ 8） |

### 3.2 快捷键与 `Esc` 层级矩阵
- `Mod+F`：仅在 `filePath` 非空（且无顶层模态弹窗拦截）时打开/聚焦 `FindBar`，调用 `event.preventDefault()` 屏蔽 WebView 原生查找条。
- `Esc` 响应优先级（从高到低，每次只关最上层）：
  1. `MediaLightbox`（`<dialog>` 原生 `oncancel`）
  2. `GlobalSearch`（`<dialog>` 原生 `oncancel`）
  3. `NewWorkspaceModal`
  4. `SettingsDrawer`
  5. `CompactEchoPeek`（`<dialog>` 原生 `oncancel`）
  6. 轻量下拉菜单（`ExportMenu` / `ExternalMenu` / `WorkspaceSwitcher`）
  7. `FindBar`

---

## 4. 风险与权衡

1. **大文档页内高亮性能**：对极长文档每次按键同步拆 DOM 可能卡顿。应对：加入 `80ms` 防抖，且仅在文档文本节点变化时重扫；清除时先批量替换再对父节点 `normalize()`。
2. **Mermaid SVG 克隆与 ID 冲突**：直接把页面内 SVG 原样 `innerHTML` 放进灯箱可能和原页面 SVG 里的 `<defs>` / `marker` ID 冲突，导致箭头消失。应对：在灯箱克隆 SVG 时，如果存在 `id` 引用冲突风险，或直接为灯箱克隆副本的 `id` 与 `url(#...)` / `href="#..."` 加唯一前缀（如 `lb-`），彻底避免 SVG marker/clipPath 冲突。
3. **macOS 系统默认打开 `.md` 指向 Pyrus 自身**：如果用户把 Pyrus 设为系统默认 `.md` 打开方式，点击「系统默认应用打开」可能会再次拉起 Pyrus。应对：支持在设置里填外部编辑器（如 `code`、`cursor`、`Typora`），并在无自定义编辑器时保持「在访达/资源管理器中显示」就在同一菜单紧挨着，方便用户随时右击选应用。

---

## 5. 测试与验证策略

1. **前端单元测试（`node --test tests/*.test.mjs`）**：
   - `tests/in-page-find.test.mjs`：覆盖 `findMatchRanges`（大小写、中文、正则特殊字符、重叠/边界、空查询）、`nextMatchIndex`（正向/反向/循环/空结果）、`sanitizeFindSeed`（单行/多行/超长截断）。
   - `tests/reading-typography.test.mjs`：覆盖 `normalizeTypography`（默认值、越界 clamp、非法枚举、旧数据缺失）、`isDefaultTypography`、`typographyCssVars`。
   - `tests/media-lightbox.test.mjs`：覆盖 `clampZoom`、`stepZoom`、`formatZoomPercent`、`shouldOpenImageLightbox`（排除 `<a>` 包裹图片）以及 SVG ID 重写防冲突函数。
   - `tests/recent-workspaces.test.mjs`：覆盖 `recordRecentWorkspace`（置顶、去重、Windows 路径规范化、上限 8 条淘汰）、`removeRecentWorkspace`、`restoreRecentWorkspaces`。
2. **Rust 单元测试（`cd src-tauri && cargo test`）**：
   - 覆盖 `validate_markdown_file_path`（合法 `.md/.markdown/.mdx`、大小写扩展名、拒绝非 Markdown 如 `.exe/.sh`、拒绝不存在路径和目录）以及 `normalize_editor_arg`。
3. **静态检查与构建门禁**：
   - `npm run check`（`svelte-check` 零错误）
   - `npm run build`（Vite 静态构建通过）
   - `cd src-tauri && cargo check`（Rust 编译通过）
4. **手工/端到端冒烟验证清单**（落地后逐条核对 AC-1.1 ~ AC-5.5 及 5 套主题、打印预览与富文本复制）。
