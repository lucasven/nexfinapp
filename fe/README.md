# 💰 Rastreador de Despesas (Expense Tracker)

Sistema completo de gerenciamento financeiro pessoal com aplicação web Next.js e bot WhatsApp integrado.

## 🚀 Funcionalidades

### Aplicação Web
- ✅ Autenticação segura com Supabase
- 📊 Dashboard com visão geral financeira
- 💸 Gerenciamento de despesas e receitas
- 📁 Categorização customizável
- 🏷️ Sistema de tags
- 📅 Transações recorrentes
- 💰 Orçamentos por categoria
- 📈 Relatórios e análises detalhadas
- 📱 Interface responsiva e moderna

### Bot WhatsApp
- 🤖 Comandos em linguagem natural (Português BR)
- 💬 Adicionar despesas via texto
- 📷 OCR para extrair despesas de imagens (SMS bancários, extratos)
- 📊 Consultar orçamentos e relatórios
- 🔄 Gerenciar despesas recorrentes
- 👥 Suporte para grupos e mensagens diretas
- 🔐 Autenticação segura por WhatsApp

## 📁 Estrutura do Projeto

```
lv-expense-tracker/
├── app/                    # Next.js app router
│   ├── auth/              # Páginas de autenticação
│   ├── budgets/           # Gerenciamento de orçamentos
│   ├── recurring/         # Despesas recorrentes
│   └── reports/           # Relatórios
├── components/            # Componentes React
│   └── ui/               # Componentes de UI (shadcn/ui)
├── lib/
│   ├── actions/          # Server actions
│   ├── supabase/         # Cliente Supabase
│   └── types.ts          # Definições TypeScript
├── scripts/              # Scripts SQL
│   ├── 001_initial_schema.sql
│   └── 002_whatsapp_integration.sql
├── whatsapp-bot/         # Bot WhatsApp (Node.js separado)
│   ├── src/
│   │   ├── handlers/     # Handlers de features
│   │   ├── nlp/         # Parser de linguagem natural
│   │   ├── ocr/         # Processamento de imagens
│   │   └── services/    # Integrações
│   └── package.json
└── README.md
```

## 🛠️ Stack Tecnológico

### Frontend
- **Next.js 15** - Framework React com App Router
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **shadcn/ui** - Componentes UI
- **Recharts** - Gráficos e visualizações

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL Database
  - Autenticação
  - Row Level Security (RLS)
  - Real-time subscriptions

### Bot WhatsApp
- **Baileys** - API WhatsApp Web
- **Compromise** - NLP em JavaScript
- **Tesseract.js** - OCR
- **Node.js** - Runtime

## 📦 Instalação

### Pré-requisitos
- Node.js 18+
- Conta Supabase
- WhatsApp (para o bot)

### 1. Clone o repositório
```bash
git clone <repository-url>
cd lv-expense-tracker
```

### 2. Instale dependências da aplicação web
```bash
npm install
```

### 3. Configure variáveis de ambiente
Crie um arquivo `.env.local` na raiz:
```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
```

### 4. Execute as migrações no Supabase
Execute os scripts SQL em `scripts/` no Supabase SQL Editor:
1. `001_initial_schema.sql`
2. `002_whatsapp_integration.sql`

### 5. Inicie a aplicação web
```bash
npm run dev
```
Acesse em `http://localhost:3000`

### 6. Configure o Bot WhatsApp (opcional)
```bash
cd whatsapp-bot
npm install
cp .env.example .env
# Edite .env com suas credenciais
npm run dev
```
Escaneie o QR code que aparecerá no terminal.

## 🚀 Deploy

### Aplicação Web (Vercel)
```bash
vercel
```

### Bot WhatsApp (Railway)

1. Faça push para GitHub (privado):
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create lv-expense-tracker --private
git push -u origin main
```

2. No Railway:
   - Conecte o repositório GitHub
   - Selecione o diretório `whatsapp-bot`
   - Configure as variáveis de ambiente:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_KEY` (service role key)
     - `SESSION_SECRET`
     - `PORT=3001`
   - Configure volume persistente em `/app/auth-state`
   - Deploy!

3. Após o deploy, acesse os logs e escaneie o QR code

## 📱 Usando o Bot WhatsApp

### Comandos Principais

**Autenticação:**
```
Login: seu-email@example.com sua-senha
```

**Adicionar Despesas:**
```
Gastei R$50 em comida
Paguei 30 reais de uber ontem
Adicionar despesa de 100 em mercado hoje
```

**Orçamentos:**
```
Definir orçamento de comida em R$500
Mostrar meus orçamentos
Status do orçamento
```

**Despesas Recorrentes:**
```
Adicionar aluguel mensal de R$1200 no dia 1
Mostrar pagamentos recorrentes
```

**Relatórios:**
```
Relatório deste mês
Resumo de despesas
Mostrar minhas despesas
```

**Categorias:**
```
Listar categorias
Adicionar categoria Academia
```

**OCR:**
Envie uma foto de SMS bancário ou extrato - o bot extrairá automaticamente!

### Em Grupos
Mencione o bot ou comece mensagens com "bot":
```
@bot gastei R$50 em comida
bot mostrar minhas despesas
```

## 🔒 Segurança

- Autenticação via Supabase Auth
- Row Level Security (RLS) no banco de dados
- Sessões WhatsApp com expiração de 24h
- Variáveis de ambiente para credenciais sensíveis
- Service role key apenas no backend

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

MIT License - veja LICENSE para detalhes

## 🐛 Problemas Conhecidos

- OCR funciona melhor com imagens de boa qualidade
- Primeira conexão do bot pode levar alguns segundos
- Tesseract requer instalação de language packs (incluído no Nixpacks)

## 📧 Suporte

Para problemas ou dúvidas, abra uma issue no GitHub.

---

Desenvolvido com ❤️ usando Next.js, Supabase e Baileys
