export const locales = ['en', 'pt-br'] as const
export const defaultLocale = 'pt-br' as const

export type Locale = (typeof locales)[number]

