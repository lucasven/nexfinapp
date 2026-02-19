"use client"

import { type Tier, type Subscription } from "@/lib/actions/subscriptions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const TIERS = [
  {
    id: 'free' as Tier,
    name: 'Gratuito',
    monthly: 0,
    lifetime: null as number | null,
    features: [
      'App web completo',
      'Categorias e relatórios',
      'Transações ilimitadas',
    ],
  },
  {
    id: 'whatsapp' as Tier,
    name: 'WhatsApp',
    monthly: 9.90,
    lifetime: 79.90,
    features: [
      'Tudo do plano Gratuito',
      '1 número WhatsApp',
      'Adicionar gastos pelo WhatsApp',
      'OCR de recibos',
    ],
  },
  {
    id: 'couples' as Tier,
    name: 'Casais',
    monthly: 19.90,
    lifetime: 159.90,
    features: [
      'Tudo do plano WhatsApp',
      'Múltiplos números WhatsApp',
      'Grupos do WhatsApp',
      'Finanças compartilhadas',
    ],
  },
  {
    id: 'openfinance' as Tier,
    name: 'Open Finance',
    monthly: 39.90,
    lifetime: 319.90,
    features: [
      'Tudo do plano Casais',
      'Importação automática de extratos',
      'Classificação automática por IA',
      'Conexão com bancos via Openi',
    ],
  },
]

function formatBRL(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

interface Props {
  currentTier: Tier
  subscription: Subscription | null
  lifetimeSpotsRemaining: number
}

export function PricingClient({ currentTier, lifetimeSpotsRemaining }: Props) {
  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold text-center mb-2">Planos</h1>
      <p className="text-center text-muted-foreground mb-10">
        Escolha o plano ideal para você
      </p>

      {lifetimeSpotsRemaining > 0 && (
        <div className="text-center mb-8 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          🎉 Oferta de lançamento: apenas{' '}
          <strong>{lifetimeSpotsRemaining} vagas</strong> para acesso vitalício!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id
          return (
            <Card key={tier.id} className={isCurrent ? 'border-primary shadow-md' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{tier.name}</CardTitle>
                  {isCurrent && <Badge>Atual</Badge>}
                </div>
                <div className="mt-2">
                  {tier.monthly === 0 ? (
                    <span className="text-2xl font-bold">Grátis</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">
                        R${formatBRL(tier.monthly)}
                      </span>
                      <span className="text-muted-foreground">/mês</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="text-sm flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {tier.monthly > 0 && !isCurrent && (
                  <div className="space-y-2">
                    <Button className="w-full" size="sm">
                      Assinar por R${formatBRL(tier.monthly)}/mês
                    </Button>
                    {tier.lifetime !== null && lifetimeSpotsRemaining > 0 && (
                      <Button className="w-full" size="sm" variant="outline">
                        Vitalício por R${formatBRL(tier.lifetime)}
                      </Button>
                    )}
                  </div>
                )}

                {isCurrent && tier.monthly > 0 && (
                  <Button className="w-full" size="sm" variant="ghost" disabled>
                    Plano atual
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
