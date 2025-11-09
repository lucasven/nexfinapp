# WhatsApp Bot para Rastreador de Despesas

Bot de WhatsApp para gerenciar despesas, orçamentos, pagamentos recorrentes e relatórios financeiros através de conversas em linguagem natural (Português BR).

## Funcionalidades

- 💰 **Despesas e Receitas**: Adicione transações via texto ou imagens (OCR)
- 📊 **Orçamentos**: Defina e monitore orçamentos por categoria
- 🔄 **Pagamentos Recorrentes**: Gerencie despesas fixas mensais
- 📈 **Relatórios**: Visualize resumos financeiros e análises
- 📁 **Categorias**: Liste e crie categorias personalizadas
- 🤖 **Linguagem Natural**: Comandos em português brasileiro
- 👥 **Suporte a Grupos**: Funciona em conversas individuais e grupos
- 🧠 **IA Auto-Aprendizagem**: Bot aprende seus padrões de linguagem
- 💳 **Métodos de Pagamento**: Aprende suas preferências por categoria
- 📱 **Múltiplas Transações**: Processa várias transações em uma mensagem

## Instalação

### Requisitos

- Node.js 18+
- Conta Supabase com database configurado
- WhatsApp ativo

### Configuração Local

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente (crie um arquivo `.env`):
```env
# Supabase Configuration
SUPABASE_URL=sua_url_supabase
SUPABASE_ANON_KEY=sua_chave_anonima
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# OpenAI Configuration (Opcional - para fallback de IA)
OPENAI_API_KEY=sua_chave_openai

# Bot Configuration
BOT_NAME=Expense Tracker Bot
LOG_LEVEL=info
```

3. Execute o bot:
```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

4. Escaneie o QR code que aparecerá no terminal com seu WhatsApp

## Sistema de IA Auto-Aprendizagem

O bot possui um sistema inteligente de 4 camadas para processar mensagens:

### 1. Comandos Explícitos (Mais Rápido)
```
/add 50 comida
/budget transporte 200
/report este mês
```

### 2. Padrões Aprendidos (Personalizado)
O bot aprende seus padrões de linguagem e os reutiliza:
- Primeira vez: "gastei 50 paus no mercado" → IA processa e salva padrão
- Próximas vezes: Reconhecimento instantâneo!

### 3. Processamento Local (Gratuito)
Usa bibliotecas locais para entender linguagem natural básica.

### 4. IA Fallback (Aprendizado)
Para mensagens complexas, usa OpenAI para entender e criar novos padrões.

### Vantagens:
- ✅ **Custo Baixo**: IA usada apenas uma vez por padrão
- ✅ **Personalizado**: Aprende sua forma de falar
- ✅ **Rápido**: Padrões aprendidos são instantâneos
- ✅ **Inteligente**: Melhora com o tempo

## Deploy no Railway

1. Faça push do código para o GitHub

2. Conecte o repositório ao Railway

3. Configure as variáveis de ambiente no dashboard do Railway:
   - `SUPABASE_URL`: URL do seu projeto Supabase
   - `SUPABASE_SERVICE_KEY`: Service key do Supabase
   - `OPENAI_API_KEY`: Chave da API do OpenAI
   - `AUTH_STATE_PATH`: `/app/auth-state` (caminho do volume)

4. Configure um volume persistente em `/app/auth-state` para manter a sessão do WhatsApp

5. O bot será deployado automaticamente

6. **Autenticação via QR Code Web**:
   - Após o deploy, acesse: `https://seu-app.railway.app/qr`
   - Uma página web bonita mostrará o QR Code
   - Escaneie com seu WhatsApp:
     1. Abra WhatsApp no celular
     2. Vá em **Mais opções (⋮) > Aparelhos conectados**
     3. Toque em **Conectar um aparelho**
     4. Escaneie o QR Code da página
   - ✅ A página se auto-atualiza a cada 10 segundos
   - 🗑️ Use o botão "Limpar Autenticação" para desconectar e gerar novo QR Code

## Exemplos de Uso

### Autenticação
```
Login: meuemail@example.com minhasenha
```

### Adicionar Despesas
```
Gastei R$50 em comida
Paguei 30 reais de uber ontem
Adicionar despesa de 100 em mercado
```

### Orçamentos
```
Definir orçamento de comida em R$500
Mostrar meus orçamentos
Status do orçamento
```

### Despesas Recorrentes
```
Adicionar aluguel mensal de R$1200 no dia 1
Mostrar pagamentos recorrentes
```

### Relatórios
```
Relatório deste mês
Resumo de despesas
Mostrar minhas despesas
```

### Categorias
```
Listar categorias
Adicionar categoria Academia
```

### OCR - Envie uma foto de SMS bancário ou extrato
O bot automaticamente extrairá o valor e descrição da despesa!

## Estrutura do Projeto

```
whatsapp-bot/
├── src/
│   ├── auth/               # Gerenciamento de sessões
│   ├── handlers/           # Handlers de mensagens por feature
│   ├── localization/       # Mensagens em português BR
│   ├── nlp/               # Parser de linguagem natural
│   ├── ocr/               # Processamento de imagens
│   ├── services/          # Cliente Supabase
│   ├── types.ts           # Definições de tipos
│   └── index.ts           # Ponto de entrada
├── package.json
├── tsconfig.json
├── nixpacks.toml          # Config Railway
└── railway.json
```

## Tecnologias

- **Baileys**: API WhatsApp Web
- **Compromise**: NLP em JavaScript
- **Tesseract.js**: OCR para extração de texto
- **Supabase**: Backend e autenticação
- **TypeScript**: Tipagem estática
- **Railway**: Deploy e hosting

## Licença

MIT

