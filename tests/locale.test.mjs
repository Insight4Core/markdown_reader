import test from 'node:test';
import assert from 'node:assert/strict';
import { languageForLocale, resolveLocale } from '../src/lib/locale.ts';

test('only Chinese systems get the Chinese interface', () => {
  for (const tag of ['zh-CN', 'zh-Hant-TW', 'ZH']) assert.equal(languageForLocale(tag), 'zh');
  for (const tag of ['en-US', 'de-DE', 'ja-JP', 'fr', '', undefined]) assert.equal(languageForLocale(tag), 'en');
});

test('first launch follows the system language', () => {
  assert.deepEqual(resolveLocale(null, null, 'de-DE'), { locale: 'en', chosen: false });
  assert.deepEqual(resolveLocale(null, null, 'zh-CN'), { locale: 'zh', chosen: false });
});

test('Chinese auto-detected by older versions on non-Chinese systems becomes English', () => {
  assert.deepEqual(resolveLocale('zh', null, 'ja-JP'), { locale: 'en', chosen: false });
  assert.deepEqual(resolveLocale('zh', null, 'zh-CN'), { locale: 'zh', chosen: false });
  assert.deepEqual(resolveLocale('en', null, 'en-GB'), { locale: 'en', chosen: false });
});

test('a language the reader picked is kept', () => {
  // Older versions could only have saved these by the reader changing Settings.
  assert.deepEqual(resolveLocale('zh', null, 'en-US'), { locale: 'zh', chosen: true });
  assert.deepEqual(resolveLocale('en', null, 'zh-CN'), { locale: 'en', chosen: true });
  assert.deepEqual(resolveLocale('zh', true, 'de-DE'), { locale: 'zh', chosen: true });
});

test('an automatic language keeps following the system', () => {
  assert.deepEqual(resolveLocale('en', false, 'zh-TW'), { locale: 'zh', chosen: false });
  assert.deepEqual(resolveLocale('fr', true, 'fr-FR'), { locale: 'en', chosen: false });
});
