import { getRequestConfig } from 'next-intl/server'
import { headers } from 'next/headers'
import { locales, defaultLocale } from './i18n/routing'

export default getRequestConfig(async () => {
  // Read the incoming `x-next-intl-locale` header that the middleware sets
  const headersList = await headers()
  const locale = headersList.get('x-next-intl-locale') || defaultLocale

  let messages
  if (locale === 'en') {
    messages = (await import('./lib/localization/en')).messages
  } else if (locale === 'pt-br') {
    messages = (await import('./lib/localization/pt-br')).messages
  } else {
    // Fallback to default locale
    messages = (await import('./lib/localization/pt-br')).messages
  }
  return {
    locale,
    messages,
  }
})
