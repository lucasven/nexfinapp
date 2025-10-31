# 🔧 Troubleshooting WhatsApp Bot

## Error 405 - Connection Failure

### O que é?
O erro 405 significa que o WhatsApp está bloqueando ou limitando suas tentativas de conexão. Isso é uma medida de segurança do WhatsApp.

### Por que acontece?
- Muitas tentativas de conexão em curto período
- IP bloqueado temporariamente
- Limite de dispositivos conectados atingido
- Mudanças na API do WhatsApp

### ✅ Soluções (tente nesta ordem):

#### 1. **Limpar e Aguardar** (Mais efetivo)
```bash
# Pare o bot (Ctrl+C)
# Delete a pasta auth-state
rm -rf whatsapp-bot/auth-state

# AGUARDE 5-10 MINUTOS antes de tentar novamente
# Isso permite que o rate limit do WhatsApp expire

# Depois reinicie
cd whatsapp-bot
npm run dev
```

#### 2. **Trocar de Rede**
```bash
# Se possível, tente de outra rede:
# - Use dados móveis (hotspot do celular)
# - Conecte em outro Wi-Fi
# - Use VPN (não recomendado, pode piorar)
```

#### 3. **Verificar WhatsApp Web**
```bash
# 1. Abra WhatsApp Web no navegador
# 2. Vá em Dispositivos Conectados
# 3. Desconecte TODOS os dispositivos antigos
# 4. Aguarde 5 minutos
# 5. Tente conectar o bot novamente
```

#### 4. **Usar Outro Número**
```bash
# Se tiver outro número WhatsApp disponível:
# 1. Use-o para conectar o bot
# 2. Configure a autenticação com esse número
```

---

## Erro 401 - Unauthorized

### Causa
Sessão expirada ou inválida.

### Solução
```bash
rm -rf whatsapp-bot/auth-state
npm run dev
# Escaneie o QR code novamente
```

---

## Bot Desconecta Sozinho

### Possíveis causas:
- WhatsApp Web desconectado no celular
- Sessão expirada
- Problemas de rede

### Solução
```bash
# 1. Verifique se o WhatsApp está aberto no celular
# 2. Verifique dispositivos conectados
# 3. Se persistir, reconecte:
rm -rf whatsapp-bot/auth-state
npm run dev
```

---

## QR Code Não Aparece

### Solução
```bash
# 1. Certifique-se que está rodando o bot:
cd whatsapp-bot
npm run dev

# 2. Se não aparecer, force limpeza:
rm -rf auth-state node_modules package-lock.json
npm install
npm run dev
```

---

## OCR Não Funciona / Muito Lento

### Primeira execução é lenta (normal)
- Tesseract carrega os language packs (~3-5 segundos)
- Execuções seguintes são mais rápidas

### Melhorar precisão:
- Use imagens com boa iluminação
- Texto claro e legível
- Evite fotos muito comprimidas
- SMS bancários funcionam melhor que extratos fotografados

---

## Mensagens Não São Respondidas

### Verificações:
1. Bot está conectado? (veja logs)
2. Em grupos, mencionou o bot? (`@bot` ou `bot`)
3. Fez login no bot? (`Login: email senha`)
4. Verifique logs para erros

### Debug:
```bash
# Veja os logs em tempo real
cd whatsapp-bot
npm run dev

# Envie "ajuda" - deve responder
# Envie "Login: seu-email senha" - deve autenticar
```

---

## NLP Não Entende Comando

### Comandos suportados:
```
✅ Funciona:
- "Gastei R$50 em comida"
- "Paguei 30 reais de uber ontem"
- "Definir orçamento de comida em R$500"

❌ Não funciona:
- Comandos em inglês (use português)
- Sintaxe muito complexa
- Valores sem número (ex: "muito dinheiro")
```

### Dica:
Use comandos mais diretos se o bot não entender.

---

## Erro ao Instalar Dependências

### No Mac (problemas com Sharp):
```bash
brew install vips
npm install
```

### No Linux (Tesseract):
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr tesseract-ocr-por
npm install
```

---

## Bot Funciona Local mas Falha no Railway

### Checklist Railway:
- [ ] Variáveis de ambiente configuradas?
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY` (não anon key!)
  - `SESSION_SECRET`
  - `PORT=3001`
- [ ] Volume persistente configurado?
  - Mount path: `/app/auth-state`
- [ ] Nixpacks instalou Tesseract?
  - Verifique logs do build

### Ver QR Code no Railway:
```bash
# No Railway, vá para:
# Project > Deployments > Latest > View Logs
# O QR code aparecerá nos logs
```

---

## Performance Lenta

### Normal:
- Primeira mensagem: ~1-2s
- OCR primeira vez: ~3-5s
- Mensagens seguintes: ~500ms

### Se muito lento:
1. Verifique conexão internet
2. Verifique logs do Supabase (lento?)
3. Railway pode estar limitando recursos

---

## 🆘 Ainda com Problemas?

### Informações úteis para debug:
```bash
# 1. Versão Node
node --version  # Deve ser 18+

# 2. Logs do bot
npm run dev  # Cole os erros

# 3. Limpar TUDO e tentar de novo
rm -rf auth-state node_modules package-lock.json
npm install
# AGUARDE 10 MINUTOS
npm run dev
```

### Abra uma issue no GitHub com:
- Descrição do erro
- Logs (remova informações sensíveis)
- Versão Node
- Sistema operacional
- Quando começou (após mudança?)

---

## 🔑 Dicas Gerais

1. **Erro 405**: Sempre aguarde 5-10 min antes de retry
2. **Mantenha WhatsApp aberto** no celular
3. **Não force múltiplas conexões** simultâneas
4. **Delete auth-state** quando der qualquer erro estranho
5. **Use SUPABASE_SERVICE_KEY** no bot, não anon key

---

**Última atualização**: Janeiro 2025

