import { BetaSignupForm } from "@/components/beta-signup-form"
import { NexFinLogo } from "@/components/nexfin-logo"
import { 
  MessageSquare, 
  TrendingUp, 
  BarChart3, 
  CheckCircle2,
  Sparkles,
  Shield,
  Globe,
  Camera,
  Bell,
  PieChart
} from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "NexFinApp - Controle Financeiro pelo WhatsApp",
  description: "Gerencie suas finanças de forma inteligente através do WhatsApp. Adicione despesas por mensagem ou foto de recibo, acompanhe orçamentos e receba insights detalhados. Cadastre-se para o acesso beta!",
  openGraph: {
    title: "NexFinApp - Controle Financeiro pelo WhatsApp",
    description: "Gerencie suas finanças de forma inteligente através do WhatsApp. Adicione despesas por mensagem ou foto de recibo.",
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexFinApp - Controle Financeiro pelo WhatsApp",
    description: "Gerencie suas finanças de forma inteligente através do WhatsApp.",
  },
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <NexFinLogo size="md" />
          <div className="text-sm text-slate-600">
            🇧🇷 <span className="font-medium">100% em Português</span>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-4 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-semibold">
            ✨ Acesso Beta Disponível
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            Controle Suas Finanças
            <br />
            <span className="text-emerald-600">pelo WhatsApp</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Adicione despesas por mensagem ou foto de recibo. 
            Inteligência artificial cuida do resto.
          </p>

          <BetaSignupForm variant="hero" className="justify-center" />

          <p className="text-sm text-slate-500 mt-4">
            🔒 Seus dados estão seguros • 🚀 Configure em menos de 2 minutos
          </p>
        </div>

        {/* Hero Visual */}
        <div className="mt-16 max-w-5xl mx-auto">
          <div className="relative bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-8 md:p-12 shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
            
            <div className="relative grid md:grid-cols-3 gap-6 text-white">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
                <MessageSquare className="h-10 w-10 mb-3" />
                <h3 className="font-bold text-lg mb-2">WhatsApp Bot</h3>
                <p className="text-sm text-white/90">Envie mensagens naturais</p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
                <Camera className="h-10 w-10 mb-3" />
                <h3 className="font-bold text-lg mb-2">OCR Inteligente</h3>
                <p className="text-sm text-white/90">Tire foto do recibo</p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
                <BarChart3 className="h-10 w-10 mb-3" />
                <h3 className="font-bold text-lg mb-2">Dashboard Completo</h3>
                <p className="text-sm text-white/90">Visualize tudo online</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              Tudo Que Você Precisa
            </h2>
            <p className="text-xl text-slate-600">
              Funcionalidades pensadas para brasileiros
            </p>
          </div>

          <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group relative bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-8 hover:shadow-xl transition-shadow">
              <div className="bg-emerald-600 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">
                WhatsApp Bot
              </h3>
              <p className="text-slate-600 mb-4">
                Adicione despesas por mensagem de voz ou texto. Nossa IA entende linguagem natural em português.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>Processamento de linguagem natural</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>OCR para extrair dados de recibos</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>Categorização automática</span>
                </li>
              </ul>
            </div>

            {/* Feature 2 */}
            <div className="group relative bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 hover:shadow-xl transition-shadow">
              <div className="bg-blue-600 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">
                Gestão de Orçamentos
              </h3>
              <p className="text-slate-600 mb-4">
                Crie orçamentos por categoria e acompanhe seus gastos em tempo real com alertas inteligentes.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>Orçamentos mensais personalizados</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>Alertas de gastos excessivos</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>Acompanhamento de progresso</span>
                </li>
              </ul>
            </div>

            {/* Feature 3 */}
            <div className="group relative bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 hover:shadow-xl transition-shadow">
              <div className="bg-purple-600 w-14 h-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">
                Relatórios Detalhados
              </h3>
              <p className="text-slate-600 mb-4">
                Visualize seus dados financeiros com gráficos interativos e insights inteligentes.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <span>Gráficos e análises visuais</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <span>Tendências de gastos</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <span>Exportação de dados</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              Como Funciona
            </h2>
            <p className="text-xl text-slate-600">
              Comece a usar em 4 passos simples
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8">
              {/* Step 1 */}
              <div className="relative">
                <div className="bg-emerald-100 text-emerald-700 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl mb-4 mx-auto">
                  1
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2 text-center">
                  Cadastre-se
                </h3>
                <p className="text-slate-600 text-center text-sm">
                  Entre na lista beta e receba seu convite
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="bg-emerald-100 text-emerald-700 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl mb-4 mx-auto">
                  2
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2 text-center">
                  Conecte o WhatsApp
                </h3>
                <p className="text-slate-600 text-center text-sm">
                  Autorize seu número no dashboard
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="bg-emerald-100 text-emerald-700 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl mb-4 mx-auto">
                  3
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2 text-center">
                  Envie Despesas
                </h3>
                <p className="text-slate-600 text-center text-sm">
                  Por mensagem ou foto do recibo
                </p>
              </div>

              {/* Step 4 */}
              <div className="relative">
                <div className="bg-emerald-100 text-emerald-700 w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl mb-4 mx-auto">
                  4
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2 text-center">
                  Acompanhe
                </h3>
                <p className="text-slate-600 text-center text-sm">
                  Veja tudo organizado no dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8 text-center">
            <div>
              <Globe className="h-12 w-12 mx-auto mb-4 text-emerald-400" />
              <h3 className="text-3xl font-bold mb-2">100%</h3>
              <p className="text-slate-300">Bot em Português</p>
            </div>
            <div>
              <Camera className="h-12 w-12 mx-auto mb-4 text-emerald-400" />
              <h3 className="text-3xl font-bold mb-2">OCR</h3>
              <p className="text-slate-300">Reconhecimento de Recibos</p>
            </div>
            <div>
              <Shield className="h-12 w-12 mx-auto mb-4 text-emerald-400" />
              <h3 className="text-3xl font-bold mb-2">Seguro</h3>
              <p className="text-slate-300">Dados Criptografados</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-emerald-600 to-green-700">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center text-white">
            <Sparkles className="h-16 w-16 mx-auto mb-6 animate-pulse" />
            
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Seja um dos Primeiros
            </h2>
            
            <p className="text-xl md:text-2xl mb-8 text-emerald-50">
              Vagas limitadas para o acesso beta. 
              Cadastre-se agora e transforme sua gestão financeira!
            </p>

            <BetaSignupForm variant="cta" />

            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-emerald-100">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <span>Notificações por e-mail</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>100% gratuito na beta</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-900 text-slate-400 text-center text-sm">
        <div className="container mx-auto px-4">
          <NexFinLogo className="justify-center mb-4" size="sm" />
          <p>© 2025 NexFinApp. Todos os direitos reservados.</p>
          <p className="mt-2">Controle financeiro inteligente pelo WhatsApp 🇧🇷</p>
        </div>
      </footer>
    </div>
  )
}
