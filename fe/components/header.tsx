"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Link } from "@/lib/localization/link"
import {
  BarChart3Icon,
  CreditCardIcon,
  FolderIcon,
  RepeatIcon,
  TargetIcon,
  ChevronDownIcon,
  WalletIcon,
  HomeIcon,
  SettingsIcon,
  MenuIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from 'next-intl'
import { UserMenu } from "./user-menu"
import { TransactionDialogWrapper } from "@/app/[locale]/transaction-dialog-wrapper"
import { Category, PaymentMethod } from "@/lib/types"
import { useState } from "react"

interface HeaderProps {
  userEmail?: string
  displayName?: string
  isAdmin?: boolean
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export function Header({
  userEmail,
  displayName,
  isAdmin,
  categories,
  paymentMethods
}: HeaderProps) {
  const t = useTranslations()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-4">
        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between py-4">
          <Link href="/">
            <div className="cursor-pointer hover:opacity-80 transition-opacity">
              <h1 className="text-2xl font-bold tracking-tight">{t('home.title')}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{t('home.subtitle')}</p>
            </div>
          </Link>

          <nav className="flex items-center gap-2">
            {/* Visão Geral Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1">
                  <BarChart3Icon className="h-4 w-4" />
                  {t('nav.overview')}
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/" className="cursor-pointer">
                    <HomeIcon className="h-4 w-4 mr-2" />
                    {t('nav.dashboard')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/reports" className="cursor-pointer">
                    <BarChart3Icon className="h-4 w-4 mr-2" />
                    {t('nav.reports')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Cartões Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1">
                  <CreditCardIcon className="h-4 w-4" />
                  {t('nav.creditCards')}
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/installments" className="cursor-pointer">
                    <TargetIcon className="h-4 w-4 mr-2" />
                    {t('nav.installments')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/credit-cards" className="cursor-pointer">
                    <SettingsIcon className="h-4 w-4 mr-2" />
                    {t('nav.manageCreditCards')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Configurar Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1">
                  <SettingsIcon className="h-4 w-4" />
                  {t('nav.settings')}
                  <ChevronDownIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem asChild>
                  <Link href="/categories" className="cursor-pointer">
                    <FolderIcon className="h-4 w-4 mr-2" />
                    {t('nav.categories')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/recurring" className="cursor-pointer">
                    <RepeatIcon className="h-4 w-4 mr-2" />
                    {t('nav.recurring')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/payment-methods" className="cursor-pointer">
                    <WalletIcon className="h-4 w-4 mr-2" />
                    {t('nav.paymentMethods')}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add Transaction Button */}
            <TransactionDialogWrapper categories={categories} paymentMethods={paymentMethods} />

            {/* User Menu */}
            <UserMenu userEmail={userEmail} displayName={displayName} isAdmin={isAdmin} />
          </nav>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <XIcon className="h-5 w-5" />
              ) : (
                <MenuIcon className="h-5 w-5" />
              )}
            </Button>
            <Link href="/">
              <h1 className="text-xl font-bold cursor-pointer hover:opacity-80 transition-opacity">{t('home.title')}</h1>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <TransactionDialogWrapper categories={categories} paymentMethods={paymentMethods} />
            <UserMenu userEmail={userEmail} displayName={displayName} isAdmin={isAdmin} />
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t py-4 space-y-2">
            {/* Visão Geral Section */}
            <div className="space-y-1">
              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <BarChart3Icon className="h-4 w-4" />
                {t('nav.overview')}
              </div>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                  <HomeIcon className="h-4 w-4 mr-2" />
                  {t('nav.dashboard')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/reports" onClick={() => setMobileMenuOpen(false)}>
                  <BarChart3Icon className="h-4 w-4 mr-2" />
                  {t('nav.reports')}
                </Link>
              </Button>
            </div>

            {/* Cartões Section */}
            <div className="space-y-1">
              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <CreditCardIcon className="h-4 w-4" />
                {t('nav.creditCards')}
              </div>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/installments" onClick={() => setMobileMenuOpen(false)}>
                  <TargetIcon className="h-4 w-4 mr-2" />
                  {t('nav.installments')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/credit-cards" onClick={() => setMobileMenuOpen(false)}>
                  <SettingsIcon className="h-4 w-4 mr-2" />
                  {t('nav.manageCreditCards')}
                </Link>
              </Button>
            </div>

            {/* Configurar Section */}
            <div className="space-y-1">
              <div className="px-3 py-2 text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <SettingsIcon className="h-4 w-4" />
                {t('nav.settings')}
              </div>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/categories" onClick={() => setMobileMenuOpen(false)}>
                  <FolderIcon className="h-4 w-4 mr-2" />
                  {t('nav.categories')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/recurring" onClick={() => setMobileMenuOpen(false)}>
                  <RepeatIcon className="h-4 w-4 mr-2" />
                  {t('nav.recurring')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="w-full justify-start pl-9">
                <Link href="/payment-methods" onClick={() => setMobileMenuOpen(false)}>
                  <WalletIcon className="h-4 w-4 mr-2" />
                  {t('nav.paymentMethods')}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
