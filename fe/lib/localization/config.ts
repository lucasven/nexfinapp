import type { Locale } from "./types";

/**
 * Locale constants to prevent case-sensitivity bugs.
 *
 * ROUTING_LOCALE: Used by next-intl, URLs, and useLocale() hook
 * INTL_LOCALE: Used by Intl APIs (NumberFormat, DateTimeFormat)
 */
export const LOCALE = {
  // Routing locales (lowercase, used in URLs and by next-intl)
  PT_BR: "pt-br" as const,
  EN: "en" as const,

  // Intl API locales (BCP 47 format)
  INTL_PT_BR: "pt-BR" as const,
  INTL_EN_US: "en-US" as const,
};

/**
 * Check if the routing locale is Portuguese
 * Use this instead of: locale === 'pt-BR' or locale === 'pt-br'
 */
export function isPortuguese(locale: string): boolean {
  return locale.toLowerCase() === "pt-br";
}

/**
 * Convert routing locale to Intl API locale
 * 'pt-br' -> 'pt-BR'
 * 'en' -> 'en-US'
 */
export function toIntlLocale(routingLocale: string): string {
  if (routingLocale.toLowerCase() === "pt-br") return LOCALE.INTL_PT_BR;
  return LOCALE.INTL_EN_US;
}

/**
 * Detect browser locale from Accept-Language header
 */
export function detectBrowserLocale(acceptLanguage?: string): Locale {
  if (!acceptLanguage) return LOCALE.PT_BR;

  const locale = acceptLanguage.split(",")[0].toLowerCase();

  if (locale.startsWith("pt")) return LOCALE.PT_BR;
  if (locale.startsWith("en")) return LOCALE.EN;

  return LOCALE.PT_BR;
}

/**
 * Validate if a string is a valid locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return locale === LOCALE.PT_BR || locale === LOCALE.EN;
}
