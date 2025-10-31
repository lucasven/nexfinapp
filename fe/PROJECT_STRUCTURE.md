# 📂 Estrutura do Projeto

```
lv-expense-tracker/
│
├── 📱 APLICAÇÃO WEB (Next.js)
│   ├── app/                           # Next.js App Router
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   └── page.tsx          # Página de login
│   │   │   └── signup/
│   │   │       └── page.tsx          # Página de cadastro
│   │   ├── budgets/
│   │   │   └── page.tsx              # Gerenciamento de orçamentos
│   │   ├── recurring/
│   │   │   └── page.tsx              # Despesas recorrentes
│   │   ├── reports/
│   │   │   └── page.tsx              # Relatórios financeiros
│   │   ├── layout.tsx                # Layout raiz
│   │   ├── page.tsx                  # Dashboard principal
│   │   └── globals.css               # Estilos globais
│   │
│   ├── components/                    # Componentes React
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   └── ...
│   │   ├── balance-card.tsx          # Card de balanço
│   │   ├── budget-card.tsx           # Card de orçamento
│   │   ├── budget-dialog.tsx         # Dialog criar orçamento
│   │   ├── category-chart.tsx        # Gráfico categorias
│   │   ├── recurring-dialog.tsx      # Dialog recorrências
│   │   ├── transaction-dialog.tsx    # Dialog transações
│   │   ├── transaction-list.tsx      # Lista transações
│   │   ├── trend-chart.tsx           # Gráfico tendências
│   │   ├── user-menu.tsx             # Menu usuário
│   │   └── yearly-chart.tsx          # Gráfico anual
│   │
│   ├── lib/                          # Bibliotecas e utilitários
│   │   ├── actions/                  # Server Actions
│   │   │   ├── budgets.ts           # CRUD orçamentos
│   │   │   ├── recurring.ts         # CRUD recorrências
│   │   │   ├── reports.ts           # Geração relatórios
│   │   │   └── transactions.ts      # CRUD transações
│   │   ├── supabase/
│   │   │   ├── client.ts            # Cliente Supabase (browser)
│   │   │   └── server.ts            # Cliente Supabase (server)
│   │   ├── types.ts                 # Tipos TypeScript
│   │   └── utils.ts                 # Funções utilitárias
│   │
│   ├── middleware.ts                 # Middleware auth Next.js
│   ├── next.config.ts               # Config Next.js
│   ├── tailwind.config.js           # Config Tailwind
│   └── package.json                 # Dependências web app
│
├── 🤖 BOT WHATSAPP (Node.js)
│   └── whatsapp-bot/
│       ├── src/
│       │   ├── handlers/            # Handlers de features
│       │   │   ├── auth.ts         # ✅ Login/Logout
│       │   │   ├── budgets.ts      # ✅ Orçamentos
│       │   │   ├── categories.ts   # ✅ Categorias
│       │   │   ├── expenses.ts     # ✅ Despesas/Receitas
│       │   │   ├── message-handler.ts  # ✅ Roteador central
│       │   │   ├── recurring.ts    # ✅ Recorrências
│       │   │   └── reports.ts      # ✅ Relatórios
│       │   │
│       │   ├── auth/
│       │   │   └── session-manager.ts  # ✅ Gerenciador sessões
│       │   │
│       │   ├── nlp/
│       │   │   └── intent-parser.ts    # ✅ Parser PT-BR
│       │   │
│       │   ├── ocr/
│       │   │   └── image-processor.ts  # ✅ OCR Tesseract
│       │   │
│       │   ├── services/
│       │   │   └── supabase-client.ts  # ✅ Cliente Supabase
│       │   │
│       │   ├── localization/
│       │   │   └── pt-br.ts        # ✅ Mensagens PT-BR
│       │   │
│       │   ├── types.ts            # Tipos TypeScript
│       │   └── index.ts            # ✅ Main bot + Health check
│       │
│       ├── .env.example            # Template env vars
│       ├── .gitignore             # Ignorar auth-state/
│       ├── package.json           # Dependências bot
│       ├── tsconfig.json          # Config TypeScript
│       ├── nixpacks.toml          # ✅ Config Railway
│       ├── railway.json           # ✅ Config Railway
│       ├── README.md              # Doc específica bot
│       └── CHANGELOG.md           # Histórico versões
│
├── 🗄️ DATABASE
│   └── scripts/
│       ├── 001_initial_schema.sql      # ✅ Schema inicial
│       └── 002_whatsapp_integration.sql # ✅ Schema WhatsApp
│
├── 📚 DOCUMENTAÇÃO
│   ├── README.md                  # ✅ Doc principal
│   ├── DEPLOY.md                  # ✅ Guia deploy completo
│   ├── IMPLEMENTATION_SUMMARY.md  # ✅ Resumo implementação
│   ├── PROJECT_STRUCTURE.md       # ✅ Este arquivo
│   └── LICENSE                    # ✅ MIT License
│
├── 🔧 CONFIGURAÇÃO
│   ├── .gitignore                # ✅ Git ignore
│   ├── setup-github.sh           # ✅ Script setup GitHub
│   ├── components.json           # Config shadcn/ui
│   ├── eslint.config.mjs         # Config ESLint
│   ├── postcss.config.mjs        # Config PostCSS
│   └── tsconfig.json             # Config TypeScript
│
└── 📦 OUTROS
    ├── node_modules/             # Deps (gitignored)
    ├── .next/                    # Build Next.js (gitignored)
    └── public/                   # Assets estáticos
```

## 🎯 Arquivos Chave por Funcionalidade

### Autenticação
- **Web**: `app/auth/`, `middleware.ts`, `lib/supabase/`
- **Bot**: `whatsapp-bot/src/handlers/auth.ts`, `src/auth/session-manager.ts`
- **DB**: `scripts/002_whatsapp_integration.sql` (tabela sessions)

### Despesas & Receitas
- **Web**: `lib/actions/transactions.ts`, `components/transaction-*.tsx`
- **Bot**: `whatsapp-bot/src/handlers/expenses.ts`
- **DB**: `scripts/001_initial_schema.sql` (tabela transactions)

### Orçamentos
- **Web**: `app/budgets/page.tsx`, `lib/actions/budgets.ts`
- **Bot**: `whatsapp-bot/src/handlers/budgets.ts`
- **DB**: `scripts/001_initial_schema.sql` (tabela budgets)

### Recorrências
- **Web**: `app/recurring/page.tsx`, `lib/actions/recurring.ts`
- **Bot**: `whatsapp-bot/src/handlers/recurring.ts`
- **DB**: `scripts/001_initial_schema.sql` (tabelas recurring_*)

### Relatórios
- **Web**: `app/reports/page.tsx`, `lib/actions/reports.ts`
- **Bot**: `whatsapp-bot/src/handlers/reports.ts`

### OCR (Apenas Bot)
- **Bot**: `whatsapp-bot/src/ocr/image-processor.ts`
- **Deps**: Tesseract.js, Sharp

### NLP (Apenas Bot)
- **Bot**: `whatsapp-bot/src/nlp/intent-parser.ts`
- **Deps**: Compromise, Compromise-numbers

## 📊 Fluxo de Dados

```
WhatsApp User
    ↓ (mensagem)
Bot (index.ts)
    ↓ (parse)
NLP Parser
    ↓ (intent + entities)
Message Handler
    ↓ (route)
Feature Handler (auth/expenses/budgets/etc)
    ↓ (query/mutate)
Supabase Client
    ↓ (RLS check)
PostgreSQL Database
    ↓ (result)
Response PT-BR
    ↓ (send)
WhatsApp User
```

## 🔄 Integração Web ↔ Bot

```
                  Supabase Database
                        ↑  ↓
                    (RLS policies)
                        ↑  ↓
        ┌───────────────┴──┴───────────────┐
        ↓                                  ↓
   Web App (Next.js)              Bot (Node.js)
   - Client Key                   - Service Key
   - User auth                    - Bot auth
   - Browser UI                   - WhatsApp UI
   - Server Actions               - Message handlers
```

**Mesmas Tabelas, Mesma Lógica, Diferentes Interfaces**

## 📝 Comandos Úteis

### Web App
```bash
npm install              # Instalar deps
npm run dev             # Dev mode
npm run build           # Build produção
npm start               # Start produção
npm run lint            # Lint código
```

### Bot
```bash
cd whatsapp-bot
npm install             # Instalar deps
npm run dev            # Dev mode
npm run build          # Build TypeScript
npm start              # Start produção
```

### Deploy
```bash
./setup-github.sh      # Setup GitHub
vercel                 # Deploy web
# Railway via dashboard
```

## 🎨 Stack Visual

```
┌─────────────────────────────────────────┐
│           FRONTEND (Next.js)            │
│  React 19 + TypeScript + Tailwind CSS   │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
┌───────────┐  ┌──────────────┐
│  Vercel   │  │   Supabase   │
│  Hosting  │  │   Database   │
└───────────┘  └──────┬───────┘
                      │
               ┌──────┴──────┐
               ↓             ↓
        ┌─────────┐   ┌────────────┐
        │ Web App │   │ WhatsApp   │
        │ Client  │   │    Bot     │
        └─────────┘   └─────┬──────┘
                            │
                    ┌───────┴────────┐
                    │    Railway     │
                    │    Hosting     │
                    └────────────────┘
```

---

**🎉 Projeto Completo e Bem Estruturado!**

