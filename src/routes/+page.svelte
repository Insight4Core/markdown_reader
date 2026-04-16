<script lang="ts">
  import { open, ask } from '@tauri-apps/plugin-dialog';
  import { readTextFile, watch, readDir } from '@tauri-apps/plugin-fs';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Store, load } from '@tauri-apps/plugin-store';
  import { resolve, dirname } from '@tauri-apps/api/path';
  import { i18nState, t, detectSystemLanguage } from '$lib/i18n.svelte';
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
  let folderFiles = $state<{name: string, path: string, depth: number, isDir?: boolean}[]>([]);
  let collapsedFolders = $state(new Set<string>());

  let searchQuery = $state('');
  let filteredFiles = $derived(folderFiles.filter(f => (searchQuery === '' || (!f.isDir && f.name.toLowerCase().includes(searchQuery.toLowerCase())))));
  let visibleTreeFiles = $derived(filteredFiles.filter(item => {
    // Check if item should be hidden due to a collapsed parent
    for (const collapsedPath of collapsedFolders) {
      if (item.path !== collapsedPath && item.path.startsWith(collapsedPath)) {
         return false;
      }
    }
    return true;
  }));
  let maxDepth = $state(2);
  let sidebarWidth = $state(260);
  
  let headers = $state<{id: string, text: string, level: number}[]>([]);
  let unwatch: (() => void) | null = null;
  
  // Persistent Store Logic
  let store: any = null;
  let isStoreReady = false;

  async function syncStore() {
    if (!isStoreReady || !store) return;
    await store.set('folderPath', folderPath);
    await store.set('filePath', filePath);
    await store.set('maxDepth', maxDepth);
    await store.set('sidebarWidth', sidebarWidth);
    await store.set('locale', i18nState.locale);
    await store.save();
    console.log("[Store] Saved data:", {folderPath, filePath, maxDepth, sidebarWidth, locale: i18nState.locale});
  }


  $effect(() => {
    async function initSettings() {
      try {
        store = await load('.settings.dat', { autoSave: false });
        
        const savedLocale = await store.get<{value?: string} | string>('locale');
        if (savedLocale) {
            i18nState.locale = typeof savedLocale === 'string' ? savedLocale : (savedLocale.value || 'zh');
        } else {
            i18nState.locale = detectSystemLanguage();
            // Automatically persist detection for future runs
            if (store) store.set('locale', i18nState.locale);
        }

        const savedDepth = await store.get<{value?: number} | number>('maxDepth');
        if (savedDepth) maxDepth = typeof savedDepth === 'number' ? savedDepth : (savedDepth.value || maxDepth);

        const savedWidth = await store.get<{value?: number} | number>('sidebarWidth');
        if (savedWidth) sidebarWidth = typeof savedWidth === 'number' ? savedWidth : (savedWidth.value || sidebarWidth);

        const savedFolderPath = await store.get<{value?: string} | string>('folderPath');
        if (savedFolderPath) {
          let fp = typeof savedFolderPath === 'string' ? savedFolderPath : savedFolderPath.value;
          if (fp) {
             folderPath = fp;
             scanFolder(folderPath, 1).then(files => { folderFiles = files; });
          }
        }

        const savedFilePath = await store.get<{value?: string} | string>('filePath');
        if (savedFilePath) {
          let fp = typeof savedFilePath === 'string' ? savedFilePath : savedFilePath.value;
          if (fp) {
             await openSpecificFile(fp);
          }
        }
        console.log("[Store] Loaded data:", await store.entries());
      } catch (e) {
        console.error("[Store] Failed to load settings:", e);
      } finally {
        if (store) isStoreReady = true;
      }
    }
    initSettings();
  });

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

  let isCheckingUpdate = $state(false);

  async function checkUpdate(manual = false) {
    if (isCheckingUpdate) return;
    isCheckingUpdate = true;
    try {
      const update = await check();
      if (update && update.available) {
        const yes = await ask(`${t('update.new_version')} ${update.version}！\n\n${t('update.content')}: ${update.body || t('update.regular')}\n\n${t('update.prompt')}？`, { title: `Pyrus ${t('update.title')}`, kind: 'info' });
        if (yes) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } else if (manual) {
        await ask(t('update.up_to_date'), { title: `Pyrus ${t('update.title')}`, kind: 'info' });
      }
    } catch (e: any) {
      console.warn("Auto-updater check failed:", e);
      if (manual) {
        await ask(`${t('update.error')} ${e.message || String(e)}`, { title: `Pyrus ${t('update.title')}`, kind: 'error' });
      }
    } finally {
      isCheckingUpdate = false;
    }
  }

  $effect(() => {
    const hasChecked = sessionStorage.getItem('has_checked_update');
    if (!hasChecked) {
      checkUpdate(false);
      sessionStorage.setItem('has_checked_update', '1');
    }
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

  async function scanFolder(currentPath: string, currentDepth: number): Promise<{name: string, path: string, depth: number, isDir?: boolean}[]> {
    if (currentDepth > maxDepth) return [];
    
    let results: {name: string, path: string, depth: number, isDir?: boolean}[] = [];
    try {
      const entries = await readDir(currentPath);
      for (const entry of entries) {
        if (entry.name && !entry.name.startsWith('.')) {
          const fullPath = currentPath + (currentPath.endsWith('/') || currentPath.endsWith('\\') ? '' : '/') + entry.name;
          if (entry.isDirectory) {
            const subFiles = await scanFolder(fullPath, currentDepth + 1);
            if (subFiles.length > 0) {
              results.push({ name: entry.name, path: fullPath, depth: currentDepth, isDir: true });
              results = [...results, ...subFiles];
            }
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
      filePath = '';
      markdownHtml = '';
      folderFiles = await scanFolder(folderPath, 1);
      sidebarTab = 'files';
      syncStore();
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
    if (!path) return;
    filePath = path;
    getCurrentWindow().setTitle(filePath.split(/[/\\]/).pop() || 'Pyrus');
    sidebarTab = 'toc'; // 需求：点击后自动跳转大纲模式
    await loadContent();
    
    // Reset scroll position to top for the new file
    window.scrollTo({ top: 0, behavior: 'auto' });
    
    syncStore();

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

  async function handleMarkdownClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const aTag = target.closest('a');
    if (aTag) {
      const href = aTag.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        e.preventDefault();
        try {
          const decodedHref = decodeURIComponent(href);
          const dir = await dirname(filePath);
          let resolved = await resolve(dir, decodedHref);
          if (resolved) {
            openSpecificFile(resolved);
          }
        } catch(err) {
          console.error("Link resolve failed", err);
        }
      }
    }
  }

  function toggleFolder(path: string) {
    if (collapsedFolders.has(path)) {
      collapsedFolders.delete(path);
    } else {
      collapsedFolders.add(path);
    }
    // trigger state reactivate gracefully for Sets
    collapsedFolders = new Set(collapsedFolders);
  }

  // Sidebar drag to resize
  let isResizing = false;
  function startResize(e: MouseEvent) {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    let newWidth = e.clientX;
    if (newWidth < 200) newWidth = 200;
    if (newWidth > 800) newWidth = 800;
    sidebarWidth = newWidth;
  }

  function stopResize() {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
      syncStore(); // Persist width
    }
  }
</script>


<div class="md-reader" ondblclick={() => { if (!filePath) openFile(); }} style="--side-width: {sidebarWidth}px;">
  <div class="md-reader__side">
    <div class="sidebar-tabs">
      <button class={sidebarTab === 'files' ? 'active' : ''} onclick={() => sidebarTab = 'files'}>{t('sidebar.files')}</button>
      <button class={sidebarTab === 'toc' ? 'active' : ''} onclick={() => sidebarTab = 'toc'}>{t('sidebar.toc')}</button>
    </div>
    
    <div class="sidebar-content">
      {#if sidebarTab === 'files'}
        <div style="padding: 10px 15px; border-bottom: 1px solid rgba(125,125,125,0.1);">
          <input type="text" bind:value={searchQuery} placeholder={t('sidebar.search_placeholder')} class="search-input" />
        </div>
        <ul style="margin:0; padding:0; list-style: none;">
          {#if visibleTreeFiles.length === 0}
             <li style="padding: 10px 22px; color: #666; font-size: 13px;">{t('sidebar.no_md_match')}</li>
          {:else}
             {#each visibleTreeFiles as f}
               {#if f.isDir}
                 <li class="folder-item" style="padding-left: {10 + (f.depth - 1) * 12}px; font-weight: bold; color: rgba(0, 122, 204, 0.8); cursor: pointer; padding-top: 8px; padding-bottom: 4px; user-select: none;" onclick={() => toggleFolder(f.path)}>
                   <span class="file-icon" style="display:inline-block; width:16px; margin-right: 4px;">{collapsedFolders.has(f.path) ? '▶' : '▼'}</span>
                   <span class="file-icon">📁</span>
                   <span class="file-name" title={f.name}>{f.name}</span>
                 </li>
               {:else}
                 <li class="file-item {filePath === f.path ? 'active-file' : ''}" style="padding-left: {26 + (f.depth - 1) * 12}px" onclick={(e) => { e.stopPropagation(); openSpecificFile(f.path); }}>
                   <span class="file-icon">📝</span>
                   <span class="file-name" title={f.name}>{f.name}</span>
                 </li>
               {/if}
             {/each}
          {/if}
        </ul>
      {:else}
        <ul style="margin:0; padding:0;">
          {#if headers.length === 0}
            <li style="padding: 10px 22px; color: #666;">{t('sidebar.no_toc')}</li>
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
    
    <!-- Resizer Handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sidebar-resizer" onmousedown={startResize}></div>
  </div>

  <div class="md-reader__body">
    {#if !filePath}
      <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height: 100vh; color: #888; font-family: system-ui; text-align: center;">
        <div style="font-size: 64px; margin-bottom: 20px; opacity: 0.8;">📚</div>
        <h2 style="color: rgba(0, 122, 204, 0.8); margin-bottom: 10px; font-weight: 500;">{t('welcome.title')}</h2>
        <p style="font-size: 14px; margin-bottom: 24px;">{t('welcome.subtitle')}</p>
      </div>
    {:else}
      <div class="md-reader__markdown-content centered" onclick={handleMarkdownClick}>
        {@html markdownHtml}
      </div>
    {/if}
  </div>
</div>

<button class="md-reader__btn floating-gear glass" onclick={() => drawerOpen = !drawerOpen} style="position:fixed; bottom: 30px; right: 30px; z-index:100; display:flex; justify-content:center; align-items:center;">
  ⚙️
</button>

{#if drawerOpen}
<div class="drawer glass">
  <h3>{t('settings.title')}</h3>
  <button onclick={openFile} class="btn-primary">{t('settings.open_file')}</button>
  <button onclick={openFolder} class="btn-primary" style="background:#2ea44f;">{t('settings.open_folder')}</button>
  <hr style="border:0; border-top:1px solid rgba(125,125,125,0.2)"/>
  
  <div style="display:flex; flex-direction:column; gap:5px; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
       <label>{t('settings.sys_language')}</label>
       <select bind:value={i18nState.locale} onchange={syncStore} style="padding:2px 4px; border-radius:4px; border:1px solid #ccc;">
         <option value="zh">中文</option>
         <option value="en">English</option>
       </select>
    </div>
  </div>

  <hr style="border:0; border-top:1px solid rgba(125,125,125,0.2)"/>
  
  <button onclick={() => checkUpdate(true)} class="btn-primary" style="background:#58a6ff;" disabled={isCheckingUpdate}>
    {isCheckingUpdate ? t('update.checking') : t('update.check_btn')}
  </button>

  <hr style="border:0; border-top:1px solid rgba(125,125,125,0.2)"/>

  <div style="display:flex; flex-direction:column; gap:5px; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
       <label>{t('settings.scan_depth')}: <b>{maxDepth} {t('settings.layers')}</b></label>
       {#if folderPath}
         <span style="color:#007acc; cursor:pointer;" onclick={refreshFolder}>{t('settings.refresh')}</span>
       {/if}
    </div>
    <input type="range" bind:value={maxDepth} min="1" max="5" style="width:100%" onchange={refreshFolder} />
    <span style="font-size: 12px; color:#888;">{t('settings.depth_hint')}</span>
  </div>

  <hr style="border:0; border-top:1px solid rgba(125,125,125,0.2)"/>
  <label><input type="checkbox" bind:checked={showSidebar} /> {t('settings.toggle_sidebar')}</label>
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
  
  .sidebar-resizer {
    position: absolute;
    top: 0;
    right: 0;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
    transition: background 0.2s;
  }
  .sidebar-resizer:hover, .sidebar-resizer:active {
    background: rgba(0, 122, 204, 0.3);
  }
  
  /* Sidebar Tabs */
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
  .search-input {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid rgba(125,125,125,0.3);
    border-radius: 6px;
    outline: none;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.5);
  }
  @media (prefers-color-scheme: dark) {
     .search-input { background: rgba(0, 0, 0, 0.2); color: #ddd; }
  }
  .search-input:focus { border-color: #007acc; }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
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
