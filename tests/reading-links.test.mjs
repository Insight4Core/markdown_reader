import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReadingLink, fragmentCandidates } from '../src/lib/reading-links.ts';

test('relative Markdown links separate path, query and heading before decoding', () => {
  assert.deepEqual(parseReadingLink('../旧笔记/Guide%20one.md?view=read#%E6%A0%87%E9%A2%98'), {
    kind: 'markdown', path: '../旧笔记/Guide one.md', fragment: '%E6%A0%87%E9%A2%98'
  });
  assert.deepEqual(parseReadingLink('notes%23one.md#section'), { kind: 'markdown', path: 'notes#one.md', fragment: 'section' });
});

test('same-page links, top-of-page links and empty cross-file fragments are preserved', () => {
  assert.deepEqual(parseReadingLink('#标题'), { kind: 'anchor', fragment: '标题' });
  assert.deepEqual(parseReadingLink('#'), { kind: 'anchor', fragment: '' });
  assert.deepEqual(parseReadingLink('note.markdown#'), { kind: 'markdown', path: 'note.markdown', fragment: '' });
});

test('web and email schemes never become filesystem paths', () => {
  for (const url of ['https://example.com/a.md#one', 'HTTP://example.com', 'mailto:reader@example.com']) {
    assert.deepEqual(parseReadingLink(url), { kind: 'external', url });
  }
  assert.deepEqual(parseReadingLink('//example.com/notes'), { kind: 'external', url: 'https://example.com/notes' });
});

test('unsafe and unsupported schemes and attachments are rejected', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'custom:note.md', 'image.png', 'file://remote/note.md', '', '?view=read']) {
    assert.deepEqual(parseReadingLink(url), { kind: 'unsupported' }, url);
  }
});

test('local file URLs and Windows drive paths are supported', () => {
  assert.deepEqual(parseReadingLink('file:///Users/reader/My%20note.md#part'), { kind: 'markdown', path: '/Users/reader/My note.md', fragment: 'part' });
  assert.deepEqual(parseReadingLink('file:///C:/Notes/Note.md'), { kind: 'markdown', path: 'C:/Notes/Note.md', fragment: undefined });
  assert.deepEqual(parseReadingLink('C:\\Notes\\Note.MD'), { kind: 'markdown', path: 'C:\\Notes\\Note.MD', fragment: undefined });
});

test('malformed percent encodings do not crash reading', () => {
  assert.deepEqual(parseReadingLink('100%notes.md#bad%anchor'), { kind: 'markdown', path: '100%notes.md', fragment: 'bad%anchor' });
  assert.deepEqual(fragmentCandidates('bad%anchor'), ['bad%anchor', 'bad%25anchor']);
});

test('fragments match both literal and encoded heading IDs', () => {
  assert.deepEqual(fragmentCandidates('%E6%A0%87%E9%A2%98'), ['%E6%A0%87%E9%A2%98', '标题']);
  assert.deepEqual(fragmentCandidates('标题'), ['标题', '%E6%A0%87%E9%A2%98']);
});
