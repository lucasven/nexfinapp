# 📷 OCR Patterns - Supported Formats

## Credit Card SMS (Brazilian Format)

### Pattern Supported:
```
Compra aprovada no LATAM PASS
MC BLACK p/ ISMAIRA O
VENTURELL - MINIMERCADO
PAQUISTAO valor RS 8,50 em
13/10/2025 as 17h50.
```

### Extraction Logic:
1. **Identifies** by keyword: `valor RS` or `valor R$`
2. **Amount**: Extracts value after "valor" (supports R$ or RS)
3. **Merchant**: Gets last 1-2 lines before "valor" (skips card type and holder)
4. **Date**: Extracts DD/MM/YYYY format if present
5. **Category**: Auto-detected from merchant name

### What Gets Extracted:
```json
{
  "amount": 8.5,
  "description": "VENTURELL - MINIMERCADO PAQUISTAO",
  "category": "comida",
  "type": "expense",
  "date": "2025-10-13"
}
```

### Filters Applied:
- ✅ Skips lines starting with: MC, VISA, ELO, MASTERCARD, AMEX
- ✅ Skips lines with: "p/", "para" (cardholder indicators)
- ✅ Skips "Compra aprovada" header
- ✅ Combines up to 2 merchant name lines

---

## Generic Bank SMS Patterns

### Pattern 1: "Compra aprovada: R$ 50,00 em ESTABELECIMENTO"
```
Compra aprovada: R$ 50,00 em MERCADO XYZ
```
**Extracts:** R$ 50,00 | MERCADO XYZ

### Pattern 2: "R$ 50,00 - ESTABELECIMENTO"
```
R$ 50,00 - UBER TRIP
```
**Extracts:** R$ 50,00 | UBER TRIP

### Pattern 3: "ESTABELECIMENTO R$ 50,00"
```
NETFLIX ASSINATURA R$ 39,90
```
**Extracts:** R$ 39,90 | NETFLIX ASSINATURA

### Pattern 4: "Débito de R$ 50,00 - ESTABELECIMENTO"
```
Débito de R$ 100,00 - FARMACIA SAO PAULO
```
**Extracts:** R$ 100,00 | FARMACIA SAO PAULO

---

## Category Auto-Detection

The OCR automatically categorizes based on merchant keywords:

### 🍔 Comida
`mercado`, `supermercado`, `minimercado`, `restaurante`, `padaria`, `ifood`, `rappi`, etc.

### 🚗 Transporte
`uber`, `taxi`, `99`, `posto`, `gasolina`, `shell`, `estacionamento`, etc.

### 🛍️ Compras
`magazine`, `shopping`, `americanas`, `shopee`, `mercado livre`, `amazon`, etc.

### 🎬 Entretenimento
`cinema`, `netflix`, `spotify`, `disney`, `youtube`, etc.

### 🏥 Saúde
`farmacia`, `drogaria`, `hospital`, `medico`, `drogasil`, `pacheco`, etc.

### 📚 Educação
`escola`, `faculdade`, `curso`, `livro`, `universidade`, etc.

### 📄 Contas
`energia`, `agua`, `internet`, `celular`, `vivo`, `tim`, `claro`, etc.

---

## How to Use

### Send Image via WhatsApp:
1. Take photo of credit card SMS or bank notification
2. Send to bot (with or without caption)
3. Bot processes with OCR
4. Extracts expense data automatically
5. Adds to your expense tracker

### With Caption:
```
[Send image of SMS]
Caption: "despesa de ontem"
```
The caption can add context like date or category.

### Image Quality Tips:
✅ Good lighting
✅ Clear text
✅ Avoid shadows
✅ SMS screenshots work best
✅ Bank app notifications work well

❌ Avoid blurry photos
❌ Avoid handwritten receipts (low accuracy)
❌ Avoid photos of physical receipts (use SMS instead)

---

## Testing Locally

```bash
# The bot logs OCR output
# Check logs when sending image:
npm run dev

# You'll see:
# "ocr full text: [extracted text]"
# Then the parsed expense data
```

---

## Adding New Patterns

Edit `whatsapp-bot/src/ocr/image-processor.ts`:

1. Add pattern to `parseCreditCardSMS()` or `parseExpensesFromText()`
2. Test with `npm run build`
3. Send sample image to bot
4. Check logs for accuracy

---

**Last Updated**: Janeiro 2025

