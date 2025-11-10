'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { GlobeIcon } from 'lucide-react'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { setUserLocale } from '@/lib/actions/profile'
import { useState } from 'react'

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isChanging, setIsChanging] = useState(false)

  const changeLocale = async (newLocale: 'pt-br' | 'en') => {
    if (newLocale === locale || isChanging) return

    setIsChanging(true)
    try {
      // Update user preference in database
      await setUserLocale(newLocale)

      // Replace the locale in the pathname
      const newPathname = pathname.replace(`/${locale}`, `/${newLocale}`)
      
      // Navigate to the new locale path
      router.push(newPathname)
      router.refresh()
    } catch (error) {
      console.error('Error changing locale:', error)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <GlobeIcon className="h-4 w-4" />
          {locale === 'pt-br' ? '🇧🇷 Português' : '🇺🇸 English'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => changeLocale('pt-br')} disabled={locale === 'pt-br' || isChanging}>
          🇧🇷 Português
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLocale('en')} disabled={locale === 'en' || isChanging}>
          🇺🇸 English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
