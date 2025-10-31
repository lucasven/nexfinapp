# 🚀 Guia de Início Rápido

## ⏱️ 5 Minutos para o Primeiro Deploy

### Pré-requisitos Checklist
- [ ] Node.js 18+ instalado
- [ ] Conta Supabase criada
- [ ] Conta GitHub
- [ ] Conta Vercel (para web app)
- [ ] Conta Railway (para bot)

---

## 📋 Passo a Passo

### 1️⃣ Setup Supabase (2 min)

1. Crie projeto no [Supabase](https://supabase.com)
2. Vá para SQL Editor
3. Execute em ordem:
   ```sql
   -- Cole scripts/001_initial_schema.sql
   -- Cole scripts/002_whatsapp_integration.sql
   ```
4. Copie suas credenciais:
   - Project URL
   - Anon key (para web app)
   - Service role key (para bot)

### 2️⃣ Setup GitHub (1 min)

```bash
# Torne o script executável
chmod +x setup-github.sh

# Execute
./setup-github.sh
```

Ou manualmente:
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create lv-expense-tracker --private --source=. --push
```

### 3️⃣ Deploy Web App (1 min)

**Via Vercel CLI:**
```bash
npm i -g vercel
vercel login
vercel

# Adicione env vars quando solicitado:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Ou via Dashboard Vercel:**
1. Novo projeto → Importar do GitHub
2. Selecione `lv-expense-tracker`
3. Adicione env vars
4. Deploy!

### 4️⃣ Deploy Bot WhatsApp (1 min)

**Railway Dashboard:**
1. New Project → Deploy from GitHub
2. Selecione `lv-expense-tracker`
3. Root Directory: `whatsapp-bot`
4. Adicione env vars:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...  ⚠️ Service role, não anon!
   SESSION_SECRET=qualquer_string_aleatoria
   PORT=3001
   ```
5. Configure Volume:
   - Mount path: `/app/auth-state`
   - Size: 1GB
6. Deploy!

### 5️⃣ Conectar WhatsApp (30 seg)

1. Vá para Railway → Logs
2. Aguarde QR code aparecer
3. Abra WhatsApp no celular
4. Dispositivos Conectados → Conectar dispositivo
5. Escaneie o QR code
6. ✅ Bot conectado!

---

## 🎉 Pronto para Usar!

### Teste Web App
1. Acesse sua URL Vercel
2. Crie uma conta
3. Adicione primeira despesa
4. Veja dashboard atualizar

### Teste Bot WhatsApp
1. Envie "ajuda" para o bot
2. Faça login:
   ```
   Login: seu-email@example.com sua-senha
   ```
3. Adicione despesa:
   ```
   Gastei R$50 em comida
   ```
4. Veja despesa aparecer no web app!

---

## 📱 Exemplos de Comandos

### Básico
```
ajuda
Login: email@example.com senha123
sair
```

### Despesas
```
Gastei R$50 em comida
Paguei 30 reais de uber ontem
Adicionar despesa de 100 em mercado
[Envie foto de SMS bancário]
```

### Orçamentos
```
Definir orçamento de comida em R$500
Mostrar meus orçamentos
```

### Relatórios
```
Relatório deste mês
Resumo de despesas
Mostrar minhas despesas
```

### Recorrências
```
Adicionar aluguel mensal de R$1200 no dia 1
Mostrar pagamentos recorrentes
```

---

## 🐛 Troubleshooting Rápido

### Bot não conecta
```bash
# Verifique logs no Railway
# Se necessário, recrie volume e escaneie QR novamente
```

### Erro de autenticação no bot
```bash
# Certifique-se que está usando SUPABASE_SERVICE_KEY
# Não use SUPABASE_ANON_KEY no bot!
```

### OCR não funciona
```bash
# Tesseract demora ~3s na primeira execução
# Use imagem de boa qualidade
# Verifique logs do Railway
```

---

## 📚 Documentação Completa

- **README.md** - Visão geral do projeto
- **DEPLOY.md** - Guia detalhado de deploy
- **PROJECT_STRUCTURE.md** - Estrutura do código
- **IMPLEMENTATION_SUMMARY.md** - Resumo técnico
- **whatsapp-bot/README.md** - Doc do bot

---

## ✅ Checklist de Sucesso

- [ ] Web app acessível
- [ ] Conta criada
- [ ] Despesa adicionada via web
- [ ] Bot WhatsApp conectado
- [ ] Login feito via bot
- [ ] Despesa adicionada via bot
- [ ] Despesa aparece em ambos
- [ ] OCR testado (opcional)
- [ ] Grupo testado (opcional)

**🎊 Parabéns! Seu sistema está funcionando!**

---

## 🔗 Links Úteis

- [Baileys Docs](https://whiskeysockets.github.io/Baileys/)
- [Supabase Docs](https://supabase.com/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [Railway Docs](https://docs.railway.app)
- [Vercel Docs](https://vercel.com/docs)

---

**Precisa de ajuda?** Abra uma issue no GitHub!

