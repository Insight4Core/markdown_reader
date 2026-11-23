import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatchRanges, nextMatchIndex, sanitizeFindSeed, FIND_SEED_MAX_LENGTH } from '../src/lib/in-page-find.ts';

test('findMatchRanges matches case-insensitively across ASCII, Chinese and regex metacharacters', () => {
  assert.deepEqual(findMatchRanges('Markdown and MARKDOWN reader', 'markdown'), [
    { start: 0, end: 8 },
    { start: 13, end: 21 },
  ]);
  assert.deepEqual(findMatchRanges('支持 C++ 与 [v0.11] 里的 a+b', 'a+b'), [
    { start: 20, end: 23 },
  ]);
  assert.deepEqual(findMatchRanges('知返阅读空间，知返', '知返'), [
    { start: 0, end: 2 },
    { start: 7, end: 9 },
  ]);
  assert.deepEqual(findMatchRanges('hello world', '   '), []);
  assert.deepEqual(findMatchRanges('', 'hello'), []);
});

test('nextMatchIndex wraps around forward and backward and handles empty matches', () => {
  assert.equal(nextMatchIndex(0, 0, 1), -1);
  assert.equal(nextMatchIndex(-1, 3, 1), 0);
  assert.equal(nextMatchIndex(-1, 3, -1), 2);
  assert.equal(nextMatchIndex(2, 3, 1), 0);
  assert.equal(nextMatchIndex(0, 3, -1), 2);
  assert.equal(nextMatchIndex(1, 3, 1), 2);
});

test('sanitizeFindSeed accepts short single-line selections and rejects multiline or long text', () => {
  assert.equal(sanitizeFindSeed('  hello world  '), 'hello world');
  assert.equal(sanitizeFindSeed('line one\nline two'), '');
  assert.equal(sanitizeFindSeed('a'.repeat(FIND_SEED_MAX_LENGTH)), 'a'.repeat(FIND_SEED_MAX_LENGTH));
  assert.equal(sanitizeFindSeed('a'.repeat(FIND_SEED_MAX_LENGTH + 1)), '');
  assert.equal(sanitizeFindSeed('   '), '');
});
