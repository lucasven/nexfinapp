import { ProfileSettingsCard } from "@/components/profile-settings-card"
import { WhatsAppNumbersCard } from "@/components/whatsapp-numbers-card"
import { AuthorizedGroupsCard } from "@/components/authorized-groups-card"
import { UserMenu } from "@/components/user-menu"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { ArrowLeftIcon } from "lucide-react"
import { Link } from "@/lib/localization/link"
import { Button } from "@/components/ui/button"
import { getTranslations } from 'next-intl/server'

export default async function ProfilePage() {
  const t = await getTranslations()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{t('profile.settings')}</h1>
            <p className="text-muted-foreground mt-1">Manage your profile and WhatsApp bot configuration</p>
          </div>
          <UserMenu userEmail={user?.email} displayName={user?.user_metadata?.display_name} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ProfileSettingsCard />
          <WhatsAppNumbersCard />
        </div>

        <div className="mt-6">
          <AuthorizedGroupsCard />
        </div>
      </div>
    </div>
  )
}

