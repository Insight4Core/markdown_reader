<script lang="ts">
  import { open, ask } from '@tauri-apps/plugin-dialog';
  import { readTextFile, watch, readDir } from '@tauri-apps/plugin-fs';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { Store, load } from '@tauri-apps/plugin-store';
  import { resolve, dirname } from '@tauri-apps/api/path';
  import { i18nState, t, detectSystemLanguage } from '$lib/i18n.svelte';
  import { check } from '@tauri-apps/plugin-updater';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { mdRender } from '@/core/markdown';
  import { tick, onMount } from 'svelte';
  import '@/style/index.less';

  onMount(() => {
    listen('sys-open-file', (event) => {
      const path = event.payload as string;
      if (path && typeof path === 'string') {
        let cleanPath = path;
        // Handle macOS file:// URLs if necessary
        if (cleanPath.startsWith('file://')) {
          cleanPath = decodeURIComponent(cleanPath.slice(7));
        }
        console.log("Received file from OS:", cleanPath);
        openSpecificFile(cleanPath);
      }
    });
  });

  let markdownHtml = $state('<div style="text-align: center; margin-top: 40vh; color: #888;">Double click anywhere or click the gear to open a markdown file.</div>');
  let filePath = $state('');
  
  let drawerOpen = $state(false);
  let showSidebar = $state(true);
  let currentTheme = $state('light');
  let appFont = $state('auto');
  let customFontInput = $state('');
  
  let sidebarTab = $state<'files' | 'toc'>('toc');
  let folderPath = $state('');
  let folderFiles = $state<{name: string, path: string, depth: number, isDir?: boolean}[]>([]);
  let collapsedFolders = $state(new Set<string>());

  let searchQuery = $state('');
  
  interface SearchResult {
    file_path: string;
    file_name: string;
    line_number: number;
    snippet: string;
  }
  
  let searchResults = $state<SearchResult[]>([]);
  let isSearching = $state(false);
  let searchTimer: any = null;

  $effect(() => {
    if (searchQuery.trim() === '') {
       searchResults = [];
       isSearching = false;
       return;
    }
    
    if (searchTimer) clearTimeout(searchTimer);
    isSearching = true;
    
    searchTimer = setTimeout(async () => {
       try {
         const res = await invoke('search_content', { path: folderPath, query: searchQuery.trim() });
         searchResults = res as SearchResult[];
       } catch(e) {
         console.error("Search failed:", e);
         searchResults = [];
       } finally {
         isSearching = false;
       }
    }, 300);
  });
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
    await store.set('appTheme', currentTheme);
    await store.set('appFont', appFont);
    await store.set('customFontInput', customFontInput);
    await store.save();
    console.log("[Store] Saved data:", {folderPath, filePath, maxDepth, sidebarWidth, locale: i18nState.locale, appTheme: currentTheme, appFont});
  }

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-md-reader-theme', currentTheme);
    }
  });

  $effect(() => {
    if (typeof document !== 'undefined') {
      if (appFont === 'auto') {
        document.body.style.removeProperty('--font-family-body');
      } else if (appFont === 'custom' && customFontInput.trim() !== '') {
        document.body.style.setProperty('--font-family-body', `"${customFontInput.trim()}", sans-serif`);
      } else {
        document.body.style.setProperty('--font-family-body', appFont);
      }
    }
  });

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

        const savedTheme = await store.get<{value?: string} | string>('appTheme');
        if (savedTheme) {
            currentTheme = typeof savedTheme === 'string' ? savedTheme : (savedTheme.value || 'light');
        }

        const savedFont = await store.get<{value?: string} | string>('appFont');
        if (savedFont) {
            appFont = typeof savedFont === 'string' ? savedFont : (savedFont.value || 'auto');
        }

        const savedCustomFont = await store.get<{value?: string} | string>('customFontInput');
        if (savedCustomFont) {
            customFontInput = typeof savedCustomFont === 'string' ? savedCustomFont : (savedCustomFont.value || '');
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
    
    // 1. Handle Code Copy
    const copyBtn = target.closest('.md-reader__btn--copy');
    if (copyBtn) {
      const codeBlock = copyBtn.previousElementSibling;
      if (codeBlock && codeBlock.tagName.toLowerCase() === 'code') {
        const textToCopy = codeBlock.textContent || '';
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy text: ', err);
        }
      }
      return;
    }

    // 2. Handle internal relative link clicks
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
        <div class="sidebar-search">
          <input type="text" bind:value={searchQuery} placeholder={t('sidebar.search_placeholder')} class="search-input" />
        </div>
        <ul style="margin:0; padding:0; list-style: none;">
          {#if searchQuery.trim() !== ''}
             {#if isSearching}
               <li class="sidebar-empty">Searching full text...</li>
             {:else if searchResults.length === 0}
               <li class="sidebar-empty">No matching text found.</li>
             {:else}
               {#each searchResults as res}
                 <!-- svelte-ignore a11y_click_events_have_key_events -->
                 <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                 <li class="search-item {filePath === res.file_path ? 'active-file' : ''}" onclick={(e) => { e.stopPropagation(); openSpecificFile(res.file_path); }}>
                   <div class="search-item__title">
                     <span>✦ {res.file_name}</span><span class="search-item__line">L{res.line_number}</span>
                   </div>
                   <div class="search-item__snippet">
                     {res.snippet}
                   </div>
                 </li>
               {/each}
             {/if}
          {:else}
             {#if visibleTreeFiles.length === 0}
                <li class="sidebar-empty">{t('sidebar.no_md_match')}</li>
             {:else}
                {#each visibleTreeFiles as f}
                  {#if f.isDir}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <li class="folder-item" style="padding-left: {16 + (f.depth - 1) * 12}px" onclick={() => toggleFolder(f.path)}>
                      <span class="folder-arrow">{collapsedFolders.has(f.path) ? '›' : '⌄'}</span>
                      <span class="file-icon">▣</span>
                      <span class="file-name" title={f.name}>{f.name}</span>
                    </li>
                  {:else}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <li class="file-item {filePath === f.path ? 'active-file' : ''}" style="padding-left: {26 + (f.depth - 1) * 12}px" onclick={(e) => { e.stopPropagation(); openSpecificFile(f.path); }}>
                      <span class="file-icon">📝</span>
                      <span class="file-name" title={f.name}>{f.name}</span>
                    </li>
                  {/if}
                {/each}
             {/if}
          {/if}
        </ul>
      {:else}
        <ul style="margin:0; padding:0;">
          {#if headers.length === 0}
            <li class="sidebar-empty">{t('sidebar.no_toc')}</li>
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
      <div class="welcome">
        <div class="welcome__orb welcome__orb--one"></div>
        <div class="welcome__orb welcome__orb--two"></div>
        <div class="welcome__mark"><span>✦</span></div>
        <p class="welcome__eyebrow">PYRUS / READING SPACE</p>
        <h2>{t('welcome.title')}</h2>
        <p class="welcome__subtitle">{t('welcome.subtitle')}</p>
        <div class="welcome__actions">
          <button class="welcome__primary" onclick={openFile}>{t('settings.open_file')}</button>
          <button class="welcome__secondary" onclick={openFolder}>{t('settings.open_folder')}</button>
        </div>
      </div>
    {:else}
      <div class="md-reader__markdown-content centered" onclick={handleMarkdownClick}>
        {@html markdownHtml}
      </div>
    {/if}
  </div>
</div>

<button class="md-reader__btn floating-gear" onclick={() => drawerOpen = !drawerOpen} aria-label={t('settings.title')}>
  <span>⚙</span>
</button>

{#if drawerOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" onclick={() => drawerOpen = false}></div>
<div class="drawer">
  <div class="drawer__heading"><p>PYRUS</p><h3>{t('settings.title')}</h3></div>
  <div class="drawer__actions">
    <button onclick={openFile} class="btn-primary">{t('settings.open_file')}</button>
    <button onclick={openFolder} class="btn-secondary">{t('settings.open_folder')}</button>
  </div>
  <hr/>
  
  <div style="display:flex; flex-direction:column; gap:5px; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
       <label>{t('settings.sys_language')}</label>
       <select bind:value={i18nState.locale} onchange={syncStore} style="padding:2px 4px; border-radius:4px; border:1px solid #ccc;">
         <option value="zh">中文</option>
         <option value="en">English</option>
       </select>
    </div>
  </div>

  <hr/>

  <div style="display:flex; flex-direction:column; gap:5px; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
       <label>{t('settings.appearance')}</label>
       <select bind:value={currentTheme} onchange={syncStore} style="padding:2px 4px; border-radius:4px; border:1px solid #ccc; max-width: 140px;">
         <option value="light">{t('theme.light')}</option>
         <option value="dark">{t('theme.dark')}</option>
         <option value="newsprint">✨ {t('theme.newsprint')}</option>
         <option value="terminal">✨ {t('theme.terminal')}</option>
         <option value="glass">✨ {t('theme.glass')}</option>
       </select>
    </div>
    <div style="display:flex; justify-content:space-between; margin-top: 5px;">
       <label>{t('settings.typography')}</label>
       <select bind:value={appFont} onchange={syncStore} style="padding:2px 4px; border-radius:4px; border:1px solid #ccc; max-width: 140px;">
         <option value="auto">{t('font.auto')}</option>
         <option value="'LXGW WenKai Lite', sans-serif">{t('font.lxgw')}</option>
         <option value="-apple-system, sans-serif">{t('font.system')}</option>
         <option value="Georgia, serif">{t('font.serif')}</option>
         <option value="'Fira Code', monospace">{t('font.mono')}</option>
         <option value="custom">{t('font.custom')}</option>
       </select>
    </div>
    {#if appFont === 'custom'}
    <div style="display:flex; justify-content:flex-end; margin-top: 5px;">
       <input type="text" bind:value={customFontInput} onchange={syncStore} placeholder={t('font.custom_placeholder')} style="padding:4px; border-radius:4px; border:1px solid #007acc; width: 100%; font-size: 12px; outline: none;" />
    </div>
    {/if}
  </div>

  <hr/>
  
  <button onclick={() => checkUpdate(true)} class="btn-secondary" disabled={isCheckingUpdate}>
    {isCheckingUpdate ? t('update.checking') : t('update.check_btn')}
  </button>

  <hr/>

  <div style="display:flex; flex-direction:column; gap:5px; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
       <label>{t('settings.scan_depth')}: <b>{maxDepth} {t('settings.layers')}</b></label>
       {#if folderPath}
         <button class="text-button" onclick={refreshFolder}>{t('settings.refresh')}</button>
       {/if}
    </div>
    <input type="range" bind:value={maxDepth} min="1" max="5" style="width:100%" onchange={refreshFolder} />
    <span style="font-size: 12px; color:#888;">{t('settings.depth_hint')}</span>
  </div>

  <hr/>
  <label><input type="checkbox" bind:checked={showSidebar} /> {t('settings.toggle_sidebar')}</label>
</div>
{/if}

<style>
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: min(360px, 100vw);
    height: 100vh;
    box-shadow: -18px 0 50px color-mix(in srgb, var(--color-text-primary) 14%, transparent);
    z-index: 90;
    padding: 36px 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    background: color-mix(in srgb, var(--color-side-bg) 92%, transparent);
    border-left: 1px solid var(--color-side-border);
    backdrop-filter: blur(28px) saturate(140%);
    -webkit-backdrop-filter: blur(28px) saturate(140%);
  }
  .drawer__heading p, .welcome__eyebrow {
    margin: 0 0 8px;
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .16em;
  }
  .drawer__heading h3 { margin: 0; color: var(--color-text-primary); font-size: 25px; letter-spacing: -.04em; }
  .drawer__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .drawer hr { width: 100%; margin: 2px 0; border: 0; border-top: 1px solid var(--color-side-border); }
  .drawer select, .drawer input[type='text'] {
    border: 1px solid var(--color-border) !important;
    border-radius: 8px !important;
    color: var(--color-text-primary);
    background: var(--color-bg) !important;
  }
  .drawer label { color: var(--color-text-secondary); }
  .btn-primary, .btn-secondary {
    min-height: 42px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
    transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
  }
  .btn-primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-white); }
  .btn-secondary { border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-primary); }
  .btn-primary:hover, .btn-secondary:hover { transform: translateY(-1px); box-shadow: 0 8px 18px color-mix(in srgb, var(--color-primary) 16%, transparent); }
  .text-button { border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font: inherit; font-size: 12px; padding: 0; }
  .drawer-overlay { position: fixed; inset: 0; z-index: 80; background: color-mix(in srgb, var(--color-text-primary) 4%, transparent); backdrop-filter: blur(2px); }
  
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
  
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .floating-gear { position: fixed; right: 28px; bottom: 28px; z-index: 100; display: grid; place-items: center; width: 46px; height: 46px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-side-bg); color: var(--color-text-primary); box-shadow: 0 12px 28px color-mix(in srgb, var(--color-text-primary) 12%, transparent); }
  .floating-gear span { font-size: 20px; transition: transform .35s ease; }
  .floating-gear:hover span { transform: rotate(55deg); }
  
  /* Sidebar Tabs */
  .sidebar-tabs {
    display: flex;
    margin: 0 14px;
    padding: 5px;
    border: 1px solid var(--color-side-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-bg) 60%, transparent);
  }
  .sidebar-tabs button {
    flex: 1;
    background: transparent;
    border: none;
    padding: 8px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-gray);
    cursor: pointer;
    border-radius: 8px;
    transition: all .2s;
  }
  .sidebar-tabs button.active {
    color: var(--color-primary);
    background: var(--color-primary-alpha-10);
  }
  .sidebar-tabs button:hover {
    color: var(--color-text-primary);
    background: color-mix(in srgb, var(--color-primary-alpha-10) 45%, transparent);
  }
  
  /* Sidebar Content lists */
  .search-input {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    outline: none;
    font-size: 12px;
    color: var(--color-text-primary);
    background: color-mix(in srgb, var(--color-bg) 72%, transparent);
  }
  .search-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-alpha-10); }
  .sidebar-search { padding: 18px 16px 12px; }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
  .file-item {
    margin: 2px 8px;
    padding: 9px 10px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-left: 2px solid transparent;
    border-radius: 8px;
    color: var(--color-text-secondary);
    transition: all 0.15s;
  }
  .file-item:hover {
    background: var(--color-primary-alpha-10);
  }
  .file-item.active-file {
    background: var(--color-primary-alpha-10);
    border-left-color: var(--color-primary);
    color: var(--color-primary);
    font-weight: 500;
  }
  .file-icon { font-size: 12px; }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .folder-item { display: flex; align-items: center; gap: 6px; padding-top: 10px; padding-bottom: 5px; color: var(--color-primary); font-size: 12px; font-weight: 700; cursor: pointer; user-select: none; }
  .folder-arrow { width: 10px; color: var(--color-text-gray); font-size: 16px; line-height: 1; }
  .sidebar-empty { padding: 18px 22px; color: var(--color-text-gray); font-size: 12px; }
  .search-item { padding: 12px 16px; border-bottom: 1px solid var(--color-side-border); cursor: pointer; transition: background .15s ease; }
  .search-item:hover { background: var(--color-primary-alpha-10); }
  .search-item__title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; color: var(--color-primary); font-size: 12px; font-weight: 700; }
  .search-item__line { color: var(--color-text-gray); font-size: 10px; font-weight: 500; }
  .search-item__snippet { color: var(--color-text-gray); font: 11px/1.5 var(--font-family-code); word-break: break-word; }
  .welcome { position: relative; isolation: isolate; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 32px; overflow: hidden; text-align: center; color: var(--color-text-primary); }
  .welcome__orb { position: absolute; z-index: -1; border-radius: 999px; filter: blur(4px); opacity: .8; }
  .welcome__orb--one { width: 360px; height: 360px; top: 9%; left: 11%; background: var(--color-primary-alpha-10); }
  .welcome__orb--two { width: 270px; height: 270px; right: 10%; bottom: 12%; background: var(--color-important-alpha-10); }
  .welcome__mark { display: grid; place-items: center; width: 72px; height: 72px; margin-bottom: 25px; border: 1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-border)); border-radius: 23px; color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-alpha-10) 70%, var(--color-bg)); box-shadow: 0 18px 40px color-mix(in srgb, var(--color-primary) 13%, transparent); transform: rotate(-8deg); }
  .welcome__mark span { font-size: 31px; transform: rotate(8deg); }
  .welcome h2 { max-width: 680px; margin: 0; color: var(--color-text-primary); font-size: clamp(30px, 5vw, 54px); letter-spacing: -.06em; line-height: 1.06; }
  .welcome__subtitle { max-width: 450px; margin: 16px 0 27px; color: var(--color-text-secondary); font-size: 14px; }
  .welcome__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .welcome__primary, .welcome__secondary { padding: 11px 16px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; transition: transform .18s ease, box-shadow .18s ease; }
  .welcome__primary { border: 1px solid var(--color-primary); color: var(--color-white); background: var(--color-primary); box-shadow: 0 10px 20px color-mix(in srgb, var(--color-primary) 22%, transparent); }
  .welcome__secondary { border: 1px solid var(--color-border); color: var(--color-text-primary); background: color-mix(in srgb, var(--color-bg) 80%, transparent); }
  .welcome__primary:hover, .welcome__secondary:hover { transform: translateY(-2px); }
  @media (max-width: 560px) { .welcome__actions { flex-direction: column; width: 100%; max-width: 300px; } .floating-gear { right: 18px; bottom: 18px; } }
</style>
