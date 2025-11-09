import OpenAI from 'openai'
import { getSupabaseClient } from '../services/supabase-client'
import { ParsedIntent } from './pattern-storage'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export interface UserContext {
  userId: string
  recentCategories: string[]
  recentPaymentMethods: string[]
  userPreferences: any
}

/**
 * Parse message with AI and return structured intent
 */
export async function parseWithAI(
  message: string, 
  context: UserContext
): Promise<ParsedIntent> {
  const systemPrompt = createSystemPrompt(context)
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ],
    temperature: 0.1,
    max_tokens: 500
  })
  
  const response = completion.choices[0].message.content
  if (!response) {
    throw new Error('No response from AI')
  }
  
  try {
    return JSON.parse(response)
  } catch (error) {
    console.error('Error parsing AI response:', error)
    throw new Error('Invalid AI response format')
  }
}

/**
 * Generate regex pattern from user message and parsed intent
 */
export async function generatePattern(
  userMessage: string,
  parsedIntent: ParsedIntent
): Promise<string> {
  const prompt = `
Analise esta mensagem do usuário e crie um padrão regex que capture mensagens similares.

Mensagem original: "${userMessage}"
Interpretação: ${JSON.stringify(parsedIntent, null, 2)}

Crie um padrão regex em português brasileiro que:
1. Use grupos nomeados para capturar valores: (?<amount>...), (?<category>...), (?<date>...), (?<payment_method>...)
2. Seja flexível para variações similares
3. Funcione com diferentes formas de expressar a mesma ideia

Exemplos de mensagens similares que devem funcionar:
- "gastei 50 em comida"
- "paguei 30 reais de uber" 
- "comprei algo por 100"
- "despesa de 25 no mercado"

Retorne APENAS o padrão regex, sem explicações.
  `
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 200
  })
  
  const pattern = completion.choices[0].message.content?.trim()
  if (!pattern) {
    throw new Error('No pattern generated')
  }
  
  // Validate the regex pattern
  try {
    new RegExp(pattern, 'i')
    return pattern
  } catch (error) {
    console.error('Invalid regex pattern generated:', pattern)
    throw new Error('Invalid regex pattern')
  }
}

/**
 * Save confirmed pattern to database
 */
export async function savePattern(
  userId: string,
  pattern: string,
  example: string,
  output: ParsedIntent
): Promise<string | null> {
  const supabase = getSupabaseClient()
  
  const { data, error } = await supabase
    .from('learned_patterns')
    .insert({
      user_id: userId,
      pattern_type: output.action,
      regex_pattern: pattern,
      example_input: example,
      parsed_output: output.entities,
      confidence_score: output.confidence
    })
    .select('id')
    .single()
    
  if (error) {
    console.error('Error saving pattern:', error)
    return null
  }
  
  return data.id
}

/**
 * Create system prompt with user context
 */
function createSystemPrompt(context: UserContext): string {
  return `
Você é um assistente financeiro especializado em português brasileiro para um bot do WhatsApp.

Sua tarefa é extrair informações de despesas/receitas das mensagens dos usuários e retornar um JSON estruturado.

CATEGORIAS DISPONÍVEIS: ${context.recentCategories.join(', ')}

MÉTODOS DE PAGAMENTO RECENTES: ${context.recentPaymentMethods.join(', ')}

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')}

FORMATO DE RESPOSTA (JSON):
{
  "action": "add_expense|add_income|set_budget|add_recurring|show_report|list_categories|show_help",
  "confidence": 0.0-1.0,
  "entities": {
    "amount": number,
    "category": "string",
    "description": "string", 
    "date": "YYYY-MM-DD",
    "payment_method": "string",
    "transactions": [
      {
        "amount": number,
        "category": "string", 
        "description": "string",
        "date": "YYYY-MM-DD",
        "payment_method": "string"
      }
    ]
  }
}

REGRAS:
1. Se a mensagem contém múltiplas transações, use o array "transactions"
2. Para datas relativas: "ontem" = ontem, "hoje" = hoje, "amanhã" = amanhã
3. Para valores: aceite "50", "R$ 50", "50 reais", "cinquenta reais"
4. Para categorias: use as categorias disponíveis ou sugira uma similar
5. Para métodos de pagamento: use os métodos recentes ou sugira um comum
6. Confidence: 0.9+ para mensagens claras, 0.7+ para ambíguas, 0.5+ para incertas

EXEMPLOS:

"gastei 50 em comida ontem"
→ {"action": "add_expense", "confidence": 0.95, "entities": {"amount": 50, "category": "comida", "description": "comida", "date": "2024-10-13"}}

"paguei 30 reais de uber com cartão"
→ {"action": "add_expense", "confidence": 0.9, "entities": {"amount": 30, "category": "transporte", "description": "uber", "payment_method": "cartão"}}

"comprei 25 no mercado e 15 na farmácia"
→ {"action": "add_expense", "confidence": 0.9, "entities": {"transactions": [{"amount": 25, "category": "mercado", "description": "mercado"}, {"amount": 15, "category": "farmácia", "description": "farmácia"}]}}

"quero ver meu orçamento de comida"
→ {"action": "show_report", "confidence": 0.8, "entities": {"category": "comida"}}

Retorne APENAS o JSON, sem explicações.
  `
}

/**
 * Get user context for AI parsing
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  const supabase = getSupabaseClient()
  
  // Get recent categories
  const { data: recentTransactions } = await supabase
    .from('transactions')
    .select('category')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
    
  const recentCategories = [...new Set(
    recentTransactions?.map(t => t.category).filter(Boolean) || []
  )]
  
  // Get recent payment methods
  const { data: recentPaymentMethods } = await supabase
    .from('transactions')
    .select('payment_method')
    .eq('user_id', userId)
    .not('payment_method', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
    
  const recentPaymentMethodsList = [...new Set(
    recentPaymentMethods?.map(t => t.payment_method).filter(Boolean) || []
  )]
  
  // Get user preferences
  const { data: preferences } = await supabase
    .from('payment_method_preferences')
    .select('*')
    .eq('user_id', userId)
    .order('usage_count', { ascending: false })
    .limit(10)
    
  return {
    userId,
    recentCategories,
    recentPaymentMethods: recentPaymentMethodsList,
    userPreferences: preferences || []
  }
}

/**
 * Ask user for confirmation of AI parsing result
 */
export function formatConfirmationMessage(parsedIntent: ParsedIntent): string {
  const { action, entities } = parsedIntent
  
  if (action === 'add_expense') {
    if (entities.transactions && entities.transactions.length > 1) {
      // Multiple transactions
      let message = '🤔 Encontrei múltiplas despesas:\n\n'
      entities.transactions.forEach((tx, index) => {
        message += `${index + 1}. 💵 R$ ${tx.amount.toFixed(2)}\n`
        message += `   📁 ${tx.category}\n`
        if (tx.description) message += `   📝 ${tx.description}\n`
        if (tx.date) message += `   📅 ${tx.date}\n`
        if (tx.payment_method) message += `   💳 ${tx.payment_method}\n`
        message += '\n'
      })
      message += 'Está correto? (sim/não)'
      return message
    } else {
      // Single transaction
      let message = '🤔 Deixe-me entender...\n\n'
      message += 'Você quis dizer:\n'
      message += `💵 R$ ${entities.amount?.toFixed(2) || '?'}\n`
      message += `📁 ${entities.category || '?'}\n`
      if (entities.description) message += `📝 ${entities.description}\n`
      if (entities.date) message += `📅 ${entities.date}\n`
      if (entities.payment_method) message += `💳 ${entities.payment_method}\n`
      message += '\nEstá correto? (sim/não)'
      return message
    }
  }
  
  // For other actions, show a simpler confirmation
  return `🤔 Entendi que você quer: ${action}\n\nEstá correto? (sim/não)`
}

/**
 * Check if user response is a confirmation
 */
export function isConfirmation(message: string): boolean | null {
  const normalized = message.toLowerCase().trim()
  
  const yesWords = ['sim', 's', 'yes', 'y', 'correto', 'certo', 'ok', 'okay']
  const noWords = ['não', 'nao', 'n', 'no', 'incorreto', 'errado']
  
  if (yesWords.some(word => normalized.includes(word))) {
    return true
  }
  
  if (noWords.some(word => normalized.includes(word))) {
    return false
  }
  
  return null // Unknown
}

/**
 * Create a corrected pattern when user indicates the AI result was wrong
 */
export async function createCorrectedPattern(
  originalMessage: string,
  userCorrection: string,
  userId: string
): Promise<string | null> {
  const prompt = `
O usuário disse: "${originalMessage}"
Eu interpretei incorretamente e o usuário corrigiu para: "${userCorrection}"

Crie um padrão regex em português brasileiro que capture mensagens similares à original.
Use grupos nomeados: (?<amount>...), (?<category>...), (?<date>...), (?<payment_method>...)

O padrão deve:
1. Capturar a mensagem original corretamente
2. Funcionar com variações similares
3. Extrair as informações corretas conforme a correção do usuário

Exemplo de mensagens similares que devem funcionar:
- Variações da mensagem original
- Diferentes formas de expressar a mesma ideia

Retorne APENAS o padrão regex, sem explicações.
  `
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200
    })
    
    const pattern = completion.choices[0].message.content?.trim()
    if (!pattern) {
      throw new Error('No pattern generated')
    }
    
    // Validate the regex pattern
    try {
      new RegExp(pattern, 'i')
      return pattern
    } catch (error) {
      console.error('Invalid regex pattern generated:', pattern)
      throw new Error('Invalid regex pattern')
    }
  } catch (error) {
    console.error('Error creating corrected pattern:', error)
    return null
  }
}

/**
 * Parse user correction message to extract the correct intent
 */
export async function parseUserCorrection(
  correctionMessage: string,
  context: UserContext,
  transactionId?: string
): Promise<ParsedIntent | null> {
  const systemPrompt = `
Você é um assistente financeiro especializado em português brasileiro.

O usuário está corrigindo uma interpretação anterior${transactionId ? ` sobre a transação ${transactionId}` : ''}. Analise a mensagem de correção e extraia as informações corretas.

CATEGORIAS DISPONÍVEIS: ${context.recentCategories.join(', ')}
MÉTODOS DE PAGAMENTO RECENTES: ${context.recentPaymentMethods.join(', ')}
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR')}

FORMATO DE RESPOSTA (JSON):
{
  "action": "add_expense|add_income|set_budget|add_recurring|show_report|list_categories|show_help|change_category|edit_transaction",
  "confidence": 0.9,
  "entities": {
    "amount": number,
    "category": "string",
    "description": "string", 
    "date": "YYYY-MM-DD",
    "payment_method": "string",
    "transactionId": "string",
    "transactions": [
      {
        "amount": number,
        "category": "string", 
        "description": "string",
        "date": "YYYY-MM-DD",
        "payment_method": "string"
      }
    ]
  }
}

REGRAS:
1. Se a mensagem contém múltiplas transações, use o array "transactions"
2. Para datas relativas: "ontem" = ontem, "hoje" = hoje, "amanhã" = amanhã
3. Para valores: aceite "50", "R$ 50", "50 reais", "cinquenta reais"
4. Para categorias: use as categorias disponíveis ou sugira uma similar
5. Para métodos de pagamento: use os métodos recentes ou sugira um comum
6. Para mudanças de categoria: use "change_category" com o campo "category"
7. Para edições de transação: use "edit_transaction" com os campos a serem alterados
8. Confidence: 0.9+ para correções claras

Retorne APENAS o JSON, sem explicações.
  `
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: correctionMessage }
      ],
      temperature: 0.1,
      max_tokens: 500
    })
    
    const response = completion.choices[0].message.content
    if (!response) {
      throw new Error('No response from AI')
    }
    
    const parsed = JSON.parse(response)
    
    // If transaction ID was provided in context, add it to entities
    if (transactionId && !parsed.entities.transactionId) {
      parsed.entities.transactionId = transactionId
    }
    
    return parsed
  } catch (error) {
    console.error('Error parsing user correction:', error)
    return null
  }
}
