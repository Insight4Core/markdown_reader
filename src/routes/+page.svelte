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
    const unlistenPromise = listen('sys-open-file', (event) => {
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
    window.addEventListener('scroll', saveReadingProgress, { passive: true });
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openGlobalSearch();
      }
      if (event.key === 'Escape' && globalSearchOpen) closeGlobalSearch();
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => {
      window.removeEventListener('scroll', saveReadingProgress);
      window.removeEventListener('keydown', handleGlobalShortcut);
      unlistenPromise.then(unlisten => unlisten());
    };
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
  let recentFiles = $state<string[]>([]);
  let pinnedFiles = $state<string[]>([]);
  let readingProgress = $state<Record<string, { position: number; total: number; updatedAt: number }>>({});
  let progressSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingScrollPosition: number | null = null;
  let pendingSearchTerm = '';

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
  let globalSearchOpen = $state(false);
  let globalSearchQuery = $state('');
  let globalSearchResults = $state<SearchResult[]>([]);
  let isGlobalSearching = $state(false);
  let globalSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let globalSearchInput: HTMLInputElement;
  let toastMessage = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

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

  $effect(() => {
    if (!globalSearchOpen || globalSearchQuery.trim() === '' || !folderPath) {
      globalSearchResults = [];
      isGlobalSearching = false;
      return;
    }
    if (globalSearchTimer) clearTimeout(globalSearchTimer);
    isGlobalSearching = true;
    globalSearchTimer = setTimeout(async () => {
      try {
        globalSearchResults = await invoke('search_content', { path: folderPath, query: globalSearchQuery.trim() }) as SearchResult[];
      } catch (error) {
        console.error('Global search failed:', error);
        globalSearchResults = [];
      } finally {
        isGlobalSearching = false;
      }
    }, 180);
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
  let markdownFiles = $derived(folderFiles.filter(file => !file.isDir));
  let workspaceName = $derived(folderPath.split(/[/\\]/).filter(Boolean).pop() || 'Pyrus');
  let recentDocuments = $derived(recentFiles.map(path => markdownFiles.find(file => file.path === path)).filter(Boolean));
  let pinnedDocuments = $derived(pinnedFiles.map(path => markdownFiles.find(file => file.path === path)).filter(Boolean));
  let continueDocuments = $derived(
    Object.entries(readingProgress)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([path]) => markdownFiles.find(file => file.path === path))
      .filter(Boolean)
      .slice(0, 5)
  );
  
  let headers = $state<{id: string, text: string, level: number}[]>([]);
  let activeHeaderId = $state('');
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
    await store.set('recentFiles', recentFiles);
    await store.set('pinnedFiles', pinnedFiles);
    await store.set('readingProgress', readingProgress);
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

        const savedRecent = await store.get<string[]>('recentFiles');
        if (Array.isArray(savedRecent)) recentFiles = savedRecent;
        const savedPinned = await store.get<string[]>('pinnedFiles');
        if (Array.isArray(savedPinned)) pinnedFiles = savedPinned;
        const savedProgress = await store.get<Record<string, { position: number; total: number; updatedAt: number }>>('readingProgress');
        if (savedProgress && typeof savedProgress === 'object') readingProgress = savedProgress;

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
              activeHeaderId = headers[0]?.id || '';
              requestAnimationFrame(updateActiveHeader);
           }
           if (pendingSearchTerm) {
             scrollToSearchMatch(pendingSearchTerm);
             pendingSearchTerm = '';
           } else if (pendingScrollPosition !== null) {
             const position = pendingScrollPosition;
             pendingScrollPosition = null;
             requestAnimationFrame(() => window.scrollTo({ top: position, behavior: 'auto' }));
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
      activeHeaderId = '';
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
    recentFiles = [path, ...recentFiles.filter(item => item !== path)].slice(0, 8);
    pendingScrollPosition = readingProgress[path]?.position ?? 0;
    await loadContent();
    
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

  function togglePin(path: string) {
    const wasPinned = pinnedFiles.includes(path);
    pinnedFiles = wasPinned
      ? pinnedFiles.filter(item => item !== path)
      : [path, ...pinnedFiles];
    toastMessage = wasPinned ? t('workspace.unpinned_toast') : t('workspace.pinned_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
  }

  function saveReadingProgress() {
    if (!filePath) return;
    updateActiveHeader();
    readingProgress = {
      ...readingProgress,
      [filePath]: { position: Math.round(window.scrollY), total: Math.max(document.documentElement.scrollHeight - window.innerHeight, 1), updatedAt: Date.now() }
    };
    if (progressSaveTimer) clearTimeout(progressSaveTimer);
    progressSaveTimer = setTimeout(() => syncStore(), 700);
  }

  function openSearchResult(result: SearchResult, term = searchQuery) {
    pendingSearchTerm = term.trim();
    openSpecificFile(result.file_path);
  }

  function openGlobalSearch() {
    if (!folderPath) {
      drawerOpen = true;
      return;
    }
    globalSearchOpen = true;
    tick().then(() => globalSearchInput?.focus());
  }

  function closeGlobalSearch() {
    globalSearchOpen = false;
    globalSearchQuery = '';
    globalSearchResults = [];
  }

  function updateActiveHeader() {
    if (!filePath || headers.length === 0) return;
    const headingElements = headers
      .map(header => document.getElementById(header.id))
      .filter((heading): heading is HTMLElement => Boolean(heading));
    if (headingElements.length === 0) return;

    let activeHeading = headingElements[0];
    for (const heading of headingElements) {
      if (heading.getBoundingClientRect().top <= 150) activeHeading = heading;
      else break;
    }
    activeHeaderId = activeHeading.id;
  }

  function scrollToSearchMatch(term: string) {
    const article = document.querySelector('.md-reader__markdown-content');
    if (!article || !term) return;
    const target = Array.from(article.querySelectorAll('p, li, blockquote, pre, td, h1, h2, h3, h4, h5, h6'))
      .find(element => element.textContent?.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    if (!target) return;
    highlightSearchMatch(target, term);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function highlightSearchMatch(container: Element, term: string) {
    document.querySelectorAll('mark.search-highlight').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const normalizedTerm = term.toLocaleLowerCase();
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const source = node.textContent || '';
      const index = source.toLocaleLowerCase().indexOf(normalizedTerm);
      if (index === -1) continue;
      const fragment = document.createDocumentFragment();
      fragment.append(source.slice(0, index));
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = source.slice(index, index + term.length);
      fragment.append(mark, source.slice(index + term.length));
      node.replaceWith(fragment);
      window.setTimeout(() => mark.classList.add('search-highlight--soft'), 2400);
      window.setTimeout(() => mark.replaceWith(document.createTextNode(mark.textContent || '')), 4200);
      break;
    }
  }

  function progressPercent(path: string) {
    const progress = readingProgress[path];
    if (!progress) return 0;
    return Math.min(100, Math.round((progress.position / Math.max(progress.total || 1, 1)) * 100));
  }

  function formatLastRead(path: string) {
    const updatedAt = readingProgress[path]?.updatedAt;
    if (!updatedAt) return '';
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60000));
    if (elapsedMinutes < 1) return t('workspace.just_now');
    if (elapsedMinutes < 60) return `${elapsedMinutes}${t('workspace.minutes_ago')}`;
    if (elapsedMinutes < 1440) return `${Math.floor(elapsedMinutes / 60)}${t('workspace.hours_ago')}`;
    return `${Math.floor(elapsedMinutes / 1440)}${t('workspace.days_ago')}`;
  }

  function openWorkspaceHome() {
    if (!folderPath) return;
    filePath = '';
    markdownHtml = '';
    headers = [];
    activeHeaderId = '';
    sidebarTab = 'files';
    getCurrentWindow().setTitle(workspaceName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    syncStore();
  }

  function closeWorkspace() {
    if (unwatch) {
      unwatch();
      unwatch = null;
    }
    folderPath = '';
    filePath = '';
    folderFiles = [];
    headers = [];
    activeHeaderId = '';
    markdownHtml = '';
    drawerOpen = false;
    getCurrentWindow().setTitle('Pyrus');
    window.scrollTo({ top: 0, behavior: 'auto' });
    syncStore();
  }

  function scrollTo(id: string) {
    activeHeaderId = id;
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
    {#if folderPath}
      <button class="workspace-nav" onclick={openWorkspaceHome} aria-label={t('workspace.home')}>
        <span class="workspace-nav__mark">✦</span>
        <span><small>PYRUS</small><strong>{workspaceName}</strong></span>
        <span class="workspace-nav__arrow">↗</span>
      </button>
    {:else}
      <button class="workspace-nav workspace-nav--app" onclick={openFolder} aria-label={t('workspace.open_folder')}>
        <span class="workspace-nav__mark">✦</span>
        <span><small>PYRUS</small><strong>Reading space</strong></span>
        <span class="workspace-nav__arrow">+</span>
      </button>
    {/if}
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
                 <li class="search-item {filePath === res.file_path ? 'active-file' : ''}" onclick={(e) => { e.stopPropagation(); openSearchResult(res); }}>
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
                      <span class="file-icon file-icon--folder"></span>
                      <span class="file-name" title={f.name}>{f.name}</span>
                    </li>
                  {:else}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <li class="file-item {filePath === f.path ? 'active-file' : ''}" style="padding-left: {26 + (f.depth - 1) * 12}px" onclick={(e) => { e.stopPropagation(); openSpecificFile(f.path); }}>
                      <span class="file-icon file-icon--document"></span>
                      <span class="file-name" title={f.name}>{f.name}</span>
                      <button class:visible={pinnedFiles.includes(f.path)} class="pin-button" aria-label={pinnedFiles.includes(f.path) ? t('workspace.unpin') : t('workspace.pin')} onclick={(e) => { e.stopPropagation(); togglePin(f.path); }}>✦</button>
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
              <li class="md-reader__side-h{h.level}" class:toc-active={activeHeaderId === h.id}>
                <a href="#{h.id}" aria-current={activeHeaderId === h.id ? 'location' : undefined} onclick={(e) => { e.preventDefault(); scrollTo(h.id); }}>
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
      <div class:workspace-home={Boolean(folderPath)} class="welcome">
        <div class="welcome__orb welcome__orb--one"></div>
        <div class="welcome__orb welcome__orb--two"></div>
        <div class="welcome__mark"><span>✦</span></div>
        {#if folderPath}
          <p class="welcome__eyebrow">{t('workspace.eyebrow')}</p>
          <h2>{workspaceName}</h2>
          <p class="welcome__subtitle">{markdownFiles.length} {t('workspace.documents')} · {folderPath}</p>
          <div class="workspace-grid">
            <section class="workspace-card workspace-card--continue">
              <div class="workspace-card__heading"><span>↳</span><h3>{t('workspace.continue')}</h3></div>
              {#if continueDocuments.length}
                <div class="document-list">
                  {#each continueDocuments as doc}
                    <button onclick={() => openSpecificFile(doc.path)}><span>{doc.name}</span><small>{t('workspace.last_read')}{formatLastRead(doc.path)} · {progressPercent(doc.path)}%</small><i class="document-list__progress"><i style="width: {progressPercent(doc.path)}%"></i></i></button>
                  {/each}
                </div>
              {:else}<p class="workspace-card__empty">{t('workspace.empty_continue')}</p>{/if}
            </section>
            <section class="workspace-card workspace-card--pinned">
              <div class="workspace-card__heading"><span>✦</span><h3>{t('workspace.pinned')}</h3></div>
              {#if pinnedDocuments.length}
                <div class="document-list">
                  {#each pinnedDocuments as doc}
                    <button onclick={() => openSpecificFile(doc.path)}><span>{doc.name}</span><small>{doc.path.replace(folderPath, '').replace(/^\//, '')}</small></button>
                  {/each}
                </div>
              {:else}<p class="workspace-card__empty">{t('workspace.empty_pinned')}</p>{/if}
            </section>
            <section class="workspace-card workspace-card--recent">
              <div class="workspace-card__heading"><span>↗</span><h3>{t('workspace.recent')}</h3></div>
              {#if recentDocuments.length}
                <div class="document-list">
                  {#each recentDocuments as doc}
                    <button onclick={() => openSpecificFile(doc.path)}><span>{doc.name}</span><small>{doc.path.replace(folderPath, '').replace(/^\//, '')}</small></button>
                  {/each}
                </div>
              {:else}<p class="workspace-card__empty">{t('workspace.empty_recent')}</p>{/if}
            </section>
          </div>
          <button class="workspace-change" onclick={openFolder}>{t('workspace.change_folder')}</button>
        {:else}
          <p class="welcome__eyebrow">PYRUS / READING SPACE</p>
          <h2>{t('welcome.title')}</h2>
          <p class="welcome__subtitle">{t('welcome.subtitle')}</p>
          <div class="welcome__actions">
            <button class="welcome__primary" onclick={openFile}>{t('settings.open_file')}</button>
            <button class="welcome__secondary" onclick={openFolder}>{t('workspace.open_folder')}</button>
          </div>
          <section class="onboarding" aria-label={t('onboarding.label')}>
            <p class="onboarding__label">{t('onboarding.label')}</p>
            <div class="onboarding__steps">
              <article class="onboarding__step"><span>01</span><div><h3>{t('onboarding.step_one_title')}</h3><p>{t('onboarding.step_one_text')}</p></div></article>
              <article class="onboarding__step"><span>02</span><div><h3>{t('onboarding.step_two_title')}</h3><p>{t('onboarding.step_two_text')}</p></div></article>
              <article class="onboarding__step"><span>03</span><div><h3>{t('onboarding.step_three_title')}</h3><p>{t('onboarding.step_three_text')}</p></div></article>
            </div>
          </section>
        {/if}
      </div>
    {:else}
      {#if folderPath}
        <div class="reading-context"><button class="reading-context__home" onclick={openWorkspaceHome}>⌂ {workspaceName}</button><span>/</span><span>{filePath.replace(folderPath, '').replace(/^\//, '')}</span><button onclick={() => togglePin(filePath)} class:active={pinnedFiles.includes(filePath)}>{pinnedFiles.includes(filePath) ? '✦ ' + t('workspace.unpin') : '✧ ' + t('workspace.pin')}</button></div>
      {/if}
      {#key filePath}
        <div class="md-reader__markdown-content centered" onclick={handleMarkdownClick}>
          {@html markdownHtml}
        </div>
      {/key}
    {/if}
  </div>
</div>

{#if filePath}
  <div class="reading-progress" style="--progress: {progressPercent(filePath)}%" aria-hidden="true"></div>
{/if}

{#if toastMessage}
  <div class="app-toast" role="status"><span>✦</span>{toastMessage}</div>
{/if}

<button class="md-reader__btn floating-gear" onclick={() => drawerOpen = !drawerOpen} aria-label={t('settings.title')}>
  <span>⚙</span>
</button>

{#if globalSearchOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="command-overlay" onclick={closeGlobalSearch}></div>
  <section class="command-palette" aria-label={t('search.title')} role="dialog" aria-modal="true">
    <div class="command-palette__input"><span>⌕</span><input bind:this={globalSearchInput} bind:value={globalSearchQuery} placeholder={t('search.hint')} /><kbd>ESC</kbd></div>
    <div class="command-palette__results">
      {#if globalSearchQuery.trim() === ''}
        <p class="command-palette__empty">{t('search.open_hint')}</p>
      {:else if isGlobalSearching}
        <p class="command-palette__empty">Searching…</p>
      {:else if globalSearchResults.length === 0}
        <p class="command-palette__empty">{t('search.empty')}</p>
      {:else}
        {#each globalSearchResults as result}
          <button class="command-result" onclick={() => { openSearchResult(result, globalSearchQuery); closeGlobalSearch(); }}>
            <span class="command-result__icon">✦</span><span class="command-result__body"><strong>{result.file_name}</strong><small>{result.snippet}</small></span><span class="command-result__line">L{result.line_number}</span>
          </button>
        {/each}
      {/if}
    </div>
  </section>
{/if}

{#if drawerOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" onclick={() => drawerOpen = false}></div>
<div class="drawer">
  <div class="drawer__top">
    <div class="drawer__heading"><p>PYRUS / PERSONAL SPACE</p><h3>{t('settings.title')}</h3></div>
    <button class="drawer__close" onclick={() => drawerOpen = false} aria-label={t('settings.close')}>×</button>
  </div>
  <div class="drawer__actions">
    <button onclick={openFile} class="btn-primary">{t('settings.open_file')}</button>
    <button onclick={openFolder} class="btn-secondary">{t('settings.open_folder')}</button>
  </div>

  <div class="settings-section">
    <p class="settings-section__title">{t('settings.interface')}</p>
    <div class="setting-row">
       <label for="settings-language">{t('settings.sys_language')}</label>
       <select id="settings-language" bind:value={i18nState.locale} onchange={syncStore}>
         <option value="zh">中文</option>
         <option value="en">English</option>
       </select>
    </div>
    <div class="setting-row">
       <label for="settings-theme">{t('settings.appearance')}</label>
       <select id="settings-theme" bind:value={currentTheme} onchange={syncStore}>
         <option value="light">{t('theme.light')}</option>
         <option value="dark">{t('theme.dark')}</option>
         <option value="newsprint">✨ {t('theme.newsprint')}</option>
         <option value="terminal">✨ {t('theme.terminal')}</option>
         <option value="glass">✨ {t('theme.glass')}</option>
       </select>
    </div>
  </div>

  <div class="settings-section">
    <p class="settings-section__title">{t('settings.reading')}</p>
    <div class="setting-row">
       <label for="settings-font">{t('settings.typography')}</label>
       <select id="settings-font" bind:value={appFont} onchange={syncStore}>
         <option value="auto">{t('font.auto')}</option>
         <option value="'LXGW WenKai Lite', sans-serif">{t('font.lxgw')}</option>
         <option value="-apple-system, sans-serif">{t('font.system')}</option>
         <option value="Georgia, serif">{t('font.serif')}</option>
         <option value="'Fira Code', monospace">{t('font.mono')}</option>
         <option value="custom">{t('font.custom')}</option>
       </select>
    </div>
    {#if appFont === 'custom'}
    <div class="setting-input">
       <input type="text" bind:value={customFontInput} onchange={syncStore} placeholder={t('font.custom_placeholder')} />
    </div>
    {/if}
    <label class="setting-switch"><span>{t('settings.toggle_sidebar')}</span><input type="checkbox" bind:checked={showSidebar} onchange={syncStore} /><i></i></label>
  </div>

  <div class="settings-section">
    <p class="settings-section__title">{t('settings.workspace')}</p>
    {#if folderPath}
      <button class="workspace-close-button" onclick={closeWorkspace}>{t('settings.close_workspace')}<span>×</span></button>
    {/if}
    <div class="setting-row setting-row--top">
       <label for="settings-depth">{t('settings.scan_depth')}<small>{maxDepth} {t('settings.layers')}</small></label>
       {#if folderPath}
         <button class="text-button" onclick={refreshFolder}>{t('settings.refresh')}</button>
       {/if}
    </div>
    <input id="settings-depth" class="setting-range" type="range" bind:value={maxDepth} min="1" max="5" onchange={refreshFolder} />
    <span class="setting-hint">{t('settings.depth_hint')}</span>
  </div>

  <div class="settings-footer">
    <span>{t('settings.software')}</span>
    <button onclick={() => checkUpdate(true)} class="text-button" disabled={isCheckingUpdate}>{isCheckingUpdate ? t('update.checking') : t('update.check_btn')}</button>
  </div>
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
    padding: 30px 24px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
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
  .drawer__top { display: flex; align-items: flex-start; justify-content: space-between; }
  .drawer__close { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--color-border); border-radius: 10px; color: var(--color-text-secondary); background: color-mix(in srgb, var(--color-bg) 72%, transparent); cursor: pointer; font-size: 24px; line-height: 1; transition: color .18s ease, background .18s ease; }
  .drawer__close:hover { color: var(--color-primary); background: var(--color-primary-alpha-10); }
  .drawer__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .settings-section { display: grid; gap: 2px; padding: 14px; border: 1px solid var(--color-side-border); border-radius: 14px; background: color-mix(in srgb, var(--color-bg) 48%, transparent); }
  .settings-section__title { margin: 0 0 6px; color: var(--color-text-gray); font-size: 10px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 39px; }
  .setting-row label { display: flex; flex-direction: column; gap: 2px; color: var(--color-text-secondary); font-size: 12px; }
  .setting-row label small { color: var(--color-primary); font-size: 10px; font-weight: 700; }
  .setting-row--top { align-items: flex-start; }
  .drawer select, .drawer input[type='text'] {
    max-width: 165px;
    min-height: 30px;
    padding: 4px 26px 4px 9px !important;
    border: 1px solid var(--color-border) !important;
    border-radius: 8px !important;
    color: var(--color-text-primary);
    background: var(--color-bg) !important;
  }
  .setting-input { margin-top: 6px; }
  .setting-input input { width: 100%; max-width: none !important; }
  .setting-range { width: 100%; margin: 7px 0 2px; accent-color: var(--color-primary); cursor: pointer; }
  .setting-hint { color: var(--color-text-gray); font-size: 10px; line-height: 1.5; }
  .workspace-close-button { display: flex; align-items: center; justify-content: space-between; width: 100%; margin: 2px 0 6px; padding: 8px 9px; border: 1px solid transparent; border-radius: 8px; color: var(--color-text-secondary); background: transparent; cursor: pointer; font-size: 11px; text-align: left; transition: color .18s ease, background .18s ease; }
  .workspace-close-button span { font-size: 16px; line-height: .8; }
  .workspace-close-button:hover { color: var(--color-danger); background: var(--color-danger-alpha-10); }
  .setting-switch { display: flex; align-items: center; justify-content: space-between; min-height: 39px; color: var(--color-text-secondary); font-size: 12px; cursor: pointer; }
  .setting-switch input { position: absolute; opacity: 0; pointer-events: none; }
  .setting-switch i { position: relative; width: 34px; height: 20px; border-radius: 999px; background: var(--color-disabled); transition: background .2s ease; }
  .setting-switch i::after { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--color-white); content: ''; box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text-primary) 18%, transparent); transition: transform .2s ease; }
  .setting-switch input:checked + i { background: var(--color-primary); }
  .setting-switch input:checked + i::after { transform: translateX(14px); }
  .settings-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding: 8px 3px 0; color: var(--color-text-gray); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .settings-footer .text-button { letter-spacing: normal; text-transform: none; }
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
  .command-overlay { position: fixed; inset: 0; z-index: 120; background: color-mix(in srgb, var(--color-text-primary) 16%, transparent); backdrop-filter: blur(7px); }
  .command-palette { position: fixed; top: min(18vh, 160px); left: 50%; z-index: 121; width: min(620px, calc(100vw - 32px)); overflow: hidden; border: 1px solid var(--color-border); border-radius: 18px; background: color-mix(in srgb, var(--color-side-bg) 94%, transparent); box-shadow: 0 24px 70px color-mix(in srgb, var(--color-text-primary) 25%, transparent); transform: translateX(-50%); backdrop-filter: blur(30px) saturate(150%); -webkit-backdrop-filter: blur(30px) saturate(150%); animation: paletteIn .2s cubic-bezier(.2,.8,.2,1); }
  .command-palette__input { display: flex; align-items: center; gap: 12px; padding: 15px 16px; border-bottom: 1px solid var(--color-border); color: var(--color-primary); }
  .command-palette__input > span { font-size: 25px; line-height: 1; }
  .command-palette__input input { width: 100%; min-width: 0; border: 0; outline: 0; color: var(--color-text-primary); background: transparent; font: 500 15px var(--font-family-body); }
  .command-palette__input input::placeholder { color: var(--color-text-gray); }
  .command-palette__input kbd { padding: 3px 6px; border: 1px solid var(--color-border); border-radius: 5px; color: var(--color-text-gray); background: var(--color-bg); font-size: 9px; }
  .command-palette__results { max-height: min(48vh, 420px); overflow-y: auto; padding: 7px; }
  .command-palette__empty { margin: 0; padding: 24px 13px; color: var(--color-text-gray); font-size: 12px; text-align: center; }
  .command-result { display: flex; align-items: flex-start; width: 100%; gap: 10px; padding: 10px; border: 0; border-radius: 10px; color: var(--color-text-primary); background: transparent; cursor: pointer; text-align: left; transition: background .15s ease; }
  .command-result:hover { background: var(--color-primary-alpha-10); }
  .command-result__icon { display: grid; place-items: center; width: 24px; height: 24px; flex: none; border-radius: 7px; color: var(--color-primary); background: var(--color-primary-alpha-10); }
  .command-result__body { display: grid; min-width: 0; gap: 3px; }
  .command-result__body strong, .command-result__body small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .command-result__body strong { font-size: 12px; }
  .command-result__body small { color: var(--color-text-gray); font: 11px var(--font-family-code); }
  .command-result__line { margin-left: auto; padding-top: 3px; color: var(--color-text-gray); font-size: 10px; }
  @keyframes paletteIn { from { opacity: 0; transform: translate(-50%, -8px) scale(.98); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
  
  /* Sidebar Tabs */
  .sidebar-tabs {
    display: flex;
    margin: 0 14px;
    padding: 5px;
    border: 1px solid var(--color-side-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-bg) 60%, transparent);
  }
  .workspace-nav { display: flex; align-items: center; width: calc(100% - 28px); gap: 9px; margin: 0 14px 14px; padding: 9px 8px; border: 0; border-radius: 12px; color: var(--color-text-primary); background: transparent; cursor: pointer; text-align: left; transition: background .18s ease; }
  .workspace-nav:hover { background: var(--color-primary-alpha-10); }
  .workspace-nav--app { margin-bottom: 20px; }
  .workspace-nav__mark { display: grid; place-items: center; width: 27px; height: 27px; flex: none; border-radius: 9px; color: var(--color-primary); background: var(--color-primary-alpha-10); }
  .workspace-nav span:nth-child(2) { display: grid; min-width: 0; gap: 1px; }
  .workspace-nav small { color: var(--color-text-gray); font-size: 8px; font-weight: 700; letter-spacing: .12em; }
  .workspace-nav strong { overflow: hidden; color: var(--color-text-primary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-nav__arrow { margin-left: auto; color: var(--color-text-gray); font-size: 14px; }
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
  .file-icon--document { position: relative; width: 13px; height: 15px; flex: none; border: 1px solid currentColor; border-radius: 3px; color: var(--color-text-gray); opacity: .8; }
  .file-icon--document::after { position: absolute; right: 2px; bottom: 3px; left: 2px; height: 1px; background: currentColor; content: ''; box-shadow: 0 -3px 0 currentColor; }
  .file-icon--folder { position: relative; width: 14px; height: 10px; flex: none; margin-top: 1px; border: 1px solid currentColor; border-radius: 2px 3px 3px 3px; color: var(--color-primary); opacity: .8; }
  .file-icon--folder::before { position: absolute; top: -4px; left: 1px; width: 6px; height: 3px; border-radius: 2px 2px 0 0; background: currentColor; content: ''; }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .pin-button { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; color: var(--color-text-gray); background: transparent; cursor: pointer; opacity: 0; }
  .file-item:hover .pin-button, .pin-button.visible { opacity: 1; }
  .pin-button:hover, .pin-button.visible { color: var(--color-primary); background: var(--color-primary-alpha-10); }
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
  .welcome h2 { max-width: 680px; margin: 0; color: var(--color-text-primary); font-size: clamp(30px, 5vw, 54px); font-weight: 650; letter-spacing: -.06em; line-height: 1.06; text-wrap: balance; }
  .welcome__subtitle { max-width: 450px; margin: 16px 0 27px; color: var(--color-text-secondary); font-size: 14px; }
  .welcome__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .welcome__primary, .welcome__secondary { padding: 11px 16px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; transition: transform .18s ease, box-shadow .18s ease; }
  .welcome__primary { border: 1px solid var(--color-primary); color: var(--color-white); background: var(--color-primary); box-shadow: 0 10px 20px color-mix(in srgb, var(--color-primary) 22%, transparent); }
  .welcome__secondary { border: 1px solid var(--color-border); color: var(--color-text-primary); background: color-mix(in srgb, var(--color-bg) 80%, transparent); }
  .welcome__primary:hover, .welcome__secondary:hover { transform: translateY(-2px); }
  .onboarding { width: min(760px, 100%); margin-top: 58px; text-align: left; }
  .onboarding__label { margin: 0 0 11px; color: var(--color-text-gray); font-size: 10px; font-weight: 750; letter-spacing: .14em; }
  .onboarding__steps { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--color-border); border-radius: 16px; background: color-mix(in srgb, var(--color-bg) 54%, transparent); box-shadow: 0 18px 45px color-mix(in srgb, var(--color-text-primary) 5%, transparent); overflow: hidden; }
  .onboarding__step { display: grid; grid-template-columns: auto 1fr; gap: 10px; min-height: 122px; padding: 18px; }
  .onboarding__step + .onboarding__step { border-left: 1px solid var(--color-border); }
  .onboarding__step > span { color: var(--color-primary); font-size: 10px; font-weight: 750; letter-spacing: .08em; }
  .onboarding__step h3 { margin: 0 0 6px; color: var(--color-text-primary); font-size: 12px; line-height: 1.35; }
  .onboarding__step p { margin: 0; color: var(--color-text-gray); font-size: 11px; line-height: 1.55; }
  .workspace-home { justify-content: flex-start; align-items: flex-start; padding: clamp(56px, 10vh, 112px) clamp(28px, 7vw, 90px); text-align: left; }
  .workspace-home .welcome__mark { width: 56px; height: 56px; margin-bottom: 19px; border-radius: 18px; }
  .workspace-home .welcome__mark span { font-size: 24px; }
  .workspace-home .welcome__subtitle { max-width: 620px; margin: 12px 0 34px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(800px, 100%); gap: 14px; }
  .workspace-card { min-height: 190px; padding: 20px; border: 1px solid var(--color-border); border-radius: 16px; background: color-mix(in srgb, var(--color-bg) 82%, transparent); box-shadow: 0 16px 38px color-mix(in srgb, var(--color-text-primary) 5%, transparent); }
  .workspace-card--pinned { border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border)); }
  .workspace-card--continue { grid-column: span 2; border-color: color-mix(in srgb, var(--color-primary) 48%, var(--color-border)); background: color-mix(in srgb, var(--color-primary-alpha-10) 38%, var(--color-bg)); }
  .workspace-card--continue .workspace-card__heading h3 { font-size: 16px; }
  .workspace-card--continue .document-list button { padding: 11px 9px; }
  .workspace-card--continue .document-list button span { font-size: 13px; }
  .workspace-card--recent { background: color-mix(in srgb, var(--color-bg) 34%, transparent); }
  .workspace-card__heading { display: flex; align-items: center; gap: 8px; color: var(--color-primary); }
  .workspace-card__heading h3 { margin: 0; color: var(--color-text-primary); font-size: 14px; }
  .workspace-card__empty { max-width: 230px; margin: 28px 0 0; color: var(--color-text-gray); font-size: 12px; line-height: 1.6; }
  .document-list { display: grid; gap: 3px; margin-top: 15px; }
  .document-list button { display: grid; gap: 3px; padding: 8px 7px; border: 0; border-radius: 8px; color: var(--color-text-primary); background: transparent; cursor: pointer; text-align: left; }
  .document-list button:hover { background: var(--color-primary-alpha-10); }
  .document-list button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .document-list button small { overflow: hidden; color: var(--color-text-gray); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .document-list__progress { display: block; width: 100%; height: 3px; margin-top: 2px; overflow: hidden; border-radius: 99px; background: color-mix(in srgb, var(--color-primary) 12%, var(--color-border)); }
  .document-list__progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width .3s ease; }
  .workspace-change { margin-top: 22px; padding: 0; border: 0; color: var(--color-primary); background: transparent; cursor: pointer; font-size: 12px; font-weight: 600; }
  .reading-context { display: flex; align-items: center; gap: 7px; max-width: 900px; margin: 22px auto -10px; padding: 7px 10px; color: var(--color-text-gray); border: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--color-bg) 48%, transparent); box-shadow: 0 6px 18px color-mix(in srgb, var(--color-text-primary) 3%, transparent); font-size: 11px; }
  .reading-context span:nth-child(3) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reading-context button { padding: 5px 8px; border: 1px solid transparent; border-radius: 7px; color: var(--color-text-gray); background: transparent; cursor: pointer; font-size: 11px; white-space: nowrap; }
  .reading-context > button:last-child { margin-left: auto; }
  .reading-context button:hover, .reading-context button.active { border-color: var(--color-border); color: var(--color-primary); background: var(--color-primary-alpha-10); }
  .reading-context__home { margin-left: -8px; color: var(--color-text-secondary) !important; font-weight: 650; }
  .reading-progress { position: fixed; top: 0; left: var(--side-width, 0); z-index: 110; width: var(--progress); height: 2px; background: var(--color-primary); box-shadow: 0 0 12px color-mix(in srgb, var(--color-primary) 65%, transparent); transition: width .18s linear; }
  .app-toast { position: fixed; bottom: 28px; left: 50%; z-index: 140; display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); border-radius: 11px; color: var(--color-text-primary); background: color-mix(in srgb, var(--color-side-bg) 95%, transparent); box-shadow: 0 14px 32px color-mix(in srgb, var(--color-text-primary) 18%, transparent); font-size: 12px; transform: translateX(-50%); animation: toastIn .25s cubic-bezier(.2,.8,.2,1); backdrop-filter: blur(18px); }
  .app-toast span { color: var(--color-primary); }
  :global(mark.search-highlight) { border-radius: 3px; color: inherit; background: var(--color-mark); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-mark) 55%, transparent); transition: background .7s ease, box-shadow .7s ease; }
  :global(mark.search-highlight--soft) { background: color-mix(in srgb, var(--color-mark) 28%, transparent); box-shadow: none; }
  @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px) scale(.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
  @media (max-width: 760px) { .workspace-grid { grid-template-columns: 1fr; max-width: 520px; } .workspace-card--continue { grid-column: span 1; } .reading-context { padding: 0 28px; } .onboarding__steps { grid-template-columns: 1fr; } .onboarding__step + .onboarding__step { border-top: 1px solid var(--color-border); border-left: 0; } }
  @media (max-width: 560px) { .welcome__actions { flex-direction: column; width: 100%; max-width: 300px; } .workspace-home { padding: 60px 28px; } .workspace-home .welcome__subtitle { max-width: 100%; } .floating-gear { right: 18px; bottom: 18px; } }
</style>
