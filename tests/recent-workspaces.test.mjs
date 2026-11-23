import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENT_WORKSPACES_LIMIT,
  normalizeWorkspacePath,
  workspaceDisplayName,
  workspaceParentPath,
  recordRecentWorkspace,
  removeRecentWorkspace,
  restoreRecentWorkspaces,
} from '../src/lib/recent-workspaces.ts';

test('normalizeWorkspacePath cleans trailing slashes and Windows separators', () => {
  assert.equal(normalizeWorkspacePath('/Users/alice/notes///'), '/Users/alice/notes');
  assert.equal(normalizeWorkspacePath('C:\\Users\\Alice\\Docs\\'), 'C:/Users/Alice/Docs');
  assert.equal(normalizeWorkspacePath('/'), '/');
  assert.equal(normalizeWorkspacePath('C:\\'), 'C:/');
  assert.equal(workspaceDisplayName('/Users/alice/notes/'), 'notes');
  assert.equal(workspaceParentPath('/Users/alice/notes/'), '/Users/alice');
});

test('recordRecentWorkspace deduplicates, moves to front and caps at 8 items', () => {
  let list = [];
  for (let i = 1; i <= 10; i += 1) {
    list = recordRecentWorkspace(list, `/kb/space-${i}`);
  }
  assert.equal(list.length, RECENT_WORKSPACES_LIMIT);
  assert.equal(list[0], '/kb/space-10');
  assert.equal(list[list.length - 1], '/kb/space-3');

  // Re-opening an existing path with trailing slash moves it to front without duplicating.
  list = recordRecentWorkspace(list, '/kb/space-5/');
  assert.equal(list.length, RECENT_WORKSPACES_LIMIT);
  assert.equal(list[0], '/kb/space-5/');
  assert.equal(list.filter(item => normalizeWorkspacePath(item) === '/kb/space-5').length, 1);

  // Windows paths deduplicate case-insensitively.
  const winList = recordRecentWorkspace(['C:\\Notes\\Work'], 'c:/notes/work/');
  assert.equal(winList.length, 1);
});

test('removeRecentWorkspace and restoreRecentWorkspaces handle migration and bad entries', () => {
  assert.deepEqual(
    removeRecentWorkspace(['/kb/a', '/kb/b', '/kb/c'], '/kb/b/'),
    ['/kb/a', '/kb/c'],
  );
  assert.deepEqual(
    restoreRecentWorkspaces(['/kb/old', '', 123, '/kb/old/'], '/kb/current'),
    ['/kb/current', '/kb/old'],
  );
  assert.deepEqual(restoreRecentWorkspaces(null, '/kb/current'), ['/kb/current']);
  assert.deepEqual(restoreRecentWorkspaces(null, ''), []);
});
