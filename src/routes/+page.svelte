<script lang="ts">
  import { open, ask } from '@tauri-apps/plugin-dialog';
  import { readTextFile, watch, readDir } from '@tauri-apps/plugin-fs';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { check } from '@tauri-apps/plugin-updater';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { mdRender } from '@/core/markdown';
  import { tick } from 'svelte';
  import '@/style/index.less';

  let markdownHtml = $state('<div style="text-align: center; margin-top: 40vh; color: #888;">Double click anywhere or click the gear to open a markdown file.</div>');
  let filePath = $state('');
  
  let drawerOpen = $state(false);
  let showSidebar = $state(true);
  
  let sidebarTab = $state<'files' | 'toc'>('toc');
  let folderPath = $state('');
  let folderFiles = $state<{name: string, path: string, depth: number}[]>([]);
  let maxDepth = $state(2);
  
  let headers = $state<{id: string, text: string, level: number}[]>([]);
  let unwatch: (() => void) | null = null;
  
  $effect(() => {
    if (typeof document !== 'undefined') {
      if (showSidebar) {
        document.body.classList.add('side-expanded');
        document.body.classList.remove('side-collapsed');
      } else {
        document.body.classList.add('side-collapsed');
        document.body.classList.remove('side-expanded');
      }
    }
  });

  $effect(() => {
    async function checkUpdate() {
      try {
        const update = await check();
        if (update && update.available) {
          const yes = await ask(`发现新版本 ${update.version}！\n\n更新内容: ${update.body || '常规更新'}\n\n是否立即下载并重启更新？`, { title: 'Markdown Reader 升级提示', kind: 'info' });
          if (yes) {
            await update.downloadAndInstall();
            await relaunch();
          }
        }
      } catch (e) {
        console.warn("Auto-updater check failed:", e);
      }
    }
    checkUpdate();
  });
  
  async function loadContent() {
      if (!filePath) return;
      try {
        const content = await readTextFile(filePath);
        
        const MD_PLUGINS = [
          'Emoji', 'Sub', 'Sup', 'Ins', 'Abbr', 'Katex', 'Mermaid',
          'Mark', 'Deflist', 'Footnote', 'TaskLists', 'TOC', 'Alert'
        ];
        
        markdownHtml = mdRender(content, { theme: 'light', plugins: MD_PLUGINS });
        
        tick().then(() => {
           const article = document.querySelector('.md-reader__markdown-content');
           if (article) {
              const hElements = Array.from(article.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[];
              headers = hElements.map(h => {
                let id = h.id;
                if (!id) {
                  id = encodeURIComponent((h.textContent || '').toLowerCase().replace(/\s+/g, '-'));
                  h.id = id;
                }
                return {
                   id,
                   text: h.innerText.replace(/^#+/, '').trim(),
                   level: parseInt(h.tagName[1])
                };
              });
           }
        });
      } catch (e: any) {
        markdownHtml = `<div style="text-align: center; margin-top: 40vh; color: red;">读取文件失败: <br/>${e.toString()}</div>`;
        console.error("loadContent Error:", e);
      }
  }

  async function scanFolder(currentPath: string, currentDepth: number): Promise<{name: string, path: string, depth: number}[]> {
    if (currentDepth > maxDepth) return [];
    
    let results: {name: string, path: string, depth: number}[] = [];
    try {
      const entries = await readDir(currentPath);
      for (const entry of entries) {
        if (entry.name && !entry.name.startsWith('.')) {
          const fullPath = currentPath + (currentPath.endsWith('/') || currentPath.endsWith('\\') ? '' : '/') + entry.name;
          if (entry.isDirectory) {
            const subFiles = await scanFolder(fullPath, currentDepth + 1);
            results = [...results, ...subFiles];
          } else if (entry.isFile && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown') || entry.name.endsWith('.mdx'))) {
            results.push({ name: entry.name, path: fullPath, depth: currentDepth });
          }
        }
      }
    } catch (e) {
      console.warn("Failed to read dir:", e);
    }
    return results;
  }

  async function openFolder() {
    drawerOpen = false;
    const selected = await open({
      directory: true,
      multiple: false
    });
    
    if (selected) {
      folderPath = selected as string;
      folderFiles = await scanFolder(folderPath, 1);
      sidebarTab = 'files';
      if (folderFiles.length > 0) {
        openSpecificFile(folderFiles[0].path);
      }
    }
  }

  async function refreshFolder() {
    if (folderPath) {
       folderFiles = await scanFolder(folderPath, 1);
    }
  }

  async function openFile() {
    drawerOpen = false;
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]
    });
    
    if (selected) {
      openSpecificFile(selected as string);
    }
  }

  async function openSpecificFile(path: string) {
    filePath = path;
    getCurrentWindow().setTitle(filePath.split(/[/\\]/).pop() || 'Markdown Reader');
    sidebarTab = 'toc'; // 需求：点击后自动跳转大纲模式
    await loadContent();
    
    if (unwatch) unwatch();
    try {
      unwatch = await watch(filePath, () => {
        loadContent();
      }, { delayMs: 100 });
    } catch (e) {
      console.warn("Watch file failed:", e);
    }
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
</script>


<div class="md-reader" ondblclick={() => { if (!filePath) openFile(); }}>
  <div class="md-reader__side">
    <div class="sidebar-tabs">
      <button class={sidebarTab === 'files' ? 'active' : ''} onclick={() => sidebarTab = 'files'}>📁 文件库</button>
      <button class={sidebarTab === 'toc' ? 'active' : ''} onclick={() => sidebarTab = 'toc'}>📄 大纲</button>
    </div>
    
    <div class="sidebar-content">
      {#if sidebarTab === 'files'}
        <ul style="margin:0; padding:0; list-style: none;">
          {#if folderFiles.length === 0}
             <li style="padding: 10px 22px; color: #666; font-size: 13px;">无 Markdown 文件</li>
          {:else}
             {#each folderFiles as f}
               <li class="file-item {filePath === f.path ? 'active-file' : ''}" style="padding-left: {10 + (f.depth - 1) * 12}px" onclick={(e) => { e.stopPropagation(); openSpecificFile(f.path); }}>
                 <span class="file-icon">📝</span>
                 <span class="file-name" title={f.name}>{f.name}</span>
               </li>
             {/each}
          {/if}
        </ul>
      {:else}
        <ul style="margin:0; padding:0;">
          {#if headers.length === 0}
            <li style="padding: 10px 22px; color: #666;">暂无目录</li>
          {:else}
            {#each headers as h}
              <li class="md-reader__side-h{h.level}">
                <a href="#{h.id}" onclick={(e) => { e.preventDefault(); scrollTo(h.id); }}>
                  {h.text}
                </a>
              </li>
            {/each}
          {/if}
        </ul>
      {/if}
    </div>
  </div>

  <div class="md-reader__body">
    <div class="md-reader__markdown-content centered">
      {@html markdownHtml}
    </div>
  </div>
</div>

<button class="md-reader__btn floating-gear glass" onclick={() => drawerOpen = !drawerOpen} style="position:fixed; bottom: 30px; right: 30px; z-index:100; display:flex; justify-content:center; align-items:center;">
  ⚙️
</button>

{#if drawerOpen}
<div class="drawer glass">
  <h3>偏好设置</h3>
  <button onclick={openFile} class="btn-primary">📄 打开单篇 Markdown 文件</button>
  <button onclick={openFolder} class="btn-primary" style="background:#2ea44f;">📁 指定知识库文件夹</button>
  <hr style="border:0; border-top:1px solid rgba(125,125,125,0.2)"/>
  
  <div style="display:flex; flex-direction:column; gap:5px; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
       <label>📁 文件夹扫描深度: <b>{maxDepth} 层</b></label>
       {#if folderPath}
         <span style="color:#007acc; cursor:pointer;" onclick={refreshFolder}>刷新扫描</span>
       {/if}
    </div>
    <input type="range" bind:value={maxDepth} min="1" max="5" style="width:100%" onchange={refreshFolder} />
    <span style="font-size: 12px; color:#888;">调大后会读取内部嵌套更深的子文件夹文件。</span>
  </div>

  <hr style="border:0; border-top:1px solid rgba(125,125,125,0.2)"/>
  <label><input type="checkbox" bind:checked={showSidebar} /> 开启侧边栏</label>
</div>
{/if}

<style>
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100vh;
    box-shadow: -4px 0 24px rgba(0,0,0,0.1);
    z-index: 90;
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass {
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(200,200,200,0.3);
  }
  @media (prefers-color-scheme: dark) {
    .glass { background: rgba(30, 30, 30, 0.8); border: 1px solid rgba(100,100,100,0.3); }
  }
  .btn-primary {
    background: #007acc; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: 500;
  }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .floating-gear { cursor: pointer; width: 40px; height: 40px; border-radius: 20px; }
  .floating-gear:hover { transform: scale(1.05) !important; transition: transform 0.2s; }
  
  /* Sidebar Tabs */
  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid rgba(125,125,125,0.2);
  }
  .sidebar-tabs button {
    flex: 1;
    background: transparent;
    border: none;
    padding: 12px 0;
    font-size: 14px;
    font-weight: bold;
    color: #666;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  @media (prefers-color-scheme: dark) {
      .sidebar-tabs button { color: #aaa; }
  }
  .sidebar-tabs button.active {
    border-bottom: 2px solid #007acc;
    color: #007acc;
  }
  .sidebar-tabs button:hover {
    background: rgba(125,125,125,0.05);
  }
  
  /* Sidebar Content lists */
  .sidebar-content {
    height: calc(100vh - 45px);
    overflow-y: auto;
  }
  .file-item {
    padding: 8px 15px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-left: 2px solid transparent;
    color: #444;
    transition: all 0.15s;
  }
  @media (prefers-color-scheme: dark) {
      .file-item { color: #ddd; }
  }
  .file-item:hover {
    background: rgba(125,125,125,0.08);
  }
  .file-item.active-file {
    background: rgba(0, 122, 204, 0.1);
    border-left: 2px solid #007acc;
    color: #007acc;
    font-weight: 500;
  }
  .file-icon { font-size: 12px; }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
</style>
