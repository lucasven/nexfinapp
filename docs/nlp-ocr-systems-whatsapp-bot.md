# NLP & OCR Systems - WhatsApp Bot

## Overview

The WhatsApp bot implements a **3-layer intent recognition system** with **AI-assisted OCR processing** for receipt scanning. The architecture prioritizes speed and cost efficiency through intelligent caching and pattern matching.

**Total Code**: ~2000 lines across NLP, OCR, and AI services
**Primary Libraries**:
- **NLP**: Compromise.js (with numbers extension)
- **OCR**: Tesseract.js + Sharp (image preprocessing)
- **AI**: OpenAI GPT-4o-mini + text-embedding-3-small
- **Vector Search**: Supabase pgvector

---

## 3-Layer NLP Intent Recognition System

### Architecture Flow

```
User Message
    ↓
Layer 1: Explicit Commands (/add, /budget, etc.)
    ↓ [if no match]
Layer 2: Semantic Cache (pgvector similarity search)
    ↓ [if no match]
Layer 3: OpenAI LLM (GPT-4o-mini with structured outputs)
    ↓
Parsed Intent + Entities
```

**Performance Targets**:
- Layer 1: <10ms (regex + command parsing)
- Layer 2: 50-100ms (vector similarity search)
- Layer 3: 800-1500ms (LLM API call)
- **Goal**: 60% cache hit rate (Layer 2) to minimize costs

**Cost Optimization**:
- Layer 1: Free (local processing)
- Layer 2: ~$0.00002 per embedding lookup
- Layer 3: ~$0.0015 per LLM call (GPT-4o-mini)
- Cache hit rate of 60% reduces costs by 85%

---

## Layer 1: Explicit Command Parsing

**Purpose**: Instant recognition of structured commands with `/` prefix

**Implementation**: `whatsapp-bot/src/nlp/intent-parser.ts`

### Supported Commands

| Command | Syntax | Example | Confidence |
|---------|--------|---------|-----------|
| `/add` | `/add <valor> <categoria> [data] [descrição]` | `/add 50 comida 15/10 almoço` | 0.95 |
| `/budget` | `/budget <categoria> <valor> [mes/ano]` | `/budget comida 500 outubro` | 0.95 |
| `/recurring` | `/recurring <nome> <valor> dia <dia>` | `/recurring netflix 30 dia 15` | 0.95 |
| `/report` | `/report [mes] [ano] [categoria]` | `/report outubro 2024 comida` | 0.95 |
| `/list` | `/list [categories\|recurring\|budgets\|transactions]` | `/list categories` | 0.95 |
| `/categories` | `/categories [add\|remove] [nome]` | `/categories add lazer` | 0.95 |
| `/help` | `/help [comando]` | `/help add` | 0.95 |

### Command Parsing Logic

```typescript
function parseExplicitCommand(message: string, customDate?: Date): ParsedIntent | null {
  if (!message.trim().startsWith('/')) return null

  const parts = message.split(/\s+/)
  const command = parts[0].substring(1).toLowerCase()
  const args = parts.slice(1)

  switch (command) {
    case 'add': return parseAddCommand(args, customDate)
    case 'budget': return parseBudgetCommand(args)
    case 'recurring': return parseRecurringCommand(args)
    // ... other commands
  }
}
```

**Entity Extraction**:
- **Amount**: Parses `R$ 50`, `50 reais`, `50,00` → `50.0`
- **Date**: Parses `15/10`, `15/10/2024`, `hoje`, `ontem` → `YYYY-MM-DD`
- **Payment Method**: Detects `pix`, `cartão`, `débito`, bank names → normalized string
- **Category**: Extracts from argument position or context

**Performance**: <10ms per message

---

## Layer 2: Semantic Cache (pgvector)

**Purpose**: Fast lookup of similar previously-parsed messages

**Implementation**: `whatsapp-bot/src/services/ai/semantic-cache.ts`

### How It Works

1. **Embedding Generation**:
   - Convert user message to 1536-dim vector using OpenAI `text-embedding-3-small`
   - Cost: $0.00002 per message

2. **Vector Similarity Search**:
   - Query `message_embeddings` table with pgvector
   - Use cosine distance (`<=>` operator)
   - Threshold: 0.85 similarity (1.0 = exact match)

3. **Cache Hit**:
   - Return cached `ParsedIntent` from database
   - Update `last_used_at` and increment `usage_count`
   - Track cache hit for analytics

**Database Schema**:
```sql
CREATE TABLE message_embeddings (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  message_text TEXT NOT NULL,
  embedding vector(1536),  -- OpenAI text-embedding-3-small
  parsed_intent JSONB NOT NULL,  -- Cached ParsedIntent
  usage_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IVFFlat index for fast similarity search
CREATE INDEX message_embeddings_embedding_idx
  ON message_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

**Database Function**:
```sql
find_similar_messages(p_user_id, p_embedding, p_similarity_threshold=0.85, p_limit=5)
  RETURNS TABLE (id, message_text, parsed_intent, similarity, usage_count)
```

**Performance**:
- Average lookup: 50-100ms
- Cache hit rate target: 60%
- Per-user isolation (user_id filter)

**Cost Analysis**:
- Embedding: $0.00002 per message
- Cache lookup: Negligible (database query)
- **Savings**: Avoiding $0.0015 LLM call = 75x cheaper

**Example Flow**:
```
User: "gastei 50 de comida hoje"
  → Generate embedding (50ms)
  → Find similar: "gastei 45 comida ontem" (0.92 similarity)
  → Return cached intent: { action: "add_expense", entities: {amount: 50, category: "comida", date: "2024-10-15"} }
```

---

## Layer 3: OpenAI LLM (GPT-4o-mini)

**Purpose**: Fallback for complex/novel natural language inputs

**Implementation**: `whatsapp-bot/src/services/ai/ai-pattern-generator.ts`

### How It Works

1. **User Context Loading**:
   - Fetch user's categories, recent patterns, preferred categories from database
   - Build context object with category mappings, synonyms, merchant mappings

2. **LLM Prompt** (with structured outputs):
```typescript
const systemPrompt = `You are an expense tracking assistant for a Brazilian user.
Parse the user's message into a structured transaction.

Available categories: ${categories.join(', ')}
Recent patterns: ${patterns.map(p => `"${p.message}" → ${p.category}`).join('\n')}

Output JSON schema:
{
  "action": "add_expense" | "add_income" | "set_budget" | ...,
  "confidence": 0.0-1.0,
  "entities": {
    "amount": number,
    "category": string,
    "description": string,
    "date": "YYYY-MM-DD" | undefined,
    "type": "income" | "expense",
    "paymentMethod": string | undefined
  }
}

Rules:
- Infer missing entities from context
- Use user's category history for better matching
- Return confidence < 0.7 if ambiguous
`
```

3. **Structured Output**:
   - OpenAI function calling with JSON schema enforcement
   - Validates response format automatically
   - Retry logic for malformed responses

4. **Cache Storage**:
   - After successful parse, store embedding + intent in database
   - Future similar messages will hit Layer 2 instead

**Performance**:
- Average latency: 800-1500ms
- Cost: ~$0.0015 per call
- Only triggered if Layer 1 and Layer 2 fail

**Example Flow**:
```
User: "comprei um livro de python por 80 reais ontem paguei com pix"
  → Layer 1: No explicit command
  → Layer 2: No similar cached message
  → Layer 3: LLM parse
    {
      "action": "add_expense",
      "confidence": 0.9,
      "entities": {
        "amount": 80,
        "category": "educação",  // inferred from "livro" + user context
        "description": "livro de python",
        "date": "2024-10-14",  // "ontem"
        "type": "expense",
        "paymentMethod": "PIX"
      }
    }
  → Store in cache for future
```

---

## Natural Language Parsing (Compromise.js)

**Library**: Compromise.js + compromise-numbers extension

**Purpose**: Lightweight NLP for entity extraction before LLM

**Usage in Layer 1 (post-command parsing)**:
```typescript
import nlp from 'compromise'
import numbers from 'compromise-numbers'
nlp.extend(numbers)

const doc = nlp(message.toLowerCase())

// Entity extraction helpers
function extractAmount(message: string): number | undefined {
  // Patterns: "R$ 50,00", "50 reais", "gastei 50"
  const match = message.match(/R\$?\s*(\d+(?:[.,]\d{1,2})?)/)
  return match ? parseFloat(match[1].replace(',', '.')) : undefined
}

function extractCategory(message: string): string | undefined {
  // Match against known categories + synonyms
  const categories = ['comida', 'transporte', 'saúde', 'educação', ...]
  return categories.find(cat => message.toLowerCase().includes(cat))
}

function extractDate(message: string, customDate?: Date): string | undefined {
  // Patterns: "hoje", "ontem", "15/10", "15/10/2024"
  if (message.includes('hoje')) return formatDate(new Date())
  if (message.includes('ontem')) return formatDate(new Date(Date.now() - 86400000))

  const match = message.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/)
  if (match) {
    const [_, day, month, year = new Date().getFullYear()] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return undefined
}
```

**Intent Detection Keywords**:
| Intent | Keywords |
|--------|----------|
| Expense | gastei, paguei, comprei, despesa |
| Income | recebi, ganhei, salário, receita, entrou |
| Budget | orçamento, budget, limite |
| Report | relatório, resumo, balanço, análise |
| Recurring | recorrente, mensal, todo mês, fixa |
| Help | ajuda, help, comandos |
| Login | login, entrar |
| Logout | sair, logout, desconectar |

**Confidence Scores**:
- Explicit commands: 0.95
- Natural language with full entities: 0.85-0.90
- Partial match: 0.60-0.80
- Ambiguous: 0.50 (triggers clarification)

---

## OCR System (Receipt/SMS Scanning)

**Purpose**: Extract expense data from images (receipts, bank SMS, statements)

**Implementation**: `whatsapp-bot/src/ocr/image-processor.ts`

### Architecture Flow

```
Image (WhatsApp)
    ↓
Sharp.js Preprocessing (greyscale, normalize, sharpen)
    ↓
Tesseract.js OCR (Portuguese language pack)
    ↓
Text Extraction (with confidence score)
    ↓
Pattern-Based Parsing (credit card SMS, bank statements, receipts)
    ↓ [if patterns fail]
AI-Assisted Parsing (GPT-4o-mini with OCR-specific prompt)
    ↓
Expense Data[]
```

### Image Preprocessing (Sharp.js)

**Steps**:
1. **Greyscale**: Convert to greyscale to reduce noise
2. **Normalize**: Adjust brightness/contrast for consistent OCR
3. **Sharpen**: Enhance edge detection for better text recognition

```typescript
const processedImage = await sharp(imageBuffer)
  .greyscale()
  .normalize()
  .sharpen()
  .toBuffer()
```

**Performance**: ~100-200ms for typical receipt image

### OCR Engine (Tesseract.js)

**Configuration**:
- Language: Portuguese (`'por'`)
- Engine: Tesseract 4.0 with LSTM
- Output: Text + confidence score (0-100)

```typescript
const worker = await createWorker('por')
const { data: { text, confidence } } = await worker.recognize(processedImage)
await worker.terminate()
```

**Performance**:
- Average: 2-4 seconds for receipt image
- Confidence: Typically 70-90 for good images

**Confidence Thresholds**:
- > 80: High confidence, auto-process
- 60-80: Medium confidence, confirm with user
- < 60: Low confidence, manual entry suggested

### Pattern-Based Expense Extraction

**Strategy 1: Credit Card SMS Parsing**

Format:
```
Compra aprovada no LATAM PASS
MC BLACK p/ ISMAIRA O
VENTURELL - MINIMERCADO
PAQUISTAO valor RS 8,50 em
13/10/2025 as 17h50.
```

Extraction logic:
1. Split by "Compra aprovada" for multiple transactions
2. Extract amount: `valor\s+(?:R\$?|RS)\s*([\d.,]+)`
3. Extract merchant: Lines before "valor" (skip card type, holder)
4. Extract date: `(\d{1,2}\/\d{1,2}\/\d{4})` or `(\d{1,2}\/\d{1,2})`
5. Guess category from merchant name
6. Default payment method: "Credit Card"

**Strategy 2: Bank Statement Parsing**

Format:
```
15/10/2024 14:30 COMPRA CARTAO 50,00 MERCADO ABC
15/10/2024 15:45 DEBITO 25,50 FARMACIA XYZ
```

Pattern:
```typescript
/(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,2}:\d{2}\s+(?:COMPRA|DEBITO|PAGAMENTO)\s+(?:CARTAO|CARTAO\s+\d+)\s+([\d.,]+)\s+([A-Za-záàâãéèêíïóôõöúçñ\s]+)/gi
```

**Strategy 3: Generic Receipt Parsing**

Patterns:
1. `R$ 50,00 - ESTABELECIMENTO`
2. `ESTABELECIMENTO R$ 50,00`
3. `Compra aprovada: R$ 50,00 em ESTABELECIMENTO`
4. `Débito de R$ 50,00 - ESTABELECIMENTO`

**Strategy 4: Multiple Transaction Detection**

For receipts with multiple items:
```
ITEM 1: 25,00
ITEM 2: 15,50
TOTAL: 40,50
```

Pattern:
```typescript
/(?:item|produto|servico)\s*\d*:?\s*([\d.,]+)/gi
```

### Category Guessing from Merchants

**Method 1: Merchant Mapping (Database)**

Query `merchant_category_mapping` table:
```sql
SELECT category_id, confidence
FROM merchant_category_mapping
WHERE merchant_name ILIKE '%{extracted_merchant}%'
  AND (user_id = {user_id} OR is_global = true)
ORDER BY confidence DESC, is_global ASC
LIMIT 1
```

**Pre-populated Merchants** (80+ Brazilian merchants):
- Food: IFOOD, RAPPI, UBER EATS, MCDONALDS, CARREFOUR, EXTRA
- Transport: UBER, 99, CABIFY, SHELL, IPIRANGA
- Shopping: AMAZON, MERCADO LIVRE, SHOPEE, MAGAZINE LUIZA
- Entertainment: NETFLIX, SPOTIFY, DISNEY+, HBO
- Bills: VIVO, TIM, CLARO, ENEL, CEMIG, SABESP
- Healthcare: DROGASIL, DROGA RAIA, PAGUE MENOS
- Education: UDEMY, COURSERA

**Method 2: Keyword Matching (Fallback)**

```typescript
const categoryMappings = {
  'comida': ['restaurante', 'lanchonete', 'padaria', 'mercado', 'supermercado', 'ifood', ...],
  'transporte': ['uber', 'taxi', '99', 'posto', 'combustível', 'gasolina', ...],
  'compras': ['magazine', 'lojas', 'shopping', 'amazon', 'shopee', ...],
  'entretenimento': ['cinema', 'teatro', 'netflix', 'spotify', ...],
  'saúde': ['farmácia', 'hospital', 'clínica', 'médico', ...],
  'educação': ['escola', 'faculdade', 'curso', 'livro', ...],
  'contas': ['energia', 'água', 'internet', 'telefone', ...],
}
```

### AI-Assisted OCR Parsing (Fallback)

**Trigger**: When pattern-based parsing fails or confidence is low

**Process**:
1. Load user context (categories, category types, recent patterns)
2. Call `parseOCRWithAI(ocrText, userContext)` with specialized prompt
3. Parse structured JSON response with schema validation
4. Infer missing `type` field from category if AI fails to provide it

**Specialized OCR Prompt**:
```typescript
const systemPrompt = `You are parsing OCR text from a receipt or bank SMS.
The text may contain errors or formatting issues typical of OCR.

User's categories: ${categories.join(', ')}
Category types: ${categoryTypes}

Expected output JSON schema for multiple transactions:
{
  "action": "add_expense",
  "entities": {
    "transactions": [
      {
        "amount": number,
        "description": string,
        "category": string,  // Must match user's categories
        "type": "income" | "expense",  // REQUIRED
        "date": "YYYY-MM-DD" | undefined,
        "paymentMethod": string | undefined
      }
    ]
  }
}

Rules:
- Normalize merchant names (MINIMERCADO PAQUISTAO → Minimercado Paquistão)
- Infer category from merchant context
- ALWAYS provide the 'type' field based on category type
- Extract all transactions from the text
- Handle OCR errors gracefully
`
```

**Type Inference Fallback**:
If AI fails to provide `type` field:
```typescript
function inferTypeFromCategory(
  category: string,
  categoryTypeMap: Map<string, 'income' | 'expense'>
): 'income' | 'expense' {
  const normalized = category.toLowerCase().trim()

  // Exact match
  if (categoryTypeMap.has(normalized)) {
    return categoryTypeMap.get(normalized)
  }

  // Fuzzy match
  for (const [catName, catType] of categoryTypeMap.entries()) {
    if (normalized.includes(catName) || catName.includes(normalized)) {
      return catType
    }
  }

  // Default to expense
  return 'expense'
}
```

**Performance**:
- OCR: 2-4 seconds
- Pattern parsing: 10-50ms
- AI fallback: +1-2 seconds
- Total: 2-6 seconds typical

---

## Payment Method Detection

**Extracted from Context**:
```typescript
function detectPaymentMethod(text: string): string | undefined {
  const lower = text.toLowerCase()

  if (lower.includes('cartao') || lower.includes('cartão') || lower.includes('credito')) {
    return 'Credit Card'
  }
  if (lower.includes('débito') || lower.includes('debito')) {
    return 'Debit Card'
  }
  if (lower.includes('pix')) {
    return 'PIX'
  }
  if (lower.includes('dinheiro') || lower.includes('cash')) {
    return 'Cash'
  }

  return undefined
}
```

**Sources**:
- Credit Card SMS: "MC BLACK", "VISA", "ELO" → Credit Card
- Bank statement: "DEBITO", "PIX" → Debit/PIX
- Receipt context: keywords in text

---

## Date Extraction

**Supported Formats**:
| Format | Example | Output |
|--------|---------|--------|
| DD/MM/YYYY | 15/10/2024 | 2024-10-15 |
| DD/MM | 15/10 | 2024-10-15 (infers year) |
| hoje / hj | "gastei 50 hoje" | {current_date} |
| ontem | "gastei 50 ontem" | {current_date - 1 day} |
| mês passado | "relatório do mês passado" | {previous month} |
| Month names | "janeiro", "fevereiro" | {parsed month + year} |

**Implementation**:
```typescript
function extractDate(message: string, customDate?: Date): string | undefined {
  const now = customDate || new Date()
  const text = message.toLowerCase()

  if (text.includes('hoje') || text.includes('hj')) {
    return formatDateLocal(now)
  }

  if (text.includes('ontem')) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return formatDateLocal(yesterday)
  }

  // DD/MM/YYYY
  const fullMatch = message.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (fullMatch) {
    const [_, day, month, year] = fullMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // DD/MM (infer year)
  const shortMatch = message.match(/(\d{1,2})\/(\d{1,2})/)
  if (shortMatch) {
    const [_, day, month] = shortMatch
    let year = now.getFullYear()
    const parsed = new Date(`${year}-${month}-${day}`)
    if (parsed < now) year += 1  // If past, assume next year
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return undefined
}
```

---

## AI Usage Tracking & Cost Management

**Daily Limit System**:
- Default: $1.00 per user per day
- Configurable per user in `user_ai_usage` table
- Admin override available

**Cost Tracking**:
```typescript
// Before AI call
const canProceed = await checkDailyLimit(userId)
if (!canProceed) {
  throw new Error('Daily AI usage limit exceeded')
}

// After AI call
await recordAIUsage(userId, cost, 'llm', inputTokens, outputTokens)
```

**Cost Calculation**:
```typescript
// GPT-4o-mini pricing (as of 2024)
const INPUT_COST_PER_1M_TOKENS = 0.15   // $0.15 per 1M tokens
const OUTPUT_COST_PER_1M_TOKENS = 0.60  // $0.60 per 1M tokens

function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_1M_TOKENS
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M_TOKENS
  return inputCost + outputCost
}

// Embedding cost
const EMBEDDING_COST_PER_1M_TOKENS = 0.02  // $0.02 per 1M tokens (text-embedding-3-small)
```

**Usage Statistics**:
- `llm_calls_count` / `llm_calls_today`: LLM API calls
- `embedding_calls_count` / `embedding_calls_today`: Embedding API calls
- `cache_hits_count` / `cache_hits_today`: Semantic cache hits
- `cache_hit_rate`: Calculated percentage

**Daily Reset**:
- Automatic reset at midnight UTC
- Function `check_daily_limit()` handles reset logic

---

## Error Handling & Fallbacks

**NLP Pipeline**:
1. Layer 1 fails → Try Layer 2
2. Layer 2 fails → Try Layer 3
3. Layer 3 fails → Return `{ action: 'unknown', confidence: 0 }`
4. Unknown intent → Send help message

**OCR Pipeline**:
1. Image preprocessing fails → Return error to user
2. Tesseract OCR fails → Return error to user
3. Pattern parsing fails → Try AI parsing
4. AI parsing fails → Return partial results or error
5. No transactions found → Ask user to clarify

**Confidence Thresholds**:
- ≥ 0.85: Auto-execute action
- 0.70-0.84: Confirm with user
- < 0.70: Request clarification

**Example Clarification Flow**:
```
User: "gastei dinheiro na loja"
  → Confidence: 0.60 (ambiguous amount and category)
  → Bot: "Quanto você gastou? Em qual categoria?"
User: "50 reais em compras"
  → Confidence: 0.90
  → Bot: "Despesa de R$ 50,00 em compras registrada!"
```

---

## Testing Strategy

**Unit Tests**:
- `nlp/intent-parser.test.ts`: Test command parsing and entity extraction
- `ocr/image-processor.test.ts`: Test OCR patterns with mock images

**Test Coverage**:
- Explicit commands: All commands with valid/invalid inputs
- Natural language: Edge cases (ambiguous, incomplete, typos)
- OCR: Credit card SMS, bank statements, receipts with variations
- Date parsing: All supported formats
- Amount extraction: Currency symbols, decimal separators

**Example Test**:
```typescript
describe('intent-parser', () => {
  it('parses explicit /add command', () => {
    const intent = parseIntent('/add 50 comida 15/10 almoço')
    expect(intent.action).toBe('add_expense')
    expect(intent.confidence).toBe(0.95)
    expect(intent.entities.amount).toBe(50)
    expect(intent.entities.category).toBe('comida')
    expect(intent.entities.date).toBe('2024-10-15')
    expect(intent.entities.description).toBe('almoço')
  })

  it('parses natural language expense', () => {
    const intent = parseIntent('gastei 30 reais de uber ontem')
    expect(intent.action).toBe('add_expense')
    expect(intent.confidence).toBeGreaterThan(0.80)
    expect(intent.entities.amount).toBe(30)
    expect(intent.entities.category).toBe('transporte')
  })
})
```

---

## Performance Metrics

**NLP Pipeline**:
| Layer | Avg Latency | Cost | Cache Hit Rate |
|-------|-------------|------|----------------|
| Layer 1 | <10ms | $0 | N/A |
| Layer 2 | 50-100ms | $0.00002 | 60% target |
| Layer 3 | 800-1500ms | $0.0015 | N/A |

**OCR Pipeline**:
| Step | Avg Latency | Notes |
|------|-------------|-------|
| Image preprocessing | 100-200ms | Sharp.js |
| OCR (Tesseract) | 2-4 seconds | Depends on image size |
| Pattern parsing | 10-50ms | Regex-based |
| AI fallback | +1-2 seconds | If patterns fail |
| **Total** | **2-6 seconds** | Typical receipt |

**Cost Per Message** (with 60% cache hit rate):
- 40% Layer 3 (LLM): 0.40 × $0.0015 = $0.0006
- 60% Layer 2 (Cache): 0.60 × $0.00002 = $0.000012
- **Average cost**: $0.000612 per message
- **vs. No Cache**: $0.0015 per message (59% savings)

---

## Localization Support

**Languages**:
- **Primary**: Portuguese (pt-BR)
- **Secondary**: English (en) - partial support

**Localized Elements**:
- Intent keywords: `gastei` (pt) vs. `spent` (en)
- Date names: `ontem`, `hoje`, month names
- Category names: `comida` (pt) → `food` (en)
- Command help text: Fully translated

**Implementation**:
```typescript
// localization/pt-br.ts
export const messages = {
  commands: {
    add: '/add <valor> <categoria> [data] [descrição]',
    budget: '/budget <categoria> <valor> [mes/ano]',
    // ...
  },
  keywords: {
    expense: ['gastei', 'paguei', 'comprei'],
    income: ['recebi', 'ganhei', 'salário'],
    // ...
  },
  commandHelp: {
    add: 'Use /add para registrar uma despesa...',
    // ...
  }
}
```

---

## Future Enhancements

**Planned**:
- Multi-language support (Spanish, English)
- Voice message transcription (Whisper API)
- Receipt photo quality analysis (pre-OCR check)
- Semantic search for transaction history
- Intent clarification dialog system
- Category learning from user corrections
- Merchant database expansion (crowdsourced)

**Under Consideration**:
- On-device OCR (reduce latency + cost)
- Custom fine-tuned model for Portuguese financial NLP
- Real-time spending alerts via proactive messages
- Receipt duplicate detection
- Automatic recurring payment detection from receipts

---

**Generated**: 2025-11-21
**Code Lines**: ~2000 across NLP, OCR, AI services
**Primary Languages**: Portuguese (pt-BR), English (en)
**AI Model**: OpenAI GPT-4o-mini + text-embedding-3-small
**OCR Engine**: Tesseract.js 4.0 + Sharp preprocessing
