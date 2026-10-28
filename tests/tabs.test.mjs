import test from 'node:test';
import assert from 'node:assert/strict';
import { createTab, tabPath, findTabShowing, insertAfter, closeTab, cycleTab, tabByNumber, trimHistory, restoreTabs, HISTORY_LIMIT } from '../src/lib/tabs.ts';

const tab = (id, ...paths) => ({ id, history: paths.map(path => ({ path, position: 0, fromEcho: false })), index: paths.length - 1 });

test('a tab shows the visit at its history index', () => {
  assert.equal(tabPath(createTab('a')), '');
  assert.equal(tabPath(createTab('a', '/kb/a.md', 120)), '/kb/a.md');
  assert.equal(tabPath({ ...tab('a', '/kb/a.md', '/kb/b.md'), index: 0 }), '/kb/a.md');
});

test('opening a note already open elsewhere finds that tab, never the home', () => {
  const tabs = [tab('a', '/kb/a.md'), tab('b', '/kb/x.md', '/kb/b.md'), tab('h', '')];
  assert.equal(findTabShowing(tabs, '/kb/b.md')?.id, 'b');
  assert.equal(findTabShowing(tabs, '/kb/x.md'), undefined); // only in b's back history
  assert.equal(findTabShowing(tabs, '/kb/a.md', 'a'), undefined);
  assert.equal(findTabShowing(tabs, ''), undefined);
});

test('new tabs open right after the current one', () => {
  const tabs = [tab('a', ''), tab('b', ''), tab('c', '')];
  assert.deepEqual(insertAfter(tabs, 'a', tab('n', '')).map(t => t.id), ['a', 'n', 'b', 'c']);
  assert.deepEqual(insertAfter(tabs, 'missing', tab('n', '')).map(t => t.id), ['a', 'b', 'c', 'n']);
});

test('closing the active tab moves to its right neighbour, or left at the end', () => {
  const tabs = [tab('a', ''), tab('b', ''), tab('c', '')];
  assert.deepEqual(closeTab({ tabs, activeId: 'b' }, 'b'), { tabs: [tabs[0], tabs[2]], activeId: 'c' });
  assert.equal(closeTab({ tabs, activeId: 'c' }, 'c').activeId, 'b');
  assert.equal(closeTab({ tabs, activeId: 'a' }, 'c').activeId, 'a');
  const single = { tabs: [tabs[0]], activeId: 'a' };
  assert.equal(closeTab(single, 'a'), single); // the last tab stays
});

test('tab switching wraps around and ⌘9 means the last tab', () => {
  const set = { tabs: [tab('a', ''), tab('b', ''), tab('c', '')], activeId: 'c' };
  assert.equal(cycleTab(set, 1), 'a');
  assert.equal(cycleTab({ ...set, activeId: 'a' }, -1), 'c');
  assert.equal(tabByNumber(set.tabs, 2), 'b');
  assert.equal(tabByNumber(set.tabs, 5), undefined);
  assert.equal(tabByNumber(set.tabs, 9), 'c');
});

test('history is capped around the current visit', () => {
  const paths = Array.from({ length: 50 }, (_, i) => `/kb/${i}.md`);
  const long = { ...tab('a', ...paths), index: 40 };
  const trimmed = trimHistory(long);
  assert.equal(trimmed.history.length, HISTORY_LIMIT);
  assert.equal(tabPath(trimmed), '/kb/40.md');
});

test('saved tabs are validated before use', () => {
  assert.equal(restoreTabs(null), null);
  assert.equal(restoreTabs({ tabs: 'nope' }), null);
  const restored = restoreTabs({
    activeId: 'gone',
    tabs: [
      { id: 'a', history: [{ path: '/kb/a.md', position: 50 }], index: 7 },
      { id: 'a', history: [{ path: '/kb/dup.md' }], index: 0 },
      { id: 'b', history: [], index: 0 },
      { id: 'c', history: [{ path: '', position: -4 }, { nope: true }], index: 0 },
    ],
  });
  assert.deepEqual(restored, {
    activeId: 'a',
    tabs: [
      { id: 'a', history: [{ path: '/kb/a.md', position: 50, fromEcho: false }], index: 0 },
      { id: 'c', history: [{ path: '', position: 0, fromEcho: false }], index: 0 },
    ],
  });
});
