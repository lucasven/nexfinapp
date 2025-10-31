#!/bin/bash

# Script para configurar o repositório GitHub privado
# Usage: ./setup-github.sh

set -e

echo "🚀 Configurando repositório GitHub para lv-expense-tracker..."
echo ""

# Verificar se git está inicializado
if [ ! -d .git ]; then
  echo "📦 Inicializando repositório Git..."
  git init
fi

# Verificar se há arquivos para commit
if [ -z "$(git status --porcelain)" ]; then
  echo "✅ Nenhuma mudança para commit"
else
  echo "📝 Adicionando arquivos ao Git..."
  git add .
  
  echo "💾 Criando commit inicial..."
  git commit -m "Initial commit: Expense tracker with WhatsApp bot integration"
fi

# Verificar branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
  echo "🔀 Renomeando branch para 'main'..."
  git branch -M main
fi

# Verificar se gh CLI está instalado
if ! command -v gh &> /dev/null; then
  echo ""
  echo "⚠️  GitHub CLI (gh) não encontrado!"
  echo ""
  echo "Opções:"
  echo "1. Instalar gh CLI:"
  echo "   - macOS: brew install gh"
  echo "   - Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md"
  echo ""
  echo "2. Ou criar repositório manualmente em https://github.com/new"
  echo "   Nome: lv-expense-tracker"
  echo "   Visibilidade: Private"
  echo ""
  echo "   Depois execute:"
  echo "   git remote add origin https://github.com/SEU-USERNAME/lv-expense-tracker.git"
  echo "   git push -u origin main"
  exit 1
fi

# Verificar se está autenticado no GitHub
echo "🔐 Verificando autenticação GitHub..."
if ! gh auth status &> /dev/null; then
  echo "Fazendo login no GitHub..."
  gh auth login
fi

# Criar repositório privado
echo "🔒 Criando repositório privado no GitHub..."
if gh repo create lv-expense-tracker --private --source=. --push; then
  echo ""
  echo "✅ Repositório criado com sucesso!"
  echo ""
  echo "📍 Repositório: https://github.com/$(gh api user -q .login)/lv-expense-tracker"
  echo ""
  echo "📋 Próximos passos:"
  echo "1. Configure Supabase (se ainda não fez)"
  echo "2. Deploy app web no Vercel"
  echo "3. Deploy bot WhatsApp no Railway"
  echo ""
  echo "Veja DEPLOY.md para instruções detalhadas!"
else
  echo ""
  echo "⚠️  Repositório pode já existir. Verifique em:"
  echo "   https://github.com/$(gh api user -q .login)/lv-expense-tracker"
  echo ""
  echo "Se precisar adicionar remote manualmente:"
  echo "git remote add origin https://github.com/$(gh api user -q .login)/lv-expense-tracker.git"
  echo "git push -u origin main"
fi

