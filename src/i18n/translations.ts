import { enTranslations } from './en';
import { arTranslations } from './ar';

export * from './catalogCopy';
export * from './messages';
export { enTranslations } from './en';
export { arTranslations } from './ar';

export const translations = {
  en: enTranslations,
  ar: arTranslations,
} as const;

export type TranslationKey = keyof typeof translations.en;
export type TranslationDict = Record<TranslationKey, string>;
