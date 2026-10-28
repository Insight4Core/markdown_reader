/**
 * Reading tabs. Each tab has its own back/forward history, like a browser tab.
 * The page keeps the active tab's history live in its own state; these helpers
 * work on snapshots so they stay pure and testable.
 */

export interface ReadingVisit {
  /** Note path, or '' for the knowledge home. */
  path: string;
  position: number;
  fromEcho: boolean;
}

export interface ReaderTab {
  id: string;
  history: ReadingVisit[];
  index: number;
}

export interface TabSet {
  tabs: ReaderTab[];
  activeId: string;
}

/** Saved history per tab is capped so the settings file stays small. */
export const HISTORY_LIMIT = 30;
export const TAB_LIMIT = 30;

export function createTab(id: string, path = '', position = 0): ReaderTab {
  return { id, history: [{ path, position, fromEcho: false }], index: 0 };
}

export function tabPath(tab: ReaderTab): string {
  return tab.history[tab.index]?.path ?? '';
}

/** Another tab already showing this note, so opening it again switches instead of duplicating. */
export function findTabShowing(tabs: ReaderTab[], path: string, exceptId = ''): ReaderTab | undefined {
  if (!path) return undefined;
  return tabs.find(tab => tab.id !== exceptId && tabPath(tab) === path);
}

/** New tabs open right after the one the reader is on, as in browsers. */
export function insertAfter(tabs: ReaderTab[], afterId: string, tab: ReaderTab): ReaderTab[] {
  const index = tabs.findIndex(existing => existing.id === afterId);
  if (index === -1) return [...tabs, tab];
  return [...tabs.slice(0, index + 1), tab, ...tabs.slice(index + 1)];
}

/**
 * Close a tab. Closing the active one activates its right neighbour, or the left one at the end.
 * The last tab is never removed; the caller turns it back into the knowledge home instead.
 */
export function closeTab(set: TabSet, closingId: string): TabSet {
  const index = set.tabs.findIndex(tab => tab.id === closingId);
  if (index === -1 || set.tabs.length <= 1) return set;
  const tabs = set.tabs.filter(tab => tab.id !== closingId);
  if (closingId !== set.activeId) return { tabs, activeId: set.activeId };
  return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)].id };
}

/** Next (+1) or previous (-1) tab, wrapping around. */
export function cycleTab(set: TabSet, delta: number): string {
  const count = set.tabs.length;
  if (count === 0) return set.activeId;
  const index = Math.max(0, set.tabs.findIndex(tab => tab.id === set.activeId));
  return set.tabs[(((index + delta) % count) + count) % count].id;
}

/** ⌘1–⌘8 pick that tab; ⌘9 always picks the last one (browser convention). */
export function tabByNumber(tabs: ReaderTab[], number: number): string | undefined {
  if (number < 1 || number > 9 || tabs.length === 0) return undefined;
  if (number === 9) return tabs[tabs.length - 1].id;
  return tabs[number - 1]?.id;
}

/** Keep at most HISTORY_LIMIT visits, always including the current one. */
export function trimHistory(tab: ReaderTab): ReaderTab {
  if (tab.history.length <= HISTORY_LIMIT) return tab;
  const start = Math.max(0, Math.min(tab.index - Math.floor(HISTORY_LIMIT / 2), tab.history.length - HISTORY_LIMIT));
  return { ...tab, history: tab.history.slice(start, start + HISTORY_LIMIT), index: tab.index - start };
}

/** Validate saved tabs (settings may be from an older version or edited by hand). */
export function restoreTabs(raw: unknown): TabSet | null {
  if (!raw || typeof raw !== 'object') return null;
  const { tabs, activeId } = raw as { tabs?: unknown; activeId?: unknown };
  if (!Array.isArray(tabs)) return null;
  const clean: ReaderTab[] = [];
  const seen = new Set<string>();
  for (const value of tabs.slice(0, TAB_LIMIT)) {
    if (!value || typeof value !== 'object') continue;
    const { id, history, index } = value as Partial<ReaderTab>;
    if (typeof id !== 'string' || !id || seen.has(id) || !Array.isArray(history)) continue;
    const visits = history
      .filter((visit): visit is ReadingVisit => !!visit && typeof (visit as ReadingVisit).path === 'string')
      .map(visit => ({
        path: visit.path,
        position: Number.isFinite(visit.position) ? Math.max(0, visit.position) : 0,
        fromEcho: visit.fromEcho === true,
      }));
    if (visits.length === 0) continue;
    const current = Number.isInteger(index) ? Math.min(Math.max(index as number, 0), visits.length - 1) : visits.length - 1;
    seen.add(id);
    clean.push(trimHistory({ id, history: visits, index: current }));
  }
  if (clean.length === 0) return null;
  const active = typeof activeId === 'string' && seen.has(activeId) ? activeId : clean[0].id;
  return { tabs: clean, activeId: active };
}
