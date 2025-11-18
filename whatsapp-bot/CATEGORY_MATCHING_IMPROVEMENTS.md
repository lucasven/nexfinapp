# Category Matching Improvements

## Overview

This document describes the enhanced category matching system implemented to improve accuracy when users send messages or use OCR for expense tracking in the WhatsApp bot.

## Problem Statement

The original category matching system had several limitations:

1. **No fuzzy matching** - typos caused failures (e.g., "comda" wouldn't match "comida")
2. **No Portuguese normalization** - accent variations failed (e.g., "saude" vs "saúde")
3. **Binary matching** - no confidence scores for ambiguous cases
4. **Limited OCR context** - only used description keywords
5. **No learning** - didn't learn from user corrections
6. **Language mismatch** - English categories vs Portuguese keywords
7. **Hardcoded keywords** - maintenance burden for merchant mappings

## Solution Architecture

### 1. Centralized Category Matcher (`src/services/category-matcher.ts`)

A new service that provides:

- **Fuzzy string matching** using Levenshtein distance algorithm
- **Portuguese text normalization** (removes accents, handles special chars)
- **Confidence scoring** (0-1 scale) for all matches
- **Multi-strategy matching**:
  - Exact match (confidence: 1.0)
  - Fuzzy match (confidence: similarity ratio)
  - Keyword/synonym match (confidence: 0.85)
  - Substring match (confidence: 0.8)

#### Key Functions

```typescript
// Main matching function with confidence scoring
findBestCategoryMatch(categoryName: string, options: MatchOptions): Promise<CategoryMatch | null>

// Matching with fallback to "Other"
findCategoryWithFallback(categoryName: string, options: MatchOptions): Promise<CategoryMatch>

// OCR-specific category detection from descriptions
guessCategoryFromDescription(description: string, userId: string): Promise<CategoryMatch | null>

// Batch processing for multiple transactions
batchMatchCategories(categoryNames: string[], options: MatchOptions): Promise<Map<string, CategoryMatch>>

// Portuguese text normalization
normalizePortugueseText(text: string): string
```

#### Built-in Category Keywords

The matcher includes extensive Portuguese keywords for common categories:

- **Food & Dining**: restaurante, lanchonete, padaria, mercado, supermercado, ifood, etc.
- **Transportation**: uber, taxi, combustível, gasolina, posto, metro, ônibus, etc.
- **Shopping**: magazine, lojas, shopping, americanas, shopee, amazon, etc.
- **Entertainment**: cinema, teatro, netflix, spotify, disney, youtube, etc.
- **Healthcare**: farmácia, drogaria, hospital, clínica, médico, etc.
- **Education**: escola, faculdade, curso, livro, livraria, etc.
- **Bills & Utilities**: energia, água, internet, telefone, vivo, tim, claro, etc.
- **Rent**: aluguel, moradia, imóvel, condomínio, iptu, etc.

### 2. Database Enhancements (`fe/scripts/002_category_improvements.sql`)

New tables to support advanced matching:

#### `category_synonyms`
Stores alternative names and keywords for categories.

```sql
- synonym: alternative name/keyword
- language: default 'pt-BR'
- is_merchant: flag for merchant names
- confidence: match confidence (0.00-1.00)
```

#### `user_category_preferences`
Tracks user's category choices for learning patterns.

```sql
- description_pattern: merchant/description pattern
- category_id: chosen category
- frequency: number of times used
- last_used_at: timestamp for recency
```

#### `category_corrections`
Audit trail of category changes to improve predictions.

```sql
- original_category_id: what was initially assigned
- corrected_category_id: what user changed it to
- description: transaction description
- correction_source: manual_edit, bot_command, etc.
```

#### `merchant_category_mapping`
Maps merchant names to categories (global + user-specific).

```sql
- merchant_name: normalized merchant name
- category_id: mapped category
- confidence: mapping confidence
- is_global: true for system mappings
- user_id: for user-specific overrides
```

Pre-loaded with 50+ common Brazilian merchants:
- Food: IFOOD, RAPPI, UBER EATS, MC DONALDS, CARREFOUR, etc.
- Transport: UBER, 99, SHELL, PETROBRAS, IPIRANGA, etc.
- Shopping: AMAZON, MERCADO LIVRE, SHOPEE, MAGAZINE LUIZA, etc.
- Entertainment: NETFLIX, SPOTIFY, DISNEY, HBO, YOUTUBE, etc.
- Bills: VIVO, TIM, CLARO, ENEL, CEMIG, COPASA, etc.
- Healthcare: DROGASIL, DROGA RAIA, PAGUE MENOS, etc.

### 3. Enhanced OCR Processing

#### Updated Functions
- `processImage()` - Now accepts optional `userId` parameter
- `parseExpensesFromText()` - Uses new matcher instead of hardcoded keywords
- `parseCreditCardSMS()` - Enhanced with fuzzy category matching
- `parseMultipleTransactions()` - Batch category matching support

#### Improvements
- Merchant names automatically mapped to categories
- User-specific merchant preferences honored
- Fuzzy matching for OCR text errors
- Confidence tracking for all matches

### 4. Improved AI Prompts

Enhanced system prompt with:

**Category Matching Instructions**:
- Prioritize custom categories over default ones
- Semantic matching (not just keywords)
- Merchant name inference (IFOOD → food, UBER → transport)
- Typo handling (comda → comida)
- Amount-based hints (R$ 5000 likely rent/salary)
- Portuguese normalization (saúde = saude)

**Category Matching Examples**:
```
- "supermercado" → "Food & Dining"
- "saude" / "saúde" → "Healthcare"
- "comda" (typo) → "Food & Dining"
- "UBER" → "Transportation"
- "NETFLIX" → "Entertainment"
```

### 5. User Experience Enhancements

#### Confidence Indicators
When category match confidence is below 80%:
```
⚠️ Categoria sugerida com 65% de certeza. Se estiver incorreta, você pode alterá-la.
```

#### Logging
Low-confidence matches are logged for analysis:
```typescript
logger.info('Low confidence category match', {
  inputCategory: 'comda',
  matchedCategory: 'Food & Dining',
  confidence: 0.75,
  matchType: 'fuzzy'
})
```

## Matching Strategy Flow

```
1. EXACT MATCH (confidence: 1.0)
   ↓ if no match
2. FUZZY MATCH (confidence: similarity ratio)
   ↓ if no match or low confidence
3. KEYWORD MATCH (confidence: 0.85)
   ↓ if no match
4. SUBSTRING MATCH (confidence: 0.8)
   ↓ if no match or below threshold
5. FALLBACK to "Other Expense/Income" (confidence: 0.5)
```

## Custom Category Prioritization

Categories are fetched with custom categories listed first:
```sql
SELECT * FROM categories
WHERE type = 'expense'
  AND (user_id = '<user_id>' OR user_id IS NULL)
ORDER BY is_custom DESC
```

When multiple categories match, custom ones are preferred.

## Examples

### Example 1: Typo Handling
```
Input: "gastei 50 em comda"
Process:
  1. Exact match "comda" → no match
  2. Fuzzy match "comda" vs "comida" → similarity: 0.83
  3. Match found: "Food & Dining", confidence: 0.83
  4. User sees: ⚠️ warning (below 0.8 threshold)
```

### Example 2: Portuguese Accents
```
Input: "consulta saude"
Process:
  1. Normalize: "consulta saude" (already normalized)
  2. Keyword match: "saude" in Healthcare keywords
  3. Match found: "Healthcare", confidence: 0.85
```

### Example 3: Merchant Recognition
```
OCR Text: "IFOOD PEDIDO R$ 45,00"
Process:
  1. Description: "IFOOD PEDIDO"
  2. Merchant lookup: "IFOOD" → global mapping
  3. Match found: "Food & Dining", confidence: 0.95
```

### Example 4: Custom Category Priority
```
User has custom category: "Comida Delivery"
Input: "gastei 30 no ifood"
Process:
  1. AI extracts: category="comida"
  2. Fuzzy match against all categories
  3. Both "Comida Delivery" (custom) and "Food & Dining" match
  4. Custom category prioritized
  5. Match: "Comida Delivery"
```

## Migration Guide

### 1. Run Database Migration
```bash
# Apply the schema changes
psql -U your_user -d your_database -f fe/scripts/002_category_improvements.sql
```

### 2. Verify Merchant Mappings
```sql
SELECT merchant_name, c.name as category, confidence
FROM merchant_category_mapping m
JOIN categories c ON m.category_id = c.id
WHERE is_global = true;
```

### 3. Monitor Performance
Check logs for low-confidence matches:
```bash
grep "Low confidence category match" logs/app.log
```

### 4. Add Custom Merchants (Optional)
```sql
INSERT INTO merchant_category_mapping (merchant_name, category_id, is_global, confidence)
VALUES (
  'YOUR_MERCHANT',
  (SELECT id FROM categories WHERE name = 'Food & Dining' LIMIT 1),
  true,
  0.90
);
```

## Testing

### Test Cases

1. **Exact Match**
   - Input: "Food & Dining" → Match: "Food & Dining" (confidence: 1.0)

2. **Fuzzy Match**
   - Input: "comda" → Match: "comida" (confidence: ~0.83)
   - Input: "trasporte" → Match: "transporte" (confidence: ~0.88)

3. **Portuguese Normalization**
   - Input: "saude" → Match: "Saúde" (confidence: 1.0)
   - Input: "educacao" → Match: "Educação" (confidence: 1.0)

4. **Keyword Match**
   - Input: "comprei no mercado" → Match: "Food & Dining" (confidence: 0.85)
   - Input: "consulta médica" → Match: "Healthcare" (confidence: 0.85)

5. **Merchant Match**
   - OCR: "IFOOD R$ 50" → Match: "Food & Dining" (confidence: 0.95)
   - OCR: "UBER R$ 20" → Match: "Transportation" (confidence: 0.95)

6. **Custom Category Priority**
   - User has: "Comida" (custom)
   - Input: "mercado" → Match: "Comida" (not "Food & Dining")

### Running Tests

```bash
# Run unit tests for category matcher
npm test src/services/category-matcher.test.ts

# Test OCR with sample images
npm test src/ocr/image-processor.test.ts

# Integration test
npm test src/handlers/transactions/expenses.test.ts
```

## Performance Considerations

1. **Database Indexes**: All lookup tables have indexes on frequently queried columns
2. **Batch Processing**: Use `batchMatchCategories()` for multiple transactions
3. **Caching**: Consider caching category lists per user
4. **Async Processing**: All matching is async to avoid blocking

## Future Enhancements

1. **Machine Learning**: Train ML model on user corrections for personalized matching
2. **Location Context**: Use transaction location for better category inference
3. **Time Context**: Consider time of day (e.g., morning purchases → breakfast)
4. **Amount Patterns**: Learn typical amount ranges per category per user
5. **Merchant Auto-Learning**: Automatically add new merchants to mapping table
6. **Multi-language Support**: Extend beyond Portuguese

## Troubleshooting

### Categories Not Matching

1. Check if category exists in database
2. Verify Portuguese normalization is working
3. Check confidence threshold (default: 0.6)
4. Review logs for match attempts

### Low Confidence Warnings

1. Add synonyms to `category_synonyms` table
2. Update merchant mappings
3. Adjust confidence thresholds if too strict
4. Train users to use consistent category names

### Performance Issues

1. Check database indexes
2. Monitor category table size
3. Consider batch processing for OCR
4. Review AI prompt length

## Support

For issues or questions:
- Check logs: `logs/app.log`
- Review metrics: `category_corrections` table
- Contact: [Your support channel]

---

**Version**: 1.0
**Date**: 2025-11-17
**Author**: Claude Code Assistant
