"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { LogOutIcon, UserIcon, SettingsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Link } from '@/lib/localization/link'
import { LanguageSwitcher } from './language-switcher'
import { useTranslations } from 'next-intl'

interface UserMenuProps {
  userEmail?: string
  displayName?: string
}

export function UserMenu({ userEmail, displayName }: UserMenuProps) {
  const router = useRouter()

  const t = useTranslations()

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <UserIcon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{displayName || t('nav.profile')}</span>
            {userEmail && <span className="text-xs text-muted-foreground">{userEmail}</span>}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <LanguageSwitcher />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <SettingsIcon className="h-4 w-4 mr-2" />
            {t('profile.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOutIcon className="h-4 w-4 mr-2" />
          {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
