export type AppLocale = 'zh' | 'en';

/** Chinese for Chinese systems; English for every other language, since it is the only other translation. */
export function languageForLocale(language: string | undefined): AppLocale {
  return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Decide the interface language at startup.
 *
 * `chosen` is true once the reader picks a language in Settings. Versions up to 0.8.4 saved the
 * auto-detected language without that flag, and detected Chinese for every non-English system.
 * A saved value matching that old detection is treated as automatic, so a German or Japanese
 * system now gets English; any other saved value was picked by the reader and is kept.
 */
export function resolveLocale(saved: unknown, chosen: unknown, systemLanguage: string | undefined): { locale: AppLocale; chosen: boolean } {
  const system = languageForLocale(systemLanguage);
  const valid = saved === 'zh' || saved === 'en';
  if (chosen === true && valid) return { locale: saved, chosen: true };
  if (chosen === false || !valid) return { locale: system, chosen: false };
  const legacyDetection: AppLocale = systemLanguage?.toLowerCase().startsWith('en') ? 'en' : 'zh';
  return saved === legacyDetection ? { locale: system, chosen: false } : { locale: saved, chosen: true };
}
