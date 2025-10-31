# Changelog - WhatsApp Bot

## [1.0.0] - 2025-01-14

### Adicionado
- ✨ Integração completa com Baileys para WhatsApp Web
- 🤖 Parser de linguagem natural em Português BR usando Compromise
- 📷 OCR com Tesseract.js para extrair despesas de imagens
- 🔐 Sistema de autenticação via WhatsApp
- 💰 Gerenciamento de despesas e receitas
- 📊 Consulta e criação de orçamentos
- 🔄 Suporte a despesas recorrentes
- 📈 Geração de relatórios financeiros
- 📁 Gerenciamento de categorias
- 👥 Suporte para grupos WhatsApp
- 🏥 Health check endpoint para Railway
- 🔒 Sessões com timeout de 24 horas
- 📝 Logs estruturados com Pino

### Funcionalidades NLP
- Reconhecimento de valores em R$ e "reais"
- Extração automática de datas (hoje, ontem, DD/MM/YYYY)
- Detecção de categorias no texto
- Parsing de dia do mês para recorrências
- Suporte para comandos naturais em português

### Segurança
- Row Level Security via Supabase
- Tokens de sessão com expiração
- Service role authentication
- Validação de inputs
- Rate limiting por usuário (via sessões)

### Deploy
- Configuração Nixpacks para Railway
- Volume persistente para auth state
- Auto-restart em caso de falha
- Health check configurado

