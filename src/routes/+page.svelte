<script lang="ts">
  import { open, ask } from '@tauri-apps/plugin-dialog';
  import { readTextFile, watch } from '@tauri-apps/plugin-fs';
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
  }

  async function openFile() {
    drawerOpen = false; // Close drawer immediately before opening dialog
    
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]
    });
    
    if (selected) {
      filePath = selected as string;
      getCurrentWindow().setTitle(filePath.split(/[/\\]/).pop() || 'Markdown Reader');
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
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
</script>


<div class="md-reader" ondblclick={() => { if (!filePath) openFile(); }}>
  <div class="md-reader__side">
    <div style="font-weight: bold; padding: 15px 22px; font-size: 16px;">大纲 (TOC)</div>
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
  <button onclick={openFile} class="btn-primary">打开 Markdown 文件</button>
  <hr/>
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
</style>
