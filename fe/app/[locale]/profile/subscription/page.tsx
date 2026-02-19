import { getMySubscription } from "@/lib/actions/subscriptions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Link } from "@/lib/localization/link"

const TIER_LABELS: Record<string, string> = {
  free: 'Gratuito',
  whatsapp: 'WhatsApp',
  couples: 'Casais',
  openfinance: 'Open Finance',
}

export default async function SubscriptionPage() {
  const { tier, subscription } = await getMySubscription()

  return (
    <div className="container max-w-lg mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Minha Assinatura</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Plano atual</CardTitle>
            <Badge variant={tier === 'free' ? 'secondary' : 'default'}>
              {TIER_LABELS[tier]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-2 text-sm">
              <p>
                Tipo:{' '}
                <span className="font-medium">
                  {subscription.type === 'lifetime' ? 'Vitalício' : 'Mensal'}
                </span>
              </p>
              {subscription.expires_at && (
                <p>
                  Próxima cobrança:{' '}
                  <span className="font-medium">
                    {new Date(subscription.expires_at).toLocaleDateString('pt-BR')}
                  </span>
                </p>
              )}
              {subscription.type === 'monthly' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 text-destructive border-destructive hover:bg-destructive/10"
                  disabled
                >
                  Cancelar assinatura
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Você está no plano gratuito.
            </p>
          )}

          <div className="mt-6">
            <Button asChild size="sm">
              <Link href="/pricing">Ver todos os planos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
