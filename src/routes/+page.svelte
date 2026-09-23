<script lang="ts">
  import { open, ask } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile, mkdir, exists, watch, readDir } from '@tauri-apps/plugin-fs';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { load } from '@tauri-apps/plugin-store';
  import { resolve, dirname, join } from '@tauri-apps/api/path';
  import { i18nState, t, detectSystemLanguage } from '$lib/i18n.svelte';
  import { check } from '@tauri-apps/plugin-updater';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { mdRender } from '@/core/markdown';
  import { tick, onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import '@/style/index.less';

  onMount(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => reducedMotion = motionPreference.matches;
    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);
    let unlistenPromise: ReturnType<typeof listen> | null = null;
    let echoResizeObserver: ResizeObserver | null = null;
    const dayRefreshTimer = window.setInterval(() => currentDayKey = localDayKey(), 60000);
    if ('__TAURI_INTERNALS__' in window) {
      unlistenPromise = listen('sys-open-file', (event) => {
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
    }
    window.addEventListener('scroll', saveReadingProgress, { passive: true });
    document.addEventListener('click', handleMarkdownClick);
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (!editing && !drawerOpen && !globalSearchOpen && !newWorkspaceOpen) {
        if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          void navigateReadingHistory(event.key === 'ArrowLeft' ? -1 : 1);
        }
        if ((event.metaKey || event.ctrlKey) && event.code === 'Backslash') {
          event.preventDefault();
          toggleSidebar();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openGlobalSearch();
      }
      if (event.key === 'Escape' && globalSearchOpen) closeGlobalSearch();
      else if (event.key === 'Escape' && drawerOpen) drawerOpen = false;
      else if (event.key === 'Escape' && compactEchoMode && knowledgeEchoExpanded) knowledgeEchoExpanded = false;
    };
    const handleOutsideEchoClick = (event: MouseEvent) => {
      if (!compactEchoMode || !knowledgeEchoExpanded) return;
      const target = event.target as HTMLElement;
      if (!target.closest('.knowledge-echo')) knowledgeEchoExpanded = false;
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    document.addEventListener('click', handleOutsideEchoClick);
    requestAnimationFrame(() => {
      const readingBody = document.querySelector('.md-reader__body');
      if (!readingBody || typeof ResizeObserver === 'undefined') return;
      echoResizeObserver = new ResizeObserver(entries => {
        const isCompact = (entries[0]?.contentRect.width || 0) < 1100;
        if (isCompact === compactEchoMode) return;
        compactEchoMode = isCompact;
        knowledgeEchoExpanded = !isCompact;
      });
      echoResizeObserver.observe(readingBody);
    });
    return () => {
      motionPreference.removeEventListener('change', updateMotionPreference);
      window.removeEventListener('scroll', saveReadingProgress);
      document.removeEventListener('click', handleMarkdownClick);
      window.removeEventListener('keydown', handleGlobalShortcut);
      document.removeEventListener('click', handleOutsideEchoClick);
      window.clearInterval(dayRefreshTimer);
      echoResizeObserver?.disconnect();
      unlistenPromise?.then(unlisten => unlisten());
    };
  });

  let markdownHtml = $state('<div style="text-align: center; margin-top: 40vh; color: #888;">Double click anywhere or click the gear to open a markdown file.</div>');
  let filePath = $state('');
  type ReadingVisit = { path: string; position: number; fromEcho: boolean };
  let readingHistory = $state<ReadingVisit[]>([{ path: '', position: 0, fromEcho: false }]);
  let readingHistoryIndex = $state(0);
  let navigating = $state(false);
  let navigationRequest = 0;
  
  let drawerOpen = $state(false);
  let reducedMotion = $state(false);
  const appearanceThemes = ['light', 'dark', 'newsprint', 'terminal', 'glass'];
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
  interface RediscoveryPreference {
    snoozedUntil?: number;
    dismissed?: boolean;
    helpfulCount?: number;
    lastHelpfulAt?: number;
    lastHelpfulDay?: string;
    reflection?: string;
  }
  type RediscoveryKind = 'sleeping' | 'pinned' | 'unread';
  interface RediscoveryDocument {
    name: string;
    path: string;
    depth: number;
    kind: RediscoveryKind;
  }
  let rediscoveryPreferences = $state<Record<string, RediscoveryPreference>>({});
  let currentDayKey = $state(localDayKey());
  let dailyEchoFinishedDay = $state('');
  let dailyEchoSelections = $state<Record<string, { day: string; document: RediscoveryDocument | null; read: boolean; finished?: boolean }>>({});
  let dailyEchoReady = $state(false);
  let dailyEchoPreview = $state('');
  let dailyEchoPreviewLoading = $state(false);
  let dailyEchoReflectionOpen = $state(false);
  let dailyEchoReflectionDraft = $state('');
  let dailyEchoPreviewRequestId = 0;
  interface KnowledgeEcho {
    file_path: string;
    file_name: string;
    snippet: string;
    matched_terms: string[];
    score: number;
  }
  interface EchoPreference {
    snoozedUntil?: number;
    dismissed?: boolean;
    helpfulCount?: number;
    openedCount?: number;
    lastOpenedAt?: number;
  }
  let knowledgeEchoes = $state<KnowledgeEcho[]>([]);
  let knowledgeEchoIndex = $state(0);
  let knowledgeEchoLoading = $state(false);
  let knowledgeEchoExpanded = $state(false);
  let compactEchoMode = $state(true);
  let knowledgeEchoEnabled = $state(true);
  let echoPreferences = $state<Record<string, EchoPreference>>({});
  let echoRequestId = 0;
  let progressSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingScrollPosition: number | null = null;
  let pendingSearchTerm = '';
  let pendingSearchLine = 0;

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
  let globalSearchInput = $state<HTMLInputElement | undefined>(undefined);
  let selectedSearchIndex = $state(0);
  let globalSearchError = $state(false);
  let searchReturnFocus: HTMLElement | null = null;
  let toastMessage = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let newWorkspaceOpen = $state(false);
  let newWorkspaceName = $state('My Knowledge Base');
  let newWorkspaceError = $state('');
  let isCreatingWorkspace = $state(false);

  $effect(() => {
    const query = searchQuery.trim();
    const workspace = folderPath;
    let cancelled = false;
    if (query === '' || !workspace) {
       searchResults = [];
       isSearching = false;
       return;
    }
    
    if (searchTimer) clearTimeout(searchTimer);
    isSearching = true;
    
    searchTimer = setTimeout(async () => {
       try {
         const res = await invoke('search_content', { path: workspace, query });
         if (!cancelled) searchResults = res as SearchResult[];
       } catch(e) {
         console.error("Search failed:", e);
         if (!cancelled) searchResults = [];
       } finally {
         if (!cancelled) isSearching = false;
       }
    }, 300);
    return () => { cancelled = true; if (searchTimer) clearTimeout(searchTimer); };
  });

  $effect(() => {
    const query = globalSearchQuery.trim();
    const workspace = folderPath;
    let cancelled = false;
    selectedSearchIndex = 0;
    globalSearchError = false;
    if (!globalSearchOpen || query === '' || !workspace) {
      globalSearchResults = [];
      isGlobalSearching = false;
      return;
    }
    if (globalSearchTimer) clearTimeout(globalSearchTimer);
    isGlobalSearching = true;
    globalSearchTimer = setTimeout(async () => {
      try {
        const results = await invoke('search_content', { path: workspace, query }) as SearchResult[];
        if (!cancelled) globalSearchResults = results;
      } catch (error) {
        console.error('Global search failed:', error);
        if (!cancelled) { globalSearchResults = []; globalSearchError = true; }
      } finally {
        if (!cancelled) isGlobalSearching = false;
      }
    }, 180);
    return () => { cancelled = true; if (globalSearchTimer) clearTimeout(globalSearchTimer); };
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
  let workspaceName = $derived(folderPath.split(/[/\\]/).filter(Boolean).pop() || t('misc.reader_title'));

  $effect(() => {
    const appTitle = t('misc.reader_title');
    if (typeof document !== 'undefined') document.title = appTitle;
    if (typeof window !== 'undefined' && !folderPath && !filePath && '__TAURI_INTERNALS__' in window) {
      void getCurrentWindow().setTitle(appTitle);
    }
  });

  let recentDocuments = $derived(recentFiles.map(path => markdownFiles.find(file => file.path === path)).filter(Boolean));
  let pinnedDocuments = $derived(pinnedFiles.map(path => markdownFiles.find(file => file.path === path)).filter(Boolean));
  let continueDocuments = $derived(
    Object.entries(readingProgress)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .map(([path]) => markdownFiles.find(file => file.path === path))
      .filter(Boolean)
      .slice(0, 5)
  );
  let dailyEcho = $derived(buildDailyEcho());
  $effect(() => {
    if (!dailyEchoReady || !folderPath || markdownFiles.length === 0) return;
    const prefix = folderPath.replace(/[\\/]+$/, '') + '/';
    if (markdownFiles.some(file => !file.path.replace(/\\/g, '/').startsWith(prefix.replace(/\\/g, '/')))) return;
    const saved = dailyEchoSelections[folderPath];
    if (saved?.day === currentDayKey && (!saved.document || saved.document.path.replace(/\\/g, '/').startsWith(prefix.replace(/\\/g, '/')))) return;
    dailyEchoSelections = { ...dailyEchoSelections, [folderPath]: { day: currentDayKey, document: selectDailyEcho(), read: false } };
    void syncStore();
  });
  let hiddenRediscoveryCount = $derived(markdownFiles.filter(file => rediscoveryPreferences[file.path]?.dismissed).length);
  let hiddenEchoCount = $derived(Object.values(echoPreferences).filter(preference => preference.dismissed).length);

  $effect(() => {
    const path = dailyEcho?.path || '';
    dailyEchoReflectionOpen = false;
    dailyEchoReflectionDraft = path ? (rediscoveryPreferences[path]?.reflection || '') : '';
    void loadDailyEchoPreview(path);
  });
  
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
    await store.set('showSidebar', showSidebar);
    await store.set('sidebarTab', sidebarTab);
    await store.set('locale', i18nState.locale);
    await store.set('appTheme', currentTheme);
    await store.set('appFont', appFont);
    await store.set('customFontInput', customFontInput);
    await store.set('recentFiles', recentFiles);
    await store.set('pinnedFiles', pinnedFiles);
    await store.set('readingProgress', readingProgress);
    await store.set('rediscoveryPreferences', rediscoveryPreferences);
    await store.set('dailyEchoFinishedDay', dailyEchoFinishedDay);
    await store.set('dailyEchoSelections', dailyEchoSelections);
    await store.set('echoPreferences', echoPreferences);
    await store.set('knowledgeEchoEnabled', knowledgeEchoEnabled);
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
        const savedSidebar = await store.get('showSidebar');
        if (typeof savedSidebar === 'boolean') showSidebar = savedSidebar;
        const savedSidebarTab = await store.get('sidebarTab');
        if (savedSidebarTab === 'files' || savedSidebarTab === 'toc') sidebarTab = savedSidebarTab;

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
        const savedRediscoveryPreferences = await store.get<Record<string, RediscoveryPreference>>('rediscoveryPreferences');
        if (savedRediscoveryPreferences && typeof savedRediscoveryPreferences === 'object') rediscoveryPreferences = savedRediscoveryPreferences;
        const savedDailyEchoFinishedDay = await store.get<string>('dailyEchoFinishedDay');
        if (typeof savedDailyEchoFinishedDay === 'string') dailyEchoFinishedDay = savedDailyEchoFinishedDay;
        const savedSelections = await store.get('dailyEchoSelections');
        if (savedSelections && typeof savedSelections === 'object') dailyEchoSelections = savedSelections;
        const savedEchoPreferences = await store.get<Record<string, EchoPreference>>('echoPreferences');
        if (savedEchoPreferences && typeof savedEchoPreferences === 'object') echoPreferences = savedEchoPreferences;
        const savedKnowledgeEchoEnabled = await store.get('knowledgeEchoEnabled') as boolean | null;
        if (typeof savedKnowledgeEchoEnabled === 'boolean') knowledgeEchoEnabled = savedKnowledgeEchoEnabled;

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
        dailyEchoReady = true;
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
        const yes = await ask(`${t('update.new_version')} ${update.version}！\n\n${t('update.content')}: ${update.body || t('update.regular')}\n\n${t('update.prompt')}？`, { title: `${t('misc.reader_title')} ${t('update.title')}`, kind: 'info' });
        if (yes) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } else if (manual) {
        await ask(t('update.up_to_date'), { title: `${t('misc.reader_title')} ${t('update.title')}`, kind: 'info' });
      }
    } catch (e: any) {
      console.warn("Auto-updater check failed:", e);
      if (manual) {
        await ask(`${t('update.error')} ${e.message || String(e)}`, { title: `${t('misc.reader_title')} ${t('update.title')}`, kind: 'error' });
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
      const requestedPath = filePath;
      try {
        const content = await readTextFile(requestedPath);
        if (requestedPath !== filePath) return;
        
        const MD_PLUGINS = [
          'Emoji', 'Sub', 'Sup', 'Ins', 'Abbr', 'Katex', 'Mermaid',
          'Mark', 'Deflist', 'Footnote', 'TaskLists', 'TOC', 'Alert'
        ];
        
        markdownHtml = mdRender(content, { theme: 'light', plugins: MD_PLUGINS });
        
        await tick();
        if (requestedPath !== filePath) return;
        {
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
             scrollToSearchMatch(pendingSearchTerm, pendingSearchLine);
             pendingSearchTerm = '';
             pendingSearchLine = 0;
             pendingScrollPosition = null;
           } else if (pendingScrollPosition !== null) {
             const position = pendingScrollPosition;
             pendingScrollPosition = null;
             await new Promise<void>(resolve => requestAnimationFrame(() => {
               if (requestedPath === filePath) window.scrollTo({ top: position, behavior: 'instant' });
               resolve();
             }));
           }
        }
      } catch (e: any) {
        if (requestedPath !== filePath) return;
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
      saveReadingProgress();
      resetReadingHistory();
      folderFiles = [];
      folderPath = selected as string;
      filePath = '';
      markdownHtml = '';
      activeHeaderId = '';
      folderFiles = await scanFolder(folderPath, 1);
      sidebarTab = 'files';
      syncStore();
    }
  }

  function showNewWorkspace() {
    drawerOpen = false;
    newWorkspaceError = '';
    newWorkspaceOpen = true;
    tick().then(() => document.getElementById('workspace-name')?.focus());
  }

  async function createWorkspace() {
    const name = newWorkspaceName.trim();
    if (!name || /[\\/]/.test(name)) {
      newWorkspaceError = t('workspace.invalid_name');
      return;
    }
    const selected = await open({ directory: true, multiple: false, title: 'Choose where to create your knowledge base' });
    if (!selected) return;

    isCreatingWorkspace = true;
    newWorkspaceError = '';
    try {
      const workspacePath = await join(selected as string, name);
      if (await exists(workspacePath)) {
        newWorkspaceError = t('workspace.exists');
        return;
      }
      await mkdir(workspacePath);
      const welcomePath = await join(workspacePath, 'Welcome.md');
      await writeTextFile(welcomePath, createWelcomeNote(name));
      saveReadingProgress();
      resetReadingHistory();
      folderPath = workspacePath;
      folderFiles = await scanFolder(folderPath, 1);
      filePath = '';
      sidebarTab = 'files';
      newWorkspaceOpen = false;
      await openSpecificFile(welcomePath);
      toastMessage = `Welcome to ${name}`;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastMessage = '', 2300);
    } catch (error) {
      console.error('Failed to create workspace:', error);
      newWorkspaceError = t('workspace.create_failed');
    } finally {
      isCreatingWorkspace = false;
    }
  }

  function createWelcomeNote(name: string) {
    if (i18nState.locale === 'zh') {
      return `# 欢迎来到 ${name}\n\n这里是你的私密阅读空间。所有内容都保存在这个文件夹和你的设备上。\n\n## 从这里开始\n\n- 把 Markdown 文件放进这个文件夹，知返会自动发现它们。\n- 点击 ✦ 固定重要笔记。\n- 随时按下 **⌘K**，搜索你的整个知识库。\n\n> 知返会记住你的阅读位置，让你每次都能从上次停下的地方继续。\n\n开始阅读吧。\n`;
    }
    return `# Welcome to ${name}\n\nThis is your private reading space. Everything stays in this folder, on your device.\n\n## Start here\n\n- Add Markdown files to this folder and Pyrus will find them automatically.\n- Pin an important note with the ✦ button.\n- Press **⌘K** anytime to search your knowledge base.\n\n> Pyrus remembers where you stopped reading, so you can always pick up where you left off.\n\nHappy reading.\n`;
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

  function rememberCurrentVisit() {
    if (navigating) return;
    saveReadingProgress();
    readingHistory = readingHistory.map((visit, index) => index === readingHistoryIndex
      ? { ...visit, position: window.scrollY } : visit);
  }

  function resetReadingHistory() {
    navigationRequest += 1;
    navigating = false;
    readingHistory = [{ path: '', position: 0, fromEcho: false }];
    readingHistoryIndex = 0;
  }

  function addReadingVisit(path: string, fromEcho = false) {
    readingHistory = [...readingHistory.slice(0, readingHistoryIndex + 1), { path, position: 0, fromEcho }];
    readingHistoryIndex = readingHistory.length - 1;
  }

  async function navigateReadingHistory(direction: number) {
    if (navigating) return;
    const index = readingHistoryIndex + direction;
    const visit = readingHistory[index];
    if (!visit) return;
    rememberCurrentVisit();
    readingHistoryIndex = index;
    pendingSearchTerm = '';
    if (visit.path) await openSpecificFile(visit.path, { history: true, position: visit.position });
    else {
      openWorkspaceHome(true);
      await tick();
      window.scrollTo({ top: visit.position, behavior: 'instant' });
    }
  }

  function selectSidebarTab(tab: 'files' | 'toc') {
    sidebarTab = tab;
    void syncStore();
  }

  function toggleSidebar() {
    showSidebar = !showSidebar;
    void syncStore();
  }

  async function openSpecificFile(path: string, options: { history?: boolean; position?: number; fromEcho?: boolean } = {}) {
    if (!path) return;
    if (!options.history) {
      rememberCurrentVisit();
      if (path !== filePath) addReadingVisit(path, options.fromEcho);
    }
    const request = ++navigationRequest;
    navigating = true;
    if (compactEchoMode) knowledgeEchoExpanded = false;
    filePath = path;
    getCurrentWindow().setTitle(filePath.split(/[/\\]/).pop() || t('misc.reader_title'));
    recentFiles = [path, ...recentFiles.filter(item => item !== path)].slice(0, 8);
    pendingScrollPosition = options.position ?? readingProgress[path]?.position ?? 0;
    await loadContent();
    if (request !== navigationRequest) return;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (request !== navigationRequest) return;
    navigating = false;
    const todaySelection = dailyEchoSelections[folderPath];
    if (todaySelection?.day === currentDayKey && todaySelection.document?.path === path) {
      dailyEchoSelections = { ...dailyEchoSelections, [folderPath]: { ...todaySelection, read: true } };
    }
    void loadKnowledgeEchoes(path);
    
    syncStore();

    if (unwatch) unwatch();
    try {
      const stopWatching = await watch(path, () => {
        if (filePath === path) void loadContent();
      }, { delayMs: 100 });
      if (request === navigationRequest) unwatch = stopWatching;
      else stopWatching();
    } catch (e) {
      console.warn("Watch file failed:", e);
    }
  }

  function echoPreferenceKey(sourcePath: string, targetPath: string) {
    return `${sourcePath}::${targetPath}`;
  }

  async function loadKnowledgeEchoes(sourcePath: string) {
    const requestId = ++echoRequestId;
    knowledgeEchoes = [];
    knowledgeEchoIndex = 0;
    if (!knowledgeEchoEnabled || !folderPath || !sourcePath.startsWith(folderPath)) {
      knowledgeEchoLoading = false;
      return;
    }
    knowledgeEchoLoading = true;
    try {
      const results = await invoke('find_knowledge_echoes', {
        rootPath: folderPath,
        currentFile: sourcePath,
        limit: 8
      }) as KnowledgeEcho[];
      if (requestId !== echoRequestId || filePath !== sourcePath) return;
      const now = Date.now();
      knowledgeEchoes = results.filter(echo => {
        const preference = echoPreferences[echoPreferenceKey(sourcePath, echo.file_path)];
        return !preference?.dismissed && (!preference?.snoozedUntil || preference.snoozedUntil <= now);
      }).sort((a, b) => echoDisplayScore(sourcePath, b) - echoDisplayScore(sourcePath, a)).slice(0, 5);
    } catch (error) {
      if (requestId === echoRequestId) knowledgeEchoes = [];
      console.error('Failed to find knowledge echoes:', error);
    } finally {
      if (requestId === echoRequestId) knowledgeEchoLoading = false;
    }
  }

  function currentKnowledgeEcho() {
    return knowledgeEchoes[knowledgeEchoIndex];
  }

  function compactEchoLabel() {
    if (knowledgeEchoLoading) return t('echo.finding');
    return `${t('echo.found_prefix')}${knowledgeEchoes.length}${t('echo.found_suffix')}`;
  }

  function echoDisplayScore(sourcePath: string, echo: KnowledgeEcho) {
    const preference = echoPreferences[echoPreferenceKey(sourcePath, echo.file_path)];
    const lastRead = readingProgress[echo.file_path]?.updatedAt;
    const forgottenBonus = lastRead ? Math.min((Date.now() - lastRead) / 86400000 / 365, 1) * 0.06 : 0;
    return echo.score
      + (pinnedFiles.includes(echo.file_path) ? 0.09 : 0)
      + forgottenBonus
      + Math.min(preference?.helpfulCount || 0, 3) * 0.05
      + Math.min(preference?.openedCount || 0, 3) * 0.01;
  }

  async function updateEchoPreference(targetPath: string, update: Partial<EchoPreference>) {
    const key = echoPreferenceKey(filePath, targetPath);
    echoPreferences = {
      ...echoPreferences,
      [key]: { ...echoPreferences[key], ...update }
    };
    await syncStore();
  }

  function showNextEcho() {
    if (knowledgeEchoes.length < 2) return;
    knowledgeEchoIndex = (knowledgeEchoIndex + 1) % knowledgeEchoes.length;
  }

  function removeCurrentEcho() {
    knowledgeEchoes = knowledgeEchoes.filter((_, index) => index !== knowledgeEchoIndex);
    knowledgeEchoIndex = Math.min(knowledgeEchoIndex, Math.max(knowledgeEchoes.length - 1, 0));
  }

  async function openKnowledgeEcho(echo: KnowledgeEcho) {
    await updateEchoPreference(echo.file_path, {
      openedCount: (echoPreferences[echoPreferenceKey(filePath, echo.file_path)]?.openedCount || 0) + 1,
      lastOpenedAt: Date.now()
    });
    await openSpecificFile(echo.file_path, { fromEcho: true });
  }

  function markEchoHelpful(echo: KnowledgeEcho) {
    const preference = echoPreferences[echoPreferenceKey(filePath, echo.file_path)];
    void updateEchoPreference(echo.file_path, { helpfulCount: (preference?.helpfulCount || 0) + 1 });
    toastMessage = t('echo.helpful_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
  }

  function snoozeKnowledgeEcho(echo: KnowledgeEcho) {
    void updateEchoPreference(echo.file_path, { snoozedUntil: Date.now() + 7 * 86400000 });
    removeCurrentEcho();
    toastMessage = t('echo.snoozed_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
  }

  function dismissKnowledgeEcho(echo: KnowledgeEcho) {
    void updateEchoPreference(echo.file_path, { dismissed: true });
    removeCurrentEcho();
    toastMessage = t('echo.dismissed_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
  }

  function resetKnowledgeEchoes() {
    echoPreferences = {};
    toastMessage = t('echo.reset_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
    if (filePath) void loadKnowledgeEchoes(filePath);
  }

  function handleKnowledgeEchoToggle() {
    echoRequestId += 1;
    knowledgeEchoes = [];
    knowledgeEchoLoading = false;
    syncStore();
    if (knowledgeEchoEnabled && filePath) void loadKnowledgeEchoes(filePath);
  }

  function echoContext(echo: KnowledgeEcho) {
    const context: string[] = [];
    if (pinnedFiles.includes(echo.file_path)) context.push(t('echo.context_pinned'));
    const lastRead = readingProgress[echo.file_path]?.updatedAt;
    if (lastRead) {
      const days = Math.max(1, Math.floor((Date.now() - lastRead) / 86400000));
      if (days >= 7) context.push(`${days}${t('echo.context_days')}`);
    }
    if (context.length === 0) context.push(t('echo.context_related'));
    return context.join(' · ');
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
    if (!filePath || navigating) return;
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
    pendingSearchLine = result.line_number;
    openSpecificFile(result.file_path);
  }

  function openGlobalSearch() {
    if (!folderPath) {
      drawerOpen = true;
      return;
    }
    globalSearchOpen = true;
    searchReturnFocus = document.activeElement as HTMLElement;
    tick().then(() => globalSearchInput?.focus());
  }

  function closeGlobalSearch() {
    globalSearchOpen = false;
    searchReturnFocus?.focus();
  }

  function handleSearchKeys(event: KeyboardEvent) {
    if (event.isComposing || isGlobalSearching || globalSearchError) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = globalSearchResults.length;
      if (!count) return;
      selectedSearchIndex = (selectedSearchIndex + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      void tick().then(() => document.getElementById(`search-result-${selectedSearchIndex}`)?.scrollIntoView({ block: 'nearest' }));
    } else if (event.key === 'Enter' && globalSearchResults[selectedSearchIndex]) {
      event.preventDefault();
      openSearchResult(globalSearchResults[selectedSearchIndex], globalSearchQuery);
      closeGlobalSearch();
    }
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

  function scrollToSearchMatch(term: string, line = 0) {
    const article = document.querySelector('.md-reader__markdown-content');
    if (!article || !term) return;
    const mapped = Array.from(article.querySelectorAll<HTMLElement>('[data-source-start]'))
      .filter(element => Number(element.dataset.sourceStart) <= line && Number(element.dataset.sourceEnd) >= line)
      .sort((a, b) => (Number(a.dataset.sourceEnd) - Number(a.dataset.sourceStart)) - (Number(b.dataset.sourceEnd) - Number(b.dataset.sourceStart)));
    const target = mapped[0] || Array.from(article.querySelectorAll('p, li, blockquote, pre, td, h1, h2, h3, h4, h5, h6'))
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

  function buildDailyEcho(): RediscoveryDocument | null {
    const selection = dailyEchoSelections[folderPath];
    if (selection?.day !== currentDayKey || selection.finished) return null;
    const doc = selection.document;
    return doc && markdownFiles.some(file => file.path === doc.path) ? doc : null;
  }

  function selectDailyEcho(): RediscoveryDocument | null {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentSet = new Set(recentFiles.slice(0, 3));
    const candidates = markdownFiles.filter(file => {
      const preference = rediscoveryPreferences[file.path];
      return !preference?.dismissed && (!preference?.snoozedUntil || preference.snoozedUntil <= now);
    });
    const oldestFirst = (a: typeof candidates[number], b: typeof candidates[number]) =>
      (readingProgress[a.path]?.updatedAt || 0) - (readingProgress[b.path]?.updatedAt || 0);
    const dailyRank = (path: string) => stableHash(`${currentDayKey}:${path}`);
    const pickForToday = (items: typeof candidates, kind: RediscoveryKind) => {
      const item = [...items].sort((a, b) => dailyRank(a.path) - dailyRank(b.path))[0];
      return item ? { ...item, kind } : null;
    };

    const sleeping = candidates
      .filter(file => readingProgress[file.path]?.updatedAt && readingProgress[file.path].updatedAt <= sevenDaysAgo && !recentSet.has(file.path))
      .sort(oldestFirst)
      .slice(0, 12);
    const pinned = candidates
      .filter(file => pinnedFiles.includes(file.path) && !recentSet.has(file.path))
      .sort(oldestFirst)
      .slice(0, 12);
    const unread = candidates.filter(file => !readingProgress[file.path] && !recentSet.has(file.path));

    return pickForToday(sleeping, 'sleeping')
      || pickForToday(pinned, 'pinned')
      || pickForToday(unread, 'unread')
      || pickForToday(candidates.filter(file => !recentSet.has(file.path)), 'sleeping')
      || null;
  }

  function localDayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function stableHash(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash);
  }

  function rediscoveryReason(document: RediscoveryDocument) {
    if (document.kind === 'unread') return t('rediscovery.reason_unread');
    if (document.kind === 'pinned') return t('rediscovery.reason_pinned');
    const updatedAt = readingProgress[document.path]?.updatedAt;
    if (!updatedAt) return t('rediscovery.reason_sleeping');
    const days = Math.max(1, Math.floor((Date.now() - updatedAt) / 86400000));
    return `${days}${t('rediscovery.reason_days')}`;
  }

  async function loadDailyEchoPreview(path: string) {
    const requestId = ++dailyEchoPreviewRequestId;
    dailyEchoPreview = '';
    if (!path) {
      dailyEchoPreviewLoading = false;
      return;
    }
    dailyEchoPreviewLoading = true;
    try {
      const source = await readTextFile(path);
      if (requestId === dailyEchoPreviewRequestId) dailyEchoPreview = extractDailyEchoPreview(source);
    } catch (error) {
      console.warn('Failed to load daily echo preview:', error);
    } finally {
      if (requestId === dailyEchoPreviewRequestId) dailyEchoPreviewLoading = false;
    }
  }

  function extractDailyEchoPreview(source: string) {
    const withoutFrontmatter = source.replace(/^---\s*[\s\S]*?\n---\s*/m, '');
    const paragraphs = withoutFrontmatter
      .replace(/```[\s\S]*?```/g, ' ')
      .split(/\n\s*\n/)
      .map(block => block
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(block => block.length >= 28 && !block.startsWith('|'));
    const preview = paragraphs[0] || '';
    return preview.length > 220 ? `${preview.slice(0, 217).trimEnd()}…` : preview;
  }

  function openDailyEchoReflection(document: RediscoveryDocument) {
    dailyEchoReflectionDraft = rediscoveryPreferences[document.path]?.reflection || '';
    dailyEchoReflectionOpen = true;
  }

  function markDailyEchoHelpful(document: RediscoveryDocument) {
    const preference = rediscoveryPreferences[document.path] || {};
    const today = currentDayKey;
    rediscoveryPreferences = {
      ...rediscoveryPreferences,
      [document.path]: {
        ...preference,
        helpfulCount: (preference.helpfulCount || 0) + (preference.lastHelpfulDay === today ? 0 : 1),
        lastHelpfulAt: Date.now(),
        lastHelpfulDay: today
      }
    };
    toastMessage = t('daily_echo.helpful_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
  }

  function saveDailyEchoReflection(document: RediscoveryDocument) {
    const preference = rediscoveryPreferences[document.path] || {};
    rediscoveryPreferences = {
      ...rediscoveryPreferences,
      [document.path]: {
        ...preference,
        reflection: dailyEchoReflectionDraft.trim() || undefined
      }
    };
    dailyEchoReflectionOpen = false;
    toastMessage = t('daily_echo.context_saved_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
  }

  function snoozeRediscovery(path: string, days: number) {
    rediscoveryPreferences = {
      ...rediscoveryPreferences,
      [path]: { ...rediscoveryPreferences[path], snoozedUntil: Date.now() + days * 86400000 }
    };
    dailyEchoFinishedDay = currentDayKey;
    finishDailyEcho();
    toastMessage = days === 1 ? t('rediscovery.skipped_toast') : t('rediscovery.snoozed_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
  }

  function dismissRediscovery(path: string) {
    rediscoveryPreferences = {
      ...rediscoveryPreferences,
      [path]: { ...rediscoveryPreferences[path], dismissed: true }
    };
    dailyEchoFinishedDay = currentDayKey;
    finishDailyEcho();
    toastMessage = t('rediscovery.dismissed_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
  }

  function finishDailyEcho() {
    const selection = dailyEchoSelections[folderPath];
    if (selection) dailyEchoSelections = { ...dailyEchoSelections, [folderPath]: { ...selection, finished: true } };
  }

  function resetRediscovery() {
    const selection = dailyEchoSelections[folderPath];
    if (selection) dailyEchoSelections = { ...dailyEchoSelections, [folderPath]: { ...selection, finished: false } };
    rediscoveryPreferences = Object.fromEntries(
      Object.entries(rediscoveryPreferences).flatMap(([path, preference]) => {
        const history: RediscoveryPreference = {
          helpfulCount: preference.helpfulCount,
          lastHelpfulAt: preference.lastHelpfulAt,
          lastHelpfulDay: preference.lastHelpfulDay,
          reflection: preference.reflection
        };
        return Object.values(history).some(value => value !== undefined) ? [[path, history]] : [];
      })
    );
    dailyEchoFinishedDay = '';
    toastMessage = t('rediscovery.reset_toast');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastMessage = '', 2300);
    syncStore();
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

  function openWorkspaceHome(fromHistory = false) {
    if (!folderPath && !fromHistory) return;
    if (!fromHistory) {
      rememberCurrentVisit();
      if (filePath) addReadingVisit('');
    }
    navigationRequest += 1;
    navigating = false;
    if (unwatch) { unwatch(); unwatch = null; }
    echoRequestId += 1;
    knowledgeEchoes = [];
    knowledgeEchoLoading = false;
    filePath = '';
    markdownHtml = '';
    headers = [];
    activeHeaderId = '';
    getCurrentWindow().setTitle(workspaceName);
    if (!fromHistory) window.scrollTo({ top: 0, behavior: 'instant' });
    syncStore();
  }

  function closeWorkspace() {
    saveReadingProgress();
    resetReadingHistory();
    if (unwatch) {
      unwatch();
      unwatch = null;
    }
    folderPath = '';
    echoRequestId += 1;
    knowledgeEchoes = [];
    knowledgeEchoLoading = false;
    filePath = '';
    folderFiles = [];
    headers = [];
    activeHeaderId = '';
    markdownHtml = '';
    drawerOpen = false;
    getCurrentWindow().setTitle(t('misc.reader_title'));
    window.scrollTo({ top: 0, behavior: 'auto' });
    syncStore();
  }

  async function sendFeedback() {
    const title = encodeURIComponent('[Feedback] ');
    const productName = t('misc.reader_title');
    const body = encodeURIComponent(`## What would make ${productName} better?\n\n\n## Context (optional)\n- OS:\n- ${productName} version:`);
    try {
      await openUrl(`https://github.com/Insight4Core/markdown_reader/issues/new?title=${title}&body=${body}`);
    } catch (error) {
      console.error('Failed to open feedback page:', error);
    }
  }

  function scrollTo(id: string) {
    activeHeaderId = id;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleMarkdownClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.md-reader__markdown-content')) return;
    
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


<div class="md-reader" style="--side-width: {sidebarWidth}px;">
  <div class="md-reader__side">
    {#if folderPath}
      <button class="workspace-nav" onclick={() => openWorkspaceHome()} aria-label={t('workspace.home')}>
        <span class="workspace-nav__mark">✦</span>
        <span><small>{t('misc.reader_title')}</small><strong>{workspaceName}</strong></span>
        <span class="workspace-nav__arrow">↗</span>
      </button>
    {:else}
      <button class="workspace-nav workspace-nav--app" onclick={openFolder} aria-label={t('workspace.open_folder')}>
        <span class="workspace-nav__mark">✦</span>
        <span><small>{t('misc.reader_title')}</small><strong>Reading space</strong></span>
        <span class="workspace-nav__arrow">+</span>
      </button>
    {/if}
    <div class="sidebar-tabs" class:sidebar-tabs--toc={sidebarTab === 'toc'}>
      <button aria-pressed={sidebarTab === 'files'} class={sidebarTab === 'files' ? 'active' : ''} onclick={() => selectSidebarTab('files')}>{t('sidebar.files')}</button>
      <button aria-pressed={sidebarTab === 'toc'} class={sidebarTab === 'toc' ? 'active' : ''} onclick={() => selectSidebarTab('toc')}>{t('sidebar.toc')}</button>
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
    <nav class="reading-toolbar" aria-label={t('navigation.label')}>
      <button class="reading-toolbar__sidebar" aria-label={showSidebar ? t('navigation.hide_sidebar') : t('navigation.show_sidebar')} title={showSidebar ? t('navigation.hide_sidebar') : t('navigation.show_sidebar')} aria-pressed={showSidebar} onclick={toggleSidebar}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11h1"/></svg>
      </button>
      <span class="reading-toolbar__divider" aria-hidden="true"></span>
      <button disabled={navigating || readingHistoryIndex === 0} aria-label={t('navigation.back')} title={t('navigation.back') + ' · Alt + ←'} onclick={() => navigateReadingHistory(-1)}>←</button>
      <button disabled={navigating || readingHistoryIndex >= readingHistory.length - 1} aria-label={t('navigation.forward')} title={t('navigation.forward') + ' · Alt + →'} onclick={() => navigateReadingHistory(1)}>→</button>
      <button class="reading-toolbar__search" onclick={openGlobalSearch} disabled={!folderPath} title={t('search.title')}>{t('search.title')} <kbd>⌘ / Ctrl K</kbd></button>
      {#if readingHistory[readingHistoryIndex]?.fromEcho && readingHistoryIndex > 0}
        <button class="reading-toolbar__return" disabled={navigating} onclick={() => navigateReadingHistory(-1)}>{t('navigation.return_reading')}</button>
      {/if}
    </nav>
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
            <section class="workspace-card workspace-card--daily-echo">
              <div class="daily-echo__heading">
                <div>
                  <span class="daily-echo__date">{t('daily_echo.eyebrow')}</span>
                  <h3>{t('daily_echo.title')}</h3>
                </div>
                <span class="daily-echo__local"><i>●</i>{t('rediscovery.local')}</span>
              </div>
              {#if dailyEcho}
                <article class="daily-echo">
                  <div class="daily-echo__content">
                    <p class="daily-echo__reason">{#if dailyEchoSelections[folderPath]?.read}✓ {t('daily_echo.read')}{:else}{rediscoveryReason(dailyEcho)}{/if}</p>
                    <button class="daily-echo__document" onclick={() => openSpecificFile(dailyEcho.path)}>
                      <strong>{dailyEcho.name.replace(/\.(md|markdown|mdx)$/i, '')}</strong>
                      {#if dailyEchoPreviewLoading}
                        <span class="daily-echo__preview daily-echo__preview--loading"></span>
                      {:else if dailyEchoPreview}
                        <blockquote>“{dailyEchoPreview}”</blockquote>
                      {:else}
                        <blockquote>{t('daily_echo.no_preview')}</blockquote>
                      {/if}
                    </button>
                    <p class="daily-echo__path">{dailyEcho.path.replace(folderPath, '').replace(/^[/\\]/, '')}</p>
                  </div>
                  <div class="daily-echo__actions">
                    <button class="daily-echo__open" onclick={() => openSpecificFile(dailyEcho.path)}>{t('daily_echo.open')}<span>→</span></button>
                    <button class:daily-echo__helpful--saved={rediscoveryPreferences[dailyEcho.path]?.lastHelpfulDay === currentDayKey} class="daily-echo__helpful" onclick={() => markDailyEchoHelpful(dailyEcho)}>
                      {rediscoveryPreferences[dailyEcho.path]?.lastHelpfulDay === currentDayKey ? '✓ ' + t('daily_echo.helpful_saved') : '♡ ' + t('daily_echo.helpful')}
                    </button>
                    {#if rediscoveryPreferences[dailyEcho.path]?.lastHelpfulDay === currentDayKey}
                      <button class="daily-echo__add-context" onclick={() => openDailyEchoReflection(dailyEcho)}>{t('daily_echo.add_context')}</button>
                    {/if}
                    <details class="daily-echo__menu">
                      <summary aria-label={t('rediscovery.more')}>•••</summary>
                      <div>
                        <button onclick={() => snoozeRediscovery(dailyEcho.path, 1)}>{t('daily_echo.tomorrow')}</button>
                        <button onclick={() => snoozeRediscovery(dailyEcho.path, 30)}>{t('rediscovery.in_30_days')}</button>
                        <button onclick={() => dismissRediscovery(dailyEcho.path)}>{t('rediscovery.dismiss')}</button>
                      </div>
                    </details>
                  </div>
                  {#if dailyEchoReflectionOpen}
                    <div class="daily-echo__reflection" transition:slide={{ duration: reducedMotion ? 0 : 220, easing: cubicOut }}>
                      <label for="daily-echo-reflection">{t('daily_echo.reflection_label')}</label>
                      <textarea id="daily-echo-reflection" bind:value={dailyEchoReflectionDraft} maxlength="240" placeholder={t('daily_echo.reflection_placeholder')}></textarea>
                      <div>
                        <button onclick={() => dailyEchoReflectionOpen = false}>{t('workspace.cancel')}</button>
                        <button class="daily-echo__reflection-save" onclick={() => saveDailyEchoReflection(dailyEcho)}>{t('daily_echo.save')}</button>
                      </div>
                    </div>
                  {/if}
                </article>
              {:else}
                <p class="workspace-card__empty daily-echo__empty">{dailyEchoSelections[folderPath]?.day === currentDayKey && dailyEchoSelections[folderPath]?.finished ? t('daily_echo.done') : t('daily_echo.empty')}</p>
              {/if}
              {#if hiddenRediscoveryCount > 0}
                <button class="rediscovery-reset" onclick={resetRediscovery}>{t('rediscovery.restore')} ({hiddenRediscoveryCount})</button>
              {/if}
            </section>
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
          <p class="welcome__eyebrow">{t('misc.reader_title')} / READING SPACE</p>
          <h2>{t('welcome.title')}</h2>
          <p class="welcome__subtitle">{t('welcome.subtitle')}</p>
          <div class="welcome__actions">
            <button class="welcome__primary" onclick={showNewWorkspace}>{t('workspace.new')}</button>
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
        <div class="reading-context"><button class="reading-context__home" onclick={() => openWorkspaceHome()}>⌂ {workspaceName}</button><span>/</span><span>{filePath.replace(folderPath, '').replace(/^\//, '')}</span><button onclick={() => togglePin(filePath)} class:active={pinnedFiles.includes(filePath)}>{pinnedFiles.includes(filePath) ? '✦ ' + t('workspace.unpin') : '✧ ' + t('workspace.pin')}</button></div>
      {/if}
      <div class:reading-shell--with-echo={knowledgeEchoLoading || knowledgeEchoes.length > 0} class="reading-shell">
        {#key filePath}
          <div class="md-reader__markdown-content centered">
            {@html markdownHtml}
          </div>
        {/key}
        {#if knowledgeEchoLoading || knowledgeEchoes.length > 0}
          <aside class:knowledge-echo--collapsed={!knowledgeEchoExpanded} class:knowledge-echo--compact={compactEchoMode} class="knowledge-echo" aria-label={t('echo.title')}>
            <button class="knowledge-echo__toggle" onclick={() => knowledgeEchoExpanded = !knowledgeEchoExpanded} aria-expanded={knowledgeEchoExpanded}>
              <span class="knowledge-echo__symbol">◌</span>
              <span><small>{t('misc.reader_title')}</small><strong>{compactEchoMode ? compactEchoLabel() : t('echo.title')}</strong></span>
              <i>{knowledgeEchoExpanded ? '−' : '+'}</i>
            </button>
            {#if knowledgeEchoExpanded}
              {#if knowledgeEchoLoading}
                <div class="knowledge-echo__loading" aria-live="polite">
                  <span></span><span></span><span></span>
                  <p>{t('echo.listening')}</p>
                </div>
              {:else if currentKnowledgeEcho()}
                {@const echo = currentKnowledgeEcho()!}
                <div class="knowledge-echo__body">
                  <div class="knowledge-echo__meta">
                    <span>{t('echo.from_past')}</span>
                    {#if knowledgeEchoes.length > 1}
                      <button onclick={showNextEcho} aria-label={t('echo.next')}>{knowledgeEchoIndex + 1} / {knowledgeEchoes.length}<i>→</i></button>
                    {/if}
                  </div>
                  <button class="knowledge-echo__document" onclick={() => openKnowledgeEcho(echo)}>
                    <strong>{echo.file_name.replace(/\.(md|markdown|mdx)$/i, '')}</strong>
                    <small>{echoContext(echo)}</small>
                    <blockquote>{echo.snippet || t('echo.no_preview')}</blockquote>
                  </button>
                  {#if echo.matched_terms.length}
                    <div class="knowledge-echo__terms" aria-label={t('echo.shared_ideas')}>
                      {#each echo.matched_terms.slice(0, 3) as term}<span>{term}</span>{/each}
                    </div>
                  {/if}
                  <button class="knowledge-echo__open" onclick={() => openKnowledgeEcho(echo)}>{t('echo.open')}<span>↗</span></button>
                  <div class="knowledge-echo__feedback">
                    <button onclick={() => markEchoHelpful(echo)}>♡ {t('echo.helpful')}</button>
                    <button onclick={() => snoozeKnowledgeEcho(echo)}>{t('echo.later')}</button>
                    <button onclick={() => dismissKnowledgeEcho(echo)}>{t('echo.not_related')}</button>
                  </div>
                  <p class="knowledge-echo__privacy"><span>●</span>{t('echo.local')}</p>
                </div>
              {/if}
            {/if}
          </aside>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if filePath}
  <div class="reading-progress" style="--progress: {progressPercent(filePath)}%" aria-hidden="true"></div>
{/if}

{#if toastMessage}
  <div class="app-toast" role="status"><span>✦</span>{toastMessage}</div>
{/if}

{#if newWorkspaceOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="workspace-modal-overlay" onclick={() => !isCreatingWorkspace && (newWorkspaceOpen = false)}></div>
  <dialog class="workspace-modal" open aria-labelledby="workspace-modal-title">
    <div class="workspace-modal__mark">✦</div>
    <p>{t('misc.reader_title')} / NEW SPACE</p>
    <h2 id="workspace-modal-title">{t('workspace.new_title')}</h2>
    <label for="workspace-name">{t('workspace.new_name')}</label>
    <input id="workspace-name" bind:value={newWorkspaceName} onkeydown={(event) => event.key === 'Enter' && createWorkspace()} placeholder={t('workspace.new_placeholder')} />
    {#if newWorkspaceError}<span class="workspace-modal__error">{newWorkspaceError}</span>{/if}
    <div class="workspace-modal__actions"><button class="btn-secondary" onclick={() => newWorkspaceOpen = false} disabled={isCreatingWorkspace}>{t('workspace.cancel')}</button><button class="btn-primary" onclick={createWorkspace} disabled={isCreatingWorkspace}>{isCreatingWorkspace ? '…' : t('workspace.new_choose')}</button></div>
  </dialog>
{/if}

<button class="md-reader__btn floating-gear" class:floating-gear--hidden={drawerOpen} tabindex={drawerOpen ? -1 : 0} aria-hidden={drawerOpen} onclick={() => drawerOpen = !drawerOpen} aria-label={t('settings.title')}>
  <span>⚙</span>
</button>

{#if globalSearchOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="command-overlay" transition:fade={{ duration: reducedMotion ? 0 : 160 }} onclick={closeGlobalSearch}></div>
  <dialog class="command-palette" transition:fly={{ y: -12, duration: reducedMotion ? 0 : 220, easing: cubicOut }} open aria-label={t('search.title')}>
    <div class="command-palette__input"><span>⌕</span><input bind:this={globalSearchInput} bind:value={globalSearchQuery} onkeydown={handleSearchKeys} role="combobox" aria-label={t('search.title')} aria-autocomplete="list" aria-expanded="true" aria-controls="search-results" aria-activedescendant={!isGlobalSearching && globalSearchResults.length ? `search-result-${selectedSearchIndex}` : undefined} placeholder={t('search.hint')} /><kbd>ESC</kbd></div>
    <div class="command-palette__results" id="search-results" role="listbox" aria-label={t('search.title')}>
      {#if globalSearchQuery.trim() === ''}
        <p class="command-palette__empty">{t('search.open_hint')}</p>
      {:else if isGlobalSearching}
        <p class="command-palette__empty">{t('search.loading')}</p>
      {:else if globalSearchError}
        <p class="command-palette__empty" role="alert">{t('search.failed')}</p>
      {:else if globalSearchResults.length === 0}
        <p class="command-palette__empty">{t('search.empty')}</p>
      {:else}
        {#each globalSearchResults as result, index}
          <button id={`search-result-${index}`} role="option" aria-selected={index === selectedSearchIndex} tabindex="-1" class:command-result--selected={index === selectedSearchIndex} class="command-result" onclick={() => { openSearchResult(result, globalSearchQuery); closeGlobalSearch(); }}>
            <span class="command-result__icon">✦</span><span class="command-result__body"><strong>{result.file_name}</strong><small>{result.snippet}</small></span><span class="command-result__line">L{result.line_number}</span>
          </button>
        {/each}
      {/if}
    </div>
  </dialog>
{/if}

{#if drawerOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="drawer-overlay" transition:fade={{ duration: reducedMotion ? 0 : 180 }} onclick={() => drawerOpen = false}></div>
<div class="drawer" transition:fly={{ x: 36, duration: reducedMotion ? 0 : 280, easing: cubicOut }}>
  <div class="drawer__top">
    <div class="drawer__heading"><p>{t('misc.reader_title')} / PERSONAL SPACE</p><h3>{t('settings.title')}</h3></div>
    <button class="drawer__close" onclick={() => drawerOpen = false} aria-label={t('settings.close')}>×</button>
  </div>
  <div class="drawer__actions">
    <button onclick={showNewWorkspace} class="btn-primary">{t('workspace.new')}</button>
    <button onclick={openFile} class="btn-secondary">{t('settings.open_file')}</button>
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
    <div class="appearance-picker" role="group" aria-label={t('settings.appearance')}>
      <p>{t('settings.appearance')}</p>
      <div class="appearance-picker__options">
        {#each appearanceThemes as theme}
          <button class="theme-choice" class:theme-choice--selected={currentTheme === theme} aria-pressed={currentTheme === theme} onclick={() => { currentTheme = theme; syncStore(); }}>
            <span class="theme-choice__preview" data-theme={theme} aria-hidden="true"><i></i><span><b>Aa</b><em></em><em></em></span><strong>{currentTheme === theme ? '✓' : ''}</strong></span>
            <span>{t(`theme.${theme}`)}</span>
          </button>
        {/each}
      </div>
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
    <label class="setting-switch"><span>{t('echo.setting')}</span><input type="checkbox" bind:checked={knowledgeEchoEnabled} onchange={handleKnowledgeEchoToggle} /><i></i></label>
    {#if hiddenEchoCount > 0}
      <button class="workspace-close-button echo-reset-button" onclick={resetKnowledgeEchoes}>{t('echo.restore_hidden')}<span>{hiddenEchoCount}</span></button>
    {/if}
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
    <div><button onclick={sendFeedback} class="text-button">{t('settings.feedback')}</button><button onclick={() => checkUpdate(true)} class="text-button" disabled={isCheckingUpdate}>{isCheckingUpdate ? t('update.checking') : t('update.check_btn')}</button></div>
  </div>
</div>
{/if}

<style>
  .reading-toolbar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 4px; min-height: 52px; padding: 8px 22px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 55%, transparent); background: color-mix(in srgb, var(--color-bg) 94%, transparent); backdrop-filter: blur(16px); }
  .reading-toolbar button { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; min-height: 34px; padding: 5px 8px; border: 0; border-radius: 9px; color: var(--color-text-secondary); background: transparent; font: 18px var(--font-family-body); cursor: pointer; transition: background .18s ease, color .18s ease; }
  .reading-toolbar button:hover:not(:disabled) { background: var(--color-primary-alpha-10); color: var(--color-primary); }
  .reading-toolbar button:disabled { opacity: .3; cursor: default; }
  .reading-toolbar__divider { width: 1px; height: 16px; margin: 0 5px; background: var(--color-border); }
  .reading-toolbar .reading-toolbar__return { margin-left: 8px; min-width: 0; font-size: 12px; color: var(--color-primary); }
  .reading-toolbar .reading-toolbar__search { margin-left: auto; gap: 10px; font-size: 12px; }
  .reading-toolbar__search kbd { color: var(--color-text-gray); font-size: 10px; }
  .command-result--selected { background: var(--color-primary-alpha-10) !important; box-shadow: inset 2px 0 var(--color-primary); }
  @media (max-width: 700px) { .reading-toolbar__search kbd { display: none; } .reading-toolbar { flex-wrap: wrap; } }
  .reading-toolbar + .welcome { min-height: calc(100vh - 52px); }
  :global(.md-reader__markdown-content :is(h1, h2, h3, h4, h5, h6)) { scroll-margin-top: 72px; }
  /* Shared rhythm for controls, panels and feedback. */
  :global(:root) { --motion-ease: cubic-bezier(.2, .8, .2, 1); }
  :global(button:focus-visible), :global(summary:focus-visible), :global(select:focus-visible) { outline: 2px solid var(--color-primary); outline-offset: 3px; }
  :global(button) { -webkit-tap-highlight-color: transparent; }
  .appearance-picker { padding-top: 12px; }
  .appearance-picker > p { margin: 0 0 10px; color: var(--color-text-secondary); font-size: 12px; }
  .appearance-picker__options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 9px; }
  .theme-choice { display: grid; gap: 7px; padding: 0; border: 0; color: var(--color-text-gray); background: transparent; font: 11px var(--font-family-body); cursor: pointer; text-align: left; }
  .theme-choice--selected { color: var(--color-primary); font-weight: 650; }
  .theme-choice__preview { position: relative; display: flex; width: 100%; height: 57px; overflow: hidden; border: 1px solid #dfe3e9; border-radius: 9px; color: #445063; background: #fff; transition: box-shadow .2s var(--motion-ease), transform .2s var(--motion-ease); }
  .theme-choice__preview > i { width: 22%; flex: none; border-right: 1px solid currentColor; opacity: .18; background: currentColor; }
  .theme-choice__preview > span { display: grid; align-content: center; gap: 4px; width: 62%; padding: 8px; }
  .theme-choice__preview b { font: 600 16px Georgia, serif; }
  .theme-choice__preview em { height: 2px; border-radius: 2px; background: currentColor; opacity: .3; }
  .theme-choice__preview em:last-child { width: 65%; }
  .theme-choice__preview strong { position: absolute; right: 5px; bottom: 4px; font-size: 11px; }
  .theme-choice__preview[data-theme='light'] { color: #326657; border-color: #dedfd7; background: #faf9f6; }
  .theme-choice__preview[data-theme='dark'] { color: #a3c8b5; border-color: #343d35; background: #1c231f; }
  .theme-choice__preview[data-theme='newsprint'] { color: #776048; border-color: #d7cdbb; background: #f2eddf; }
  .theme-choice__preview[data-theme='terminal'] { color: #88c0d0; border-color: #434c5e; background: #2e3440; }
  .theme-choice__preview[data-theme='glass'] { color: #10b981; border-color: #374151; background: linear-gradient(135deg, #0f172a, #23342f); }
  .theme-choice--selected .theme-choice__preview { box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-primary); }
  .theme-choice:hover .theme-choice__preview { transform: translateY(-2px); }
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
  .drawer__actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .drawer__actions .btn-primary:first-child { grid-column: span 2; }
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
  .settings-footer > div { display: flex; align-items: center; gap: 11px; }
  .settings-footer .text-button { letter-spacing: normal; text-transform: none; }
  .btn-primary, .btn-secondary {
    min-height: 42px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
    transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
  }
  .btn-primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-on-primary); }
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
    background: color-mix(in srgb, var(--color-primary) 30%, transparent);
  }
  
  .floating-gear { position: fixed; right: 28px; bottom: 28px; z-index: 100; display: grid; place-items: center; width: 46px; height: 46px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-side-bg); color: var(--color-text-primary); box-shadow: 0 12px 28px color-mix(in srgb, var(--color-text-primary) 12%, transparent); }
  .floating-gear span { font-size: 20px; transition: transform .35s ease; }
  .floating-gear:hover span { transform: rotate(55deg); }
  .workspace-modal-overlay { position: fixed; inset: 0; z-index: 130; background: color-mix(in srgb, var(--color-text-primary) 17%, transparent); backdrop-filter: blur(7px); }
  .workspace-modal { position: fixed; top: 50%; left: 50%; z-index: 131; display: flex; flex-direction: column; width: min(410px, calc(100vw - 32px)); padding: 28px; border: 1px solid var(--color-border); border-radius: 20px; color: var(--color-text-primary); background: color-mix(in srgb, var(--color-side-bg) 95%, transparent); box-shadow: 0 24px 70px color-mix(in srgb, var(--color-text-primary) 25%, transparent); transform: translate(-50%, -50%); animation: modalIn .24s cubic-bezier(.2,.8,.2,1); backdrop-filter: blur(30px) saturate(150%); }
  .workspace-modal__mark { display: grid; place-items: center; width: 38px; height: 38px; margin-bottom: 18px; border-radius: 12px; color: var(--color-primary); background: var(--color-primary-alpha-10); font-size: 18px; }
  .workspace-modal > p { margin: 0 0 7px; color: var(--color-primary); font-size: 10px; font-weight: 750; letter-spacing: .14em; }
  .workspace-modal h2 { margin: 0 0 24px; font-size: 25px; letter-spacing: -.04em; }
  .workspace-modal label { margin-bottom: 7px; color: var(--color-text-secondary); font-size: 12px; font-weight: 650; }
  .workspace-modal input { min-height: 42px; padding: 0 11px; border: 1px solid var(--color-border); border-radius: 10px; outline: 0; color: var(--color-text-primary); background: var(--color-bg); font: 13px var(--font-family-body); }
  .workspace-modal input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-alpha-10); }
  .workspace-modal__error { margin-top: 8px; color: var(--color-danger); font-size: 11px; }
  .workspace-modal__actions { display: grid; grid-template-columns: .75fr 1.25fr; gap: 9px; margin-top: 22px; }
  @keyframes modalIn { from { opacity: 0; transform: translate(-50%, calc(-50% + 9px)) scale(.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
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
  .rediscovery-reset { margin-top: 12px; padding: 0; border: 0; color: var(--color-text-gray); background: transparent; cursor: pointer; font-size: 9px; }
  .rediscovery-reset:hover { color: var(--color-primary); }
  .workspace-card--daily-echo { position: relative; grid-column: span 2; min-height: 0; padding: clamp(24px, 4vw, 38px); overflow: hidden; border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border)); background: linear-gradient(135deg, color-mix(in srgb, var(--color-bg) 92%, transparent), color-mix(in srgb, var(--color-primary-alpha-10) 72%, var(--color-bg))); }
  .workspace-card--daily-echo::before { position: absolute; top: -118px; right: -70px; width: 290px; height: 290px; border: 1px solid color-mix(in srgb, var(--color-primary) 12%, transparent); border-radius: 50%; content: ''; box-shadow: 0 0 0 42px color-mix(in srgb, var(--color-primary) 3%, transparent), 0 0 0 84px color-mix(in srgb, var(--color-important) 2%, transparent); pointer-events: none; }
  .daily-echo__heading { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .daily-echo__heading > div { display: grid; gap: 4px; }
  .daily-echo__heading h3 { margin: 0; color: var(--color-text-primary); font-size: clamp(20px, 2.8vw, 28px); font-weight: 680; letter-spacing: -.035em; }
  .daily-echo__date { color: var(--color-primary); font-size: 8px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
  .daily-echo__local { display: flex; align-items: center; gap: 5px; padding: 5px 8px; border: 1px solid color-mix(in srgb, var(--color-primary) 18%, var(--color-border)); border-radius: 999px; color: var(--color-text-gray); background: color-mix(in srgb, var(--color-bg) 64%, transparent); font-size: 8px; font-weight: 720; letter-spacing: .08em; }
  .daily-echo__local i { color: var(--color-success); font-size: 5px; font-style: normal; box-shadow: 0 0 7px color-mix(in srgb, var(--color-success) 60%, transparent); }
  .daily-echo { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) 164px; gap: clamp(24px, 5vw, 52px); margin-top: 26px; }
  .daily-echo__content { min-width: 0; }
  .daily-echo__reason { margin: 0 0 10px; color: var(--color-primary); font-size: 9px; font-weight: 760; letter-spacing: .04em; }
  .daily-echo__document { display: grid; width: 100%; gap: 13px; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
  .daily-echo__document strong { overflow: hidden; color: var(--color-text-primary); font-size: clamp(18px, 2.3vw, 24px); font-weight: 690; letter-spacing: -.035em; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
  .daily-echo__document blockquote { position: relative; display: -webkit-box; max-width: 570px; margin: 0; padding-left: 18px; overflow: hidden; border: 0; color: var(--color-text-secondary); font-size: 13px; line-height: 1.75; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .daily-echo__document blockquote::before { position: absolute; top: 3px; bottom: 3px; left: 0; width: 2px; border-radius: 99px; background: linear-gradient(var(--color-primary), color-mix(in srgb, var(--color-important) 70%, var(--color-primary))); content: ''; }
  .daily-echo__path { margin: 12px 0 0; overflow: hidden; color: var(--color-text-gray); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .daily-echo__preview { display: block; height: 56px; max-width: 570px; border-radius: 9px; }
  .daily-echo__preview--loading { background: linear-gradient(100deg, var(--color-primary-alpha-10) 20%, color-mix(in srgb, var(--color-bg) 80%, transparent) 40%, var(--color-primary-alpha-10) 60%); background-size: 220% 100%; animation: echoShimmer 1.4s linear infinite; }
  .daily-echo__actions { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-end; gap: 7px; }
  .daily-echo__open { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--color-primary) 42%, var(--color-border)); border-radius: 10px; color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-alpha-10) 70%, var(--color-bg)); cursor: pointer; font: 700 10px var(--font-family-body); }
  .daily-echo__open:hover { background: var(--color-primary-alpha-10); box-shadow: 0 9px 20px color-mix(in srgb, var(--color-primary) 10%, transparent); transform: translateY(-1px); }
  .daily-echo__helpful { width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; color: var(--color-text-gray); background: transparent; cursor: pointer; font: 9px var(--font-family-body); text-align: left; }
  .daily-echo__helpful:hover, .daily-echo__helpful--saved { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-alpha-10) 68%, transparent); }
  .daily-echo__add-context { padding: 2px 10px 5px; border: 0; color: var(--color-text-gray); background: transparent; cursor: pointer; font: 8px var(--font-family-body); text-align: left; }
  .daily-echo__add-context:hover { color: var(--color-primary); }
  .daily-echo__menu { position: relative; }
  .daily-echo__menu summary { width: max-content; padding: 5px 7px; border-radius: 6px; color: var(--color-text-gray); cursor: pointer; font-size: 10px; list-style: none; letter-spacing: .06em; }
  .daily-echo__menu summary::-webkit-details-marker { display: none; }
  .daily-echo__menu summary:hover, .daily-echo__menu[open] summary { color: var(--color-primary); background: var(--color-primary-alpha-10); }
  .daily-echo__menu > div { position: absolute; right: 0; bottom: 28px; z-index: 4; display: grid; width: 164px; padding: 5px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-side-bg); box-shadow: 0 15px 35px color-mix(in srgb, var(--color-text-primary) 16%, transparent); }
  .daily-echo__menu button { padding: 8px 9px; border: 0; border-radius: 7px; color: var(--color-text-secondary); background: transparent; cursor: pointer; font: 10px var(--font-family-body); text-align: left; }
  .daily-echo__menu button:hover { color: var(--color-text-primary); background: var(--color-primary-alpha-10); }
  .daily-echo__reflection { grid-column: 1 / -1; display: grid; gap: 8px; padding-top: 18px; border-top: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent); }
  .daily-echo__reflection label { color: var(--color-text-secondary); font-size: 10px; font-weight: 680; }
  .daily-echo__reflection textarea { min-height: 72px; padding: 11px 12px; resize: vertical; border: 1px solid var(--color-border); border-radius: 10px; outline: none; color: var(--color-text-primary); background: color-mix(in srgb, var(--color-bg) 80%, transparent); font: 11px/1.6 var(--font-family-body); }
  .daily-echo__reflection textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-alpha-10); }
  .daily-echo__reflection > div { display: flex; justify-content: flex-end; gap: 7px; }
  .daily-echo__reflection button { padding: 7px 10px; border: 0; border-radius: 7px; color: var(--color-text-gray); background: transparent; cursor: pointer; font: 9px var(--font-family-body); }
  .daily-echo__reflection .daily-echo__reflection-save { color: var(--color-on-primary); background: var(--color-primary); }
  .daily-echo__empty { margin-top: 28px; }
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
  .md-reader__body { container-name: reading-area; container-type: inline-size; }
  .reading-shell { width: 100%; }
  .reading-shell > .md-reader__markdown-content { width: 100%; }
  .knowledge-echo { position: fixed; right: 24px; bottom: 86px; z-index: 76; isolation: isolate; width: min(320px, calc(100vw - 40px)); max-height: calc(100vh - 118px); margin: 0; overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); border-radius: 19px; color: var(--color-text-primary); background: linear-gradient(145deg, color-mix(in srgb, var(--color-side-bg) 94%, transparent), color-mix(in srgb, var(--color-primary-alpha-10) 68%, var(--color-bg))); box-shadow: 0 20px 48px color-mix(in srgb, var(--color-text-primary) 13%, transparent); backdrop-filter: blur(24px) saturate(135%); animation: echoEnter .42s cubic-bezier(.16,1,.3,1); }
  .knowledge-echo::before { position: absolute; top: -92px; right: -72px; z-index: -1; width: 210px; height: 210px; border: 1px solid color-mix(in srgb, var(--color-primary) 13%, transparent); border-radius: 50%; content: ''; box-shadow: 0 0 0 32px color-mix(in srgb, var(--color-primary) 4%, transparent), 0 0 0 66px color-mix(in srgb, var(--color-important) 3%, transparent); pointer-events: none; }
  .knowledge-echo__toggle { display: flex; align-items: center; width: 100%; gap: 10px; padding: 13px 14px; border: 0; color: var(--color-text-primary); background: transparent; cursor: pointer; text-align: left; }
  .knowledge-echo__symbol { display: grid; place-items: center; width: 31px; height: 31px; flex: none; border: 1px solid color-mix(in srgb, var(--color-primary) 26%, var(--color-border)); border-radius: 50%; color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-alpha-10) 75%, var(--color-bg)); font-size: 19px; box-shadow: inset 0 0 0 5px color-mix(in srgb, var(--color-bg) 60%, transparent); }
  .knowledge-echo__toggle > span:nth-child(2) { display: grid; gap: 1px; }
  .knowledge-echo__toggle small { color: var(--color-text-gray); font-size: 7px; font-weight: 800; letter-spacing: .16em; }
  .knowledge-echo__toggle strong { font-size: 11px; font-weight: 720; letter-spacing: .01em; }
  .knowledge-echo__toggle > i { margin-left: auto; color: var(--color-text-gray); font: 17px/1 var(--font-family-body); font-style: normal; }
  .knowledge-echo--collapsed { width: auto; max-width: min(260px, calc(100vw - 40px)); border-radius: 15px; box-shadow: 0 12px 30px color-mix(in srgb, var(--color-text-primary) 12%, transparent); }
  .knowledge-echo--collapsed .knowledge-echo__toggle { min-width: 190px; padding: 9px 11px; }
  .knowledge-echo--collapsed .knowledge-echo__symbol { width: 28px; height: 28px; font-size: 16px; }
  .knowledge-echo--compact.knowledge-echo--collapsed { animation: echoPillIn .38s cubic-bezier(.16,1,.3,1), echoBreathe 2.2s ease .55s 1; }
  .knowledge-echo__body { max-height: calc(100vh - 180px); padding: 2px 18px 16px; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent); }
  .knowledge-echo__meta { display: flex; align-items: center; justify-content: space-between; min-height: 38px; gap: 10px; color: var(--color-primary); font-size: 8px; font-weight: 780; letter-spacing: .1em; text-transform: uppercase; }
  .knowledge-echo__meta button { display: flex; align-items: center; gap: 6px; padding: 4px 7px; border: 1px solid color-mix(in srgb, var(--color-primary) 15%, var(--color-border)); border-radius: 999px; color: var(--color-text-gray); background: color-mix(in srgb, var(--color-bg) 60%, transparent); cursor: pointer; font: 8px var(--font-family-body); }
  .knowledge-echo__meta button:hover { border-color: var(--color-primary); color: var(--color-primary); }
  .knowledge-echo__meta i { font-style: normal; font-size: 11px; }
  .knowledge-echo__document { display: block; width: 100%; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
  .knowledge-echo__document strong { display: -webkit-box; overflow: hidden; font-size: 18px; font-weight: 675; letter-spacing: -.035em; line-height: 1.16; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .knowledge-echo__document small { display: block; margin-top: 4px; color: var(--color-text-gray); font-size: 9px; }
  .knowledge-echo__document blockquote { position: relative; margin: 14px 0 12px; padding: 0 0 0 15px; border: 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.65; }
  .knowledge-echo__document blockquote::before { position: absolute; top: 2px; bottom: 2px; left: 0; width: 2px; border-radius: 99px; background: linear-gradient(var(--color-primary), color-mix(in srgb, var(--color-important) 70%, var(--color-primary))); content: ''; }
  .knowledge-echo__terms { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 13px; }
  .knowledge-echo__terms span { max-width: 140px; padding: 3px 7px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-primary) 16%, var(--color-border)); border-radius: 999px; color: var(--color-primary); background: color-mix(in srgb, var(--color-bg) 62%, transparent); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
  .knowledge-echo__open { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--color-primary) 42%, var(--color-border)); border-radius: 10px; color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-alpha-10) 74%, var(--color-bg)); cursor: pointer; font: 700 10px var(--font-family-body); transition: transform .18s ease, background .18s ease, box-shadow .18s ease; }
  .knowledge-echo__open:hover { background: var(--color-primary-alpha-10); box-shadow: 0 9px 20px color-mix(in srgb, var(--color-primary) 11%, transparent); transform: translateY(-1px); }
  .knowledge-echo__open span { font-size: 13px; }
  .knowledge-echo__feedback { display: flex; align-items: center; gap: 3px; margin-top: 8px; }
  .knowledge-echo__feedback button { padding: 5px 6px; border: 0; border-radius: 6px; color: var(--color-text-gray); background: transparent; cursor: pointer; font: 8px var(--font-family-body); }
  .knowledge-echo__feedback button:hover { color: var(--color-primary); background: var(--color-primary-alpha-10); }
  .knowledge-echo__feedback button:last-child { margin-left: auto; }
  .knowledge-echo__privacy { display: flex; align-items: center; gap: 5px; margin: 8px 1px 0; color: var(--color-text-gray); font-size: 7px; }
  .knowledge-echo__privacy span { color: var(--color-success); font-size: 5px; box-shadow: 0 0 7px color-mix(in srgb, var(--color-success) 60%, transparent); }
  .knowledge-echo__loading { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 18px; border-top: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent); }
  .knowledge-echo__loading span { height: 42px; border-radius: 9px; background: linear-gradient(100deg, var(--color-primary-alpha-10) 20%, color-mix(in srgb, var(--color-bg) 80%, transparent) 40%, var(--color-primary-alpha-10) 60%); background-size: 220% 100%; animation: echoShimmer 1.4s linear infinite; }
  .knowledge-echo__loading p { grid-column: 1 / -1; margin: 5px 0 0; color: var(--color-text-gray); font-size: 9px; text-align: center; }
  .echo-reset-button span { display: grid; place-items: center; min-width: 20px; height: 20px; border-radius: 99px; color: var(--color-primary); background: var(--color-primary-alpha-10); font-size: 9px; }
  @keyframes echoEnter { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes echoPillIn { from { opacity: 0; transform: translateY(7px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes echoBreathe { 0%, 100% { box-shadow: 0 12px 30px color-mix(in srgb, var(--color-text-primary) 12%, transparent); } 45% { box-shadow: 0 12px 34px color-mix(in srgb, var(--color-primary) 27%, transparent), 0 0 0 5px color-mix(in srgb, var(--color-primary) 7%, transparent); } }
  @keyframes echoShimmer { to { background-position: -220% 0; } }
  @container reading-area (min-width: 1100px) {
    .reading-context { max-width: 1160px; }
    .reading-shell--with-echo { display: grid; grid-template-columns: minmax(0, 820px) 278px; align-items: start; width: min(1160px, calc(100% - 48px)); gap: 28px; margin: 0 auto; }
    .reading-shell--with-echo > .md-reader__markdown-content { min-width: 0; max-width: 820px; margin: 0; padding-right: 36px; padding-left: 36px; }
    .reading-shell--with-echo .knowledge-echo { position: sticky; top: 24px; right: auto; bottom: auto; z-index: 4; width: 278px; max-height: none; margin: 24px 0 70px; }
    .reading-shell--with-echo .knowledge-echo__body { max-height: none; overflow: visible; }
    .reading-shell--with-echo .knowledge-echo--collapsed { width: 210px; margin-left: auto; }
  }
  .reading-progress { position: fixed; top: 0; left: var(--side-width, 0); z-index: 110; width: var(--progress); height: 2px; background: var(--color-primary); box-shadow: 0 0 12px color-mix(in srgb, var(--color-primary) 65%, transparent); transition: width .18s linear; }
  .app-toast { position: fixed; bottom: 28px; left: 50%; z-index: 140; display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); border-radius: 11px; color: var(--color-text-primary); background: color-mix(in srgb, var(--color-side-bg) 95%, transparent); box-shadow: 0 14px 32px color-mix(in srgb, var(--color-text-primary) 18%, transparent); font-size: 12px; transform: translateX(-50%); animation: toastIn .25s cubic-bezier(.2,.8,.2,1); backdrop-filter: blur(18px); }
  .app-toast span { color: var(--color-primary); }
  :global(mark.search-highlight) { border-radius: 3px; color: inherit; background: var(--color-mark); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-mark) 55%, transparent); transition: background .7s ease, box-shadow .7s ease; }
  :global(mark.search-highlight--soft) { background: color-mix(in srgb, var(--color-mark) 28%, transparent); box-shadow: none; }
  @keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px) scale(.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
  /* Quiet surfaces, with movement concentrated on interactive elements. */
  .drawer { top: 12px; right: 12px; bottom: 12px; width: min(390px, calc(100vw - 24px)); height: auto; border: 1px solid var(--color-border); border-radius: 24px; padding: 27px 24px 22px; gap: 20px; box-shadow: 0 24px 80px color-mix(in srgb, var(--color-text-primary) 16%, transparent); }
  .drawer-overlay { background: color-mix(in srgb, var(--color-text-primary) 12%, transparent); backdrop-filter: blur(4px); }
  .floating-gear--hidden { opacity: 0; pointer-events: none; }
  .settings-section { padding: 16px; gap: 5px; border-color: color-mix(in srgb, var(--color-border) 60%, transparent); border-radius: 16px; }
  .settings-section__title { font-size: 11px; }
  .setting-row, .setting-switch { min-height: 42px; }
  .setting-switch input:focus-visible + i { outline: 2px solid var(--color-primary); outline-offset: 3px; }
  .setting-switch i::after { transition: transform .24s var(--motion-ease); }
  .setting-hint { font-size: 11px; }
  .sidebar-tabs { position: relative; isolation: isolate; padding: 4px; border-color: transparent; background: color-mix(in srgb, var(--color-text-primary) 4%, transparent); }
  .sidebar-tabs::before { position: absolute; z-index: -1; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); border: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent); border-radius: 8px; background: var(--color-bg); box-shadow: 0 2px 5px color-mix(in srgb, var(--color-text-primary) 5%, transparent); content: ''; transition: transform .26s var(--motion-ease); }
  .sidebar-tabs--toc::before { transform: translateX(100%); }
  .sidebar-tabs button.active, .sidebar-tabs button:hover { background: transparent; }
  .workspace-nav__mark { width: 33px; height: 33px; border-radius: 11px; }
  .workspace-nav strong { font-size: 13px; }
  .workspace-nav__arrow { transition: transform .2s var(--motion-ease); }
  .workspace-nav:hover .workspace-nav__arrow { transform: translate(2px, -2px); }
  .pin-button:focus-visible, .file-item:focus-within .pin-button { opacity: 1; }
  .welcome__orb { filter: blur(80px); opacity: .22; }
  .welcome__mark { border-radius: 24px; transform: rotate(-5deg); }
  .workspace-home { padding-top: clamp(48px, 8vh, 86px); }
  .workspace-grid { width: min(920px, 100%); gap: 18px; }
  .workspace-card { border-color: color-mix(in srgb, var(--color-border) 65%, transparent); box-shadow: 0 4px 18px color-mix(in srgb, var(--color-text-primary) 3%, transparent); border-radius: 20px; animation: surfaceArrive .45s var(--motion-ease) both; }
  .workspace-card:nth-child(2) { animation-delay: 45ms; }
  .workspace-card:nth-child(3) { animation-delay: 90ms; }
  .workspace-card:nth-child(4) { animation-delay: 135ms; }
  .workspace-card--daily-echo { border-color: color-mix(in srgb, var(--color-primary) 27%, var(--color-border)); background: linear-gradient(125deg, var(--color-bg), color-mix(in srgb, var(--color-primary-alpha-10) 60%, var(--color-bg))); }
  .workspace-card--continue { border-color: color-mix(in srgb, var(--color-border) 65%, transparent); background: color-mix(in srgb, var(--color-bg) 92%, transparent); }
  .daily-echo__date { font-size: 10px; letter-spacing: .12em; }
  .daily-echo__reason { font-size: 11px; }
  .daily-echo__document strong { white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
  .daily-echo__document blockquote { font-size: 14px; }
  .daily-echo__path { font-size: 11px; }
  .daily-echo__open { min-height: 42px; font-size: 12px; }
  .daily-echo__open span { transition: transform .22s var(--motion-ease); }
  .daily-echo__open:hover span { transform: translateX(3px); }
  .daily-echo__helpful { min-height: 36px; font-size: 11px; }
  .daily-echo__add-context { font-size: 10px; }
  .document-list button { padding: 10px; transition: background .18s ease, transform .2s var(--motion-ease); }
  .document-list button:hover { transform: translateX(3px); }
  .document-list button small { font-size: 11px; }
  .reading-context { border-color: transparent; box-shadow: none; background: color-mix(in srgb, var(--color-side-bg) 85%, transparent); border-radius: 12px; }
  .reading-context button { min-height: 32px; }
  .daily-echo__open, .daily-echo__helpful, .reading-context button, .floating-gear { transition: background .2s ease, color .2s ease, box-shadow .2s ease, transform .2s var(--motion-ease); }
  .btn-primary:active, .btn-secondary:active, .daily-echo__open:active, .floating-gear:active { transform: scale(.97); }
  .command-palette { animation: none; border-radius: 22px; }
  .command-palette__input { padding: 19px; }
  .command-result { padding: 13px; }
  .command-result__body strong { font-size: 13px; }
  .command-result__body small { font: 12px/1.5 var(--font-family-body); }
  @keyframes surfaceArrive { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @container reading-area (max-width: 620px) {
    .workspace-grid { grid-template-columns: minmax(0, 1fr); }
    .workspace-card--continue, .workspace-card--daily-echo { grid-column: span 1; }
    .daily-echo { grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .daily-echo__actions { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; }
    .daily-echo__open { width: 100%; }
    .daily-echo__helpful { width: auto; }
    .daily-echo__menu { margin-left: auto; }
    .workspace-home { padding: 48px 24px 80px; }
    .onboarding__steps { grid-template-columns: 1fr; }
    .onboarding__step + .onboarding__step { border-left: 0; border-top: 1px solid var(--color-border); }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(*), :global(*::before), :global(*::after) { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
  @media (max-width: 760px) { .workspace-grid { grid-template-columns: 1fr; max-width: 520px; } .workspace-card--continue, .workspace-card--daily-echo { grid-column: span 1; } .daily-echo { grid-template-columns: 1fr; gap: 20px; } .daily-echo__actions { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; } .daily-echo__open { grid-column: 1 / -1; } .daily-echo__helpful { text-align: left; } .daily-echo__add-context { padding: 6px; white-space: nowrap; } .daily-echo__menu > div { right: 0; bottom: auto; top: 28px; } .reading-context { padding: 0 28px; } .knowledge-echo { right: 18px; bottom: 78px; } .knowledge-echo__feedback { flex-wrap: wrap; } .onboarding__steps { grid-template-columns: 1fr; } .onboarding__step + .onboarding__step { border-top: 1px solid var(--color-border); border-left: 0; } }
  @media (max-width: 560px) { .welcome__actions { flex-direction: column; width: 100%; max-width: 300px; } .workspace-home { padding: 60px 28px; } .workspace-home .welcome__subtitle { max-width: 100%; } .floating-gear { right: 18px; bottom: 18px; } .knowledge-echo--compact:not(.knowledge-echo--collapsed) { right: 0; bottom: 0; z-index: 105; width: 100%; max-height: min(58vh, 520px); border-radius: 22px 22px 0 0; box-shadow: 0 -18px 55px color-mix(in srgb, var(--color-text-primary) 18%, transparent); animation: echoSheetIn .34s cubic-bezier(.16,1,.3,1); } .knowledge-echo--compact:not(.knowledge-echo--collapsed) .knowledge-echo__body { max-height: calc(min(58vh, 520px) - 58px); } .knowledge-echo--collapsed { right: 18px; bottom: 78px; } }
  @keyframes echoSheetIn { from { opacity: 0; transform: translateY(34px); } to { opacity: 1; transform: translateY(0); } }
</style>
