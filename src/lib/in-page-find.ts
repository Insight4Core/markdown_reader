/**
 * In-page find helpers (FR-1).
 * Pure text matching & index cycling stay DOM-free so they can be verified with node:test;
 * DOM highlighting uses TreeWalker and restores clean text nodes on clear.
 */

export interface TextMatchRange {
  start: number;
  end: number;
}

export const FIND_SEED_MAX_LENGTH = 80;

const SKIP_ANCESTOR_SELECTOR = 'script, style, noscript, button, .md-reader__btn, .mermaid-diagram, svg, .katex-mathml, .sr-only';

/** Case-insensitive literal substring matches, safe for regex metacharacters and Unicode. */
export function findMatchRanges(text: string, query: string): TextMatchRange[] {
  if (!text || !query || query.trim() === '') return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'giu');
  const ranges: TextMatchRange[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    const length = match[0].length;
    if (length > 0) ranges.push({ start, end: start + length });
  }
  return ranges;
}

/** Cycle through matches (+1 next, -1 previous), wrapping at boundaries. Returns -1 when empty. */
export function nextMatchIndex(current: number, total: number, delta: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0 || current >= total) return delta > 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

/** Accept a single-line short text selection as the initial find query; reject multiline or long text. */
export function sanitizeFindSeed(selected: string): string {
  if (!selected) return '';
  if (/[\r\n]/.test(selected)) return '';
  const trimmed = selected.trim();
  if (!trimmed || trimmed.length > FIND_SEED_MAX_LENGTH) return '';
  return trimmed;
}

/** Remove all in-page find highlight wrappers and merge adjacent text nodes back together. */
export function clearInPageHighlights(root: Element | null): void {
  if (!root) return;
  const parents = new Set<Node>();
  root.querySelectorAll('mark.in-page-find').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    parents.add(parent);
    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
  });
  parents.forEach(parent => parent.normalize());
}

/** Highlight every literal match in visible article text and return the ordered <mark> elements. */
export function applyInPageHighlights(root: Element | null, query: string): HTMLElement[] {
  clearInPageHighlights(root);
  if (!root || !query || query.trim() === '') return [];

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.textContent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_ANCESTOR_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current: Node | null;
  while ((current = walker.nextNode())) {
    textNodes.push(current as Text);
  }

  const marks: HTMLElement[] = [];
  for (const textNode of textNodes) {
    const source = textNode.textContent || '';
    const ranges = findMatchRanges(source, query);
    if (ranges.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) {
        fragment.append(source.slice(cursor, range.start));
      }
      const mark = document.createElement('mark');
      mark.className = 'in-page-find';
      mark.textContent = source.slice(range.start, range.end);
      fragment.append(mark);
      marks.push(mark);
      cursor = range.end;
    }
    if (cursor < source.length) {
      fragment.append(source.slice(cursor));
    }
    textNode.replaceWith(fragment);
  }

  return marks;
}

/** Visually activate one match and scroll it into the center of the viewport. */
export function setActiveHighlight(marks: HTMLElement[], activeIndex: number, reducedMotion = false): void {
  for (let index = 0; index < marks.length; index += 1) {
    marks[index].classList.toggle('in-page-find--active', index === activeIndex);
  }
  const active = marks[activeIndex];
  if (active && active.isConnected) {
    active.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
  }
}
