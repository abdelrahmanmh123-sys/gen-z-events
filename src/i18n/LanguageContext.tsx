import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getDirection,
  LANGUAGE_STORAGE_KEY,
  resolveInitialLanguage,
  translations,
  type Language,
  type TextDirection,
  type TranslationDict,
} from './translations';

interface LanguageContextValue {
  lang: Language;
  isAr: boolean;
  dir: TextDirection;
  setLang: (next: Language) => void;
  toggleLang: () => void;
  t: TranslationDict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  try {
    return resolveInitialLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'en';
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() =>
    typeof window !== 'undefined' ? readStoredLanguage() : 'en',
  );

  const dir = getDirection(lang);
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = t.siteTitle;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // ignore storage restrictions
    }
  }, [lang, dir, t.siteTitle]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'en' ? 'ar' : 'en'));
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      isAr: lang === 'ar',
      dir,
      setLang,
      toggleLang,
      t,
    }),
    [lang, dir, setLang, toggleLang, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}
