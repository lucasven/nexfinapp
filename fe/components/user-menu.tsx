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
import { LogOutIcon, UserIcon, SettingsIcon, LayoutDashboardIcon, CreditCardIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Link } from '@/lib/localization/link'
import { LanguageSwitcher } from './language-switcher'
import { useTranslations } from 'next-intl'
import { resetUser } from '@/lib/analytics/tracker'

interface UserMenuProps {
  userEmail?: string
  displayName?: string
  isAdmin?: boolean
}

export function UserMenu({ userEmail, displayName, isAdmin }: UserMenuProps) {
  const router = useRouter()

  const t = useTranslations()

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    resetUser() // Reset PostHog user identity
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
        <DropdownMenuItem asChild>
          <Link href="/pricing">
            <CreditCardIcon className="h-4 w-4 mr-2" />
            Planos
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <LayoutDashboardIcon className="h-4 w-4 mr-2" />
                Admin Dashboard
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOutIcon className="h-4 w-4 mr-2" />
          {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
