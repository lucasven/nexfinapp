# 🚀 Guia de Deploy Completo

## Pré-requisitos

- [ ] Conta GitHub
- [ ] Conta Vercel (para app web)
- [ ] Conta Railway (para bot WhatsApp)
- [ ] Conta Supabase configurada
- [ ] Git instalado
- [ ] GitHub CLI (`gh`) instalado (opcional, mas recomendado)

## Parte 1: Setup do GitHub (Repositório Privado)

### Opção A: Usando GitHub CLI (Recomendado)

```bash
# 1. Inicialize o repositório
git init

# 2. Adicione todos os arquivos
git add .

# 3. Faça o primeiro commit
git commit -m "Initial commit: Expense tracker with WhatsApp bot"

# 4. Crie repositório privado no GitHub
gh repo create lv-expense-tracker --private --source=. --push

# 5. Configure branch protection (opcional)
gh api repos/:owner/lv-expense-tracker/branches/main/protection \
  --method PUT \
  -f required_status_checks='{"strict":true,"contexts":[]}' \
  -f enforce_admins=false \
  -f required_pull_request_reviews='{"dismiss_stale_reviews":true}'
```

### Opção B: Manualmente via Web

```bash
# 1. Inicialize e commit local
git init
git add .
git commit -m "Initial commit: Expense tracker with WhatsApp bot"

# 2. Crie repositório no GitHub
# - Vá para https://github.com/new
# - Nome: lv-expense-tracker
# - Visibilidade: Private ✓
# - NÃO inicialize com README, .gitignore ou license

# 3. Adicione remote e faça push
git remote add origin https://github.com/SEU-USERNAME/lv-expense-tracker.git
git branch -M main
git push -u origin main
```

## Parte 2: Deploy da Aplicação Web (Vercel)

### Via Vercel CLI

```bash
# 1. Instale Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
vercel

# 4. Configure variáveis de ambiente
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL

# 5. Deploy para produção
vercel --prod
```

### Via Dashboard Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Click em "Add New Project"
3. Importe o repositório GitHub `lv-expense-tracker`
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Adicione Environment Variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
   NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=https://seu-app.vercel.app
   ```
6. Click "Deploy"

## Parte 3: Deploy do Bot WhatsApp (Railway)

### 1. Conecte GitHub ao Railway

1. Acesse [railway.app](https://railway.app)
2. Click "New Project"
3. Selecione "Deploy from GitHub repo"
4. Escolha `lv-expense-tracker`

### 2. Configure o Projeto

1. **Root Directory**: `whatsapp-bot`
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start`

### 3. Adicione Variáveis de Ambiente

No dashboard Railway, adicione:
```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-role-key
SESSION_SECRET=sua-string-aleatoria-segura
PORT=3001
AUTH_STATE_PATH=/app/auth-state
```

⚠️ **IMPORTANTE**: Use `SUPABASE_SERVICE_KEY` (não a anon key)!

### 4. Configure Volume Persistente

1. No Railway dashboard, vá para o serviço do bot
2. Click em "Volumes" tab
3. Click "New Volume"
4. Configure:
   - **Mount Path**: `/app/auth-state`
   - **Size**: 1GB (suficiente)

### 5. Deploy

1. Click "Deploy"
2. Aguarde o build completar
3. Vá para "Logs"
4. Procure pelo QR code no log
5. Escaneie com WhatsApp

### 6. Configure Health Check

Railway vai automaticamente usar o endpoint `/health` configurado no código.

## Parte 4: Configuração do Supabase

### 1. Execute Migrações

No Supabase SQL Editor, execute em ordem:

```sql
-- 1. Schema inicial
-- Cole e execute scripts/001_initial_schema.sql

-- 2. Schema WhatsApp
-- Cole e execute scripts/002_whatsapp_integration.sql
```

### 2. Configure URL Callbacks (para auth)

No Supabase Dashboard:
1. Vá para Authentication > URL Configuration
2. Adicione:
   - Site URL: `https://seu-app.vercel.app`
   - Redirect URLs:
     - `https://seu-app.vercel.app/**`
     - `http://localhost:3000/**` (para desenvolvimento)

### 3. Configure Email Templates (opcional)

Customize os templates de email em Authentication > Email Templates

## Verificação Pós-Deploy

### App Web ✓
- [ ] Acessar URL do Vercel
- [ ] Criar conta
- [ ] Fazer login
- [ ] Adicionar uma despesa
- [ ] Ver dashboard atualizado

### Bot WhatsApp ✓
- [ ] Ver logs do Railway mostrando "Conectado ao WhatsApp"
- [ ] Enviar "ajuda" para o bot
- [ ] Receber mensagem de boas-vindas
- [ ] Fazer login via WhatsApp
- [ ] Adicionar despesa pelo bot
- [ ] Verificar no app web

## Monitoramento

### Railway Logs
```bash
# Via CLI (se instalado)
railway logs
```

Ou acesse via dashboard: `railway.app/project/<seu-projeto>/deployments`

### Vercel Logs

Acesse: `vercel.com/<seu-projeto>/deployments`

## Troubleshooting

### Bot não conecta ao WhatsApp
1. Verifique logs no Railway
2. Certifique-se que o volume está montado corretamente
3. Delete o volume e recrie (perde sessão, precisa escanear QR novamente)

### Bot perde conexão
1. Verifique se o volume persistente está configurado
2. Railway pode ter reiniciado o container - normal, deve reconectar automaticamente
3. Se persistir, verifique logs para erros

### Erro de autenticação no bot
1. Verifique `SUPABASE_SERVICE_KEY` (não use anon key!)
2. Teste credenciais no app web primeiro
3. Verifique RLS policies no Supabase

### OCR não funciona
1. Tesseract demora alguns segundos na primeira execução
2. Verifique logs do Railway se Tesseract foi instalado
3. Teste com imagem de boa qualidade primeiro

## Atualizações Futuras

```bash
# 1. Faça mudanças no código
git add .
git commit -m "Descrição das mudanças"
git push

# 2. Deploy automático
# - Vercel detecta push e faz deploy automático
# - Railway detecta push e faz deploy automático
```

## Custos Estimados

- **Supabase**: Free tier (até 500MB DB, 50MB storage)
- **Vercel**: Free tier (suficiente para projetos pessoais)
- **Railway**: $5/mês de crédito grátis, depois ~$5-10/mês
  - Bot usa ~512MB RAM
  - Volume 1GB

**Total**: ~$0-10/mês dependendo do uso

## Backup

### Backup do Banco (Supabase)
```bash
# Via Supabase CLI
supabase db dump > backup.sql
```

### Backup do Estado WhatsApp
- Railway faz backup automático do volume
- Pode exportar via Railway CLI se necessário

---

✅ **Deploy Completo!** Seu sistema está no ar 🚀

