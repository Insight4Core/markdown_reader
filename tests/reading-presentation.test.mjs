import test from 'node:test';
import assert from 'node:assert/strict';
import { readingPercent, unfinishedDocuments, groupSearchHits, highlightParts, documentContext } from '../src/lib/reading-presentation.ts';

test('continue reading contains only unfinished, scrolled notes in recency order', () => {
  const files = ['new', 'started', 'older', 'done', 'short', 'near-end'].map(path => ({ path }));
  const progress = {
    new: { position: 0, total: 100, updatedAt: 9 },
    started: { position: 40, total: 100, updatedAt: 4 },
    older: { position: 25, total: 100, updatedAt: 2 },
    done: { position: 100, total: 100, updatedAt: 10 },
    short: { position: 0, total: 1, updatedAt: 11 },
    'near-end': { position: 999, total: 1000, updatedAt: 12 }
  };
  assert.deepEqual(unfinishedDocuments(files, progress), [{ path: 'started' }, { path: 'older' }]);
  assert.deepEqual(unfinishedDocuments(files, progress, 1), [{ path: 'started' }]);
  assert.equal(readingPercent(undefined), 0);
  assert.equal(readingPercent({ position: -20, total: 100, updatedAt: 1 }), 0);
});

test('search groups by full path without merging same-name files', () => {
  const hit = (path, line) => ({ file_path: path, file_name: 'note.md', line_number: line, snippet: `line ${line}` });
  const results = groupSearchHits([hit('/a/note.md', 1), hit('/b/note.md', 4), hit('/a/note.md', 9)]);
  assert.equal(results.length, 2);
  assert.equal(results[0].matches.length, 2);
  assert.equal(results[1].file_path, '/b/note.md');
});

test('highlight is literal, case-insensitive and never produces HTML', () => {
  assert.deepEqual(highlightParts('Read <strong>Knowledge</strong> again', 'knowledge'), [
    { text: 'Read <strong>', matched: false }, { text: 'Knowledge', matched: true }, { text: '</strong> again', matched: false }
  ]);
  assert.deepEqual(highlightParts('a+b and a+b', 'a+b').filter(part => part.matched).map(part => part.text), ['a+b', 'a+b']);
  assert.deepEqual(highlightParts('知识回响', '知识'), [{ text: '知识', matched: true }, { text: '回响', matched: false }]);
});

test('context uses the most specific source and handles Windows paths', () => {
  assert.equal(documentContext('/notes/work/note.md', ['/notes', '/notes/work']), 'work / note.md');
  assert.equal(documentContext('C:\\Notes\\topic\\note.md', ['C:\\Notes']), 'Notes / topic/note.md');
  assert.equal(documentContext('/linked/single.md', ['/linked/single.md']), 'linked / single.md');
});
