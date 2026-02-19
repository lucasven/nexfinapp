import { ProfileSettingsCard } from "@/components/profile-settings-card"
import { WhatsAppNumbersCard } from "@/components/whatsapp-numbers-card"
import { AuthorizedGroupsCard } from "@/components/authorized-groups-card"
import { AccountSettingsSection } from "@/components/profile/account-settings-section"
import { UserMenu } from "@/components/user-menu"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { ArrowLeftIcon } from "lucide-react"
import { Link } from "@/lib/localization/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getTranslations } from 'next-intl/server'
import { getMySubscription } from "@/lib/actions/subscriptions"

const TIER_LABELS: Record<string, string> = {
  free: 'Gratuito',
  whatsapp: 'WhatsApp',
  couples: 'Casais',
  openfinance: 'Open Finance',
}

export default async function ProfilePage() {
  const t = await getTranslations()
  const supabase = await getSupabaseServerClient()
  const [{ data: { user } }, { tier, subscription }] = await Promise.all([
    supabase.auth.getUser(),
    getMySubscription(),
  ])

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
            <p className="text-muted-foreground mt-1">{t('profile.subtitle')}</p>
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

        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Minha Assinatura</CardTitle>
                <Badge variant={tier === 'free' ? 'secondary' : 'default'}>
                  {TIER_LABELS[tier]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground space-y-1">
                {subscription ? (
                  <>
                    <p>
                      Tipo:{' '}
                      <span className="font-medium text-foreground">
                        {subscription.type === 'lifetime' ? 'Vitalício' : 'Mensal'}
                      </span>
                    </p>
                    {subscription.expires_at && (
                      <p>
                        Próxima cobrança:{' '}
                        <span className="font-medium text-foreground">
                          {new Date(subscription.expires_at).toLocaleDateString('pt-BR')}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p>Você está no plano gratuito.</p>
                )}
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href="/pricing">Ver planos</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <AccountSettingsSection
            userEmail={user?.email}
            userId={user?.id}
            userCreatedAt={user?.created_at}
          />
        </div>
      </div>
    </div>
  )
}
