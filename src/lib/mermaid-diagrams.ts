import type MarkdownIt from 'markdown-it';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render ```mermaid fences as placeholders. Mermaid 10+ only renders asynchronously, so it cannot
 * run inside markdown-it's synchronous render; renderMermaidDiagrams draws them once on the page.
 * The placeholder keeps the source as text, so the note still makes sense if drawing fails.
 */
export function markdownItMermaid(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!.bind(md.renderer.rules);
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    if (token.info.trim().split(/\s+/)[0] !== 'mermaid') return fence(tokens, index, options, env, self);
    return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
  };
}

type MermaidTheme = 'default' | 'dark';

const CACHE_LIMIT = 60;
// Re-opening a note, live reloads and theme switches reuse drawings instead of redrawing.
const cache = new Map<string, string | Error>();
let renderCount = 0;
// Mermaid's theme is global, so drawings run one at a time.
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function remember(key: string, value: string | Error) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

async function drawSvg(source: string, theme: MermaidTheme): Promise<string> {
  const key = `${theme}\n${source}`;
  const cached = cache.get(key);
  if (cached instanceof Error) throw cached;
  if (cached !== undefined) return cached;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
    // Plain SVG text instead of HTML labels, so diagrams can be copied as images and printed.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  });
  const id = `pyrus-mermaid-${++renderCount}`;
  try {
    // Check the syntax first: on a syntax error mermaid.render draws its own error graphic
    // and leaves it at the end of the page.
    await mermaid.parse(source);
    const { svg } = await mermaid.render(id, source);
    remember(key, svg);
    return svg;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    remember(key, failure);
    throw failure;
  } finally {
    // Mermaid draws in temporary elements attached to <body>; never leave them behind.
    for (const leftover of [`d${id}`, `i${id}`, id]) {
      const element = document.getElementById(leftover);
      if (element?.parentElement === document.body) element.remove();
    }
  }
}

export interface DiagramOptions {
  /** The reading theme is dark. Paper and pasted copies always get a light diagram. */
  dark: boolean;
  /** Shown above the source when a diagram cannot be drawn. */
  errorLabel: string;
}

/** Draw every Mermaid diagram in the article, or redraw them after the theme changed. */
export function renderMermaidDiagrams(container: Element, options: DiagramOptions): Promise<void> {
  for (const placeholder of Array.from(container.querySelectorAll<HTMLElement>('pre.mermaid'))) {
    const slot = document.createElement('div');
    slot.className = 'mermaid-diagram mermaid-diagram--pending';
    slot.dataset.mermaidSource = placeholder.textContent ?? '';
    placeholder.replaceWith(slot);
  }
  const slots = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-diagram[data-mermaid-source]'));
  if (slots.length === 0) return Promise.resolve();
  const screenTheme: MermaidTheme = options.dark ? 'dark' : 'default';

  return serialized(async () => {
    for (const slot of slots) {
      if (!slot.isConnected || slot.dataset.renderedTheme === screenTheme) continue;
      const source = slot.dataset.mermaidSource ?? '';
      try {
        const screen = await drawSvg(source, screenTheme);
        const paper = screenTheme === 'default' ? screen : await drawSvg(source, 'default');
        slot.innerHTML = screen === paper
          ? `<div class="mermaid-diagram__both">${screen}</div>`
          : `<div class="mermaid-diagram__screen">${screen}</div><div class="mermaid-diagram__paper">${paper}</div>`;
        slot.classList.remove('mermaid-diagram--failed');
      } catch {
        const note = document.createElement('p');
        note.className = 'mermaid-diagram__error';
        note.textContent = options.errorLabel;
        const code = document.createElement('pre');
        code.className = 'mermaid-diagram__source';
        code.textContent = source;
        slot.replaceChildren(note, code);
        slot.classList.add('mermaid-diagram--failed');
      }
      slot.dataset.renderedTheme = screenTheme;
      slot.classList.remove('mermaid-diagram--pending');
    }
  });
}
