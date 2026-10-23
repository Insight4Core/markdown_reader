export interface ReadingProgress { position: number; total: number; updatedAt: number }
export interface SearchHit { file_path: string; file_name: string; line_number: number; snippet: string }
export interface SearchDocument extends SearchHit { matches: SearchHit[] }

export function readingPercent(progress?: ReadingProgress): number {
  if (!progress || progress.total <= 1) return 0;
  return Math.max(0, Math.min(100, Math.round(progress.position / progress.total * 100)));
}

export function unfinishedDocuments<T extends { path: string }>(documents: T[], progress: Record<string, ReadingProgress>, limit = 5): T[] {
  return documents.filter(document => {
    const percent = readingPercent(progress[document.path]);
    return percent > 0 && percent < 100;
  }).sort((a, b) => progress[b.path].updatedAt - progress[a.path].updatedAt).slice(0, limit);
}

export function groupSearchHits(hits: SearchHit[]): SearchDocument[] {
  const documents = new Map<string, SearchDocument>();
  for (const hit of hits) {
    const existing = documents.get(hit.file_path);
    if (existing) existing.matches.push(hit);
    else documents.set(hit.file_path, { ...hit, matches: [hit] });
  }
  return [...documents.values()];
}

/** Return text parts, never HTML. The view renders matches with native <mark> tags. */
export function highlightParts(text: string, query: string): { text: string; matched: boolean }[] {
  const term = query.trim();
  if (!term) return [{ text, matched: false }];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, 'giu');
  const parts: { text: string; matched: boolean }[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    if (index > end) parts.push({ text: text.slice(end, index), matched: false });
    parts.push({ text: match[0], matched: true });
    end = index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), matched: false });
  return parts;
}

export function documentContext(path: string, roots: string[]): string {
  const normalized = path.replace(/\\/g, '/');
  const root = roots.map(value => value.replace(/\\/g, '/').replace(/\/$/, ''))
    .filter(value => normalized.startsWith(`${value}/`)).sort((a, b) => b.length - a.length)[0];
  if (root) return `${root.split('/').pop()} / ${normalized.slice(root.length + 1)}`;
  return normalized.split('/').slice(-2).join(' / ');
}
