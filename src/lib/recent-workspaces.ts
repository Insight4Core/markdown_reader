/**
 * Recent workspaces history helpers (FR-5).
 */

export const RECENT_WORKSPACES_LIMIT = 8;

/** Normalize separators and strip trailing slashes (while keeping filesystem roots intact). */
export function normalizeWorkspacePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  const unified = trimmed.replace(/\\/g, '/');
  if (unified === '/') return '/';
  if (/^[a-zA-Z]:\/+$/.test(unified)) return `${unified.slice(0, 2)}/`;
  return unified.replace(/\/+$/, '');
}

/** Canonical key for cross-platform deduplication (case-insensitive for Windows drive paths). */
function workspaceKey(path: string): string {
  const normalized = normalizeWorkspacePath(path);
  return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

export function workspaceDisplayName(path: string): string {
  const normalized = normalizeWorkspacePath(path);
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts.pop() || normalized;
}

export function workspaceParentPath(path: string): string {
  const normalized = normalizeWorkspacePath(path);
  if (!normalized) return '';
  const slash = normalized.lastIndexOf('/');
  if (slash <= 0) return normalized;
  return normalized.slice(0, slash);
}

/** Put `path` at the front, deduplicating normalized equivalents and capping the list length. */
export function recordRecentWorkspace(
  list: string[],
  path: string,
  limit = RECENT_WORKSPACES_LIMIT,
): string[] {
  const trimmed = path.trim();
  if (!trimmed) return list.slice(0, limit);
  const targetKey = workspaceKey(trimmed);
  const filtered = list.filter(item => item.trim() && workspaceKey(item) !== targetKey);
  return [trimmed, ...filtered].slice(0, Math.max(1, limit));
}

export function removeRecentWorkspace(list: string[], path: string): string[] {
  const targetKey = workspaceKey(path);
  if (!targetKey) return [...list];
  return list.filter(item => workspaceKey(item) !== targetKey);
}

/** Validate persisted list from settings and ensure the active folder (if any) is recorded first. */
export function restoreRecentWorkspaces(
  raw: unknown,
  currentFolderPath = '',
  limit = RECENT_WORKSPACES_LIMIT,
): string[] {
  const clean: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      const key = workspaceKey(trimmed);
      if (!trimmed || !key || seen.has(key)) continue;
      seen.add(key);
      clean.push(trimmed);
      if (clean.length >= limit) break;
    }
  }
  return currentFolderPath.trim() ? recordRecentWorkspace(clean, currentFolderPath, limit) : clean;
}
