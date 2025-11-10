import { createWorker } from 'tesseract.js'
import { ExpenseData, OCRResult } from '../types.js'
import sharp from 'sharp'
import { parseWithAI } from '../services/ai/ai-pattern-generator.js'
import { getUserContext } from '../services/ai/ai-pattern-generator.js'

export async function processImage(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    // Preprocess image for better OCR
    const processedImage = await sharp(imageBuffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer()

    // Initialize Tesseract worker
    const worker = await createWorker('por')

    const { data: { text, confidence } } = await worker.recognize(processedImage)
    await worker.terminate()

    // Parse expenses from OCR text
    console.log('ocr full text: ', text);
    const expenses = parseExpensesFromText(text)

    return {
      text: text.trim(),
      confidence,
      expenses
    }
  } catch (error) {
    console.error('OCR processing error:', error)
    throw error
  }
}

function parseExpensesFromText(text: string): ExpenseData[] {
  const expenses: ExpenseData[] = []
  
  // First, try specific credit card SMS pattern (single or multiple)
  const creditCardExpenses = parseCreditCardSMS(text)
  if (creditCardExpenses.length > 0) {
    return creditCardExpenses
  }

  // Try to detect multiple transactions in bank statements or receipts
  const multipleTransactions = parseMultipleTransactions(text)
  if (multipleTransactions.length > 0) {
    return multipleTransactions
  }

  // If not multiple transactions, try generic patterns
  const lines = text.split('\n')

  // Common patterns for bank SMS and statements
  const patterns = [
    // Pattern 1: "Compra aprovada: R$ 50,00 em ESTABELECIMENTO"
    /(?:compra|despesa|pagamento|débito|debito).*?R\$?\s*([\d.,]+).*?(?:em|para|no|na)\s+([A-Za-záàâãéèêíïóôõöúçñ\s]+)/gi,
    
    // Pattern 2: "R$ 50,00 - ESTABELECIMENTO"
    /R\$?\s*([\d.,]+)\s*[-–]\s*([A-Za-záàâãéèêíïóôõöúçñ\s]+)/gi,
    
    // Pattern 3: "ESTABELECIMENTO R$ 50,00"
    /([A-Za-záàâãéèêíïóôõöúçñ\s]+)\s+R\$?\s*([\d.,]+)/gi,
    
    // Pattern 4: "Débito de R$ 50,00 - ESTABELECIMENTO"
    /(?:débito|debito|saque|transferência|transferencia)\s+de\s+R\$?\s*([\d.,]+).*?[-–]\s*([A-Za-záàâãéèêíïóôõöúçñ\s]+)/gi
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      const amount = parseFloat(match[1].replace(/[.,](?=\d{3})/g, '').replace(',', '.'))
      const description = match[2] ? match[2].trim() : ''

      if (amount > 0 && amount < 1000000) { // Sanity check
        // Try to guess category from description
        const category = guessCategoryFromDescription(description)
        
        // Detect payment method from context
        let paymentMethod: string | undefined
        const lowerText = text.toLowerCase()
        if (lowerText.includes('cartao') || lowerText.includes('cartão') || lowerText.includes('card') || lowerText.includes('crédito') || lowerText.includes('credito')) {
          paymentMethod = 'Credit Card'
        } else if (lowerText.includes('débito') || lowerText.includes('debito')) {
          paymentMethod = 'Debit Card'
        } else if (lowerText.includes('pix')) {
          paymentMethod = 'PIX'
        } else if (lowerText.includes('dinheiro') || lowerText.includes('cash')) {
          paymentMethod = 'Cash'
        }

        expenses.push({
          amount,
          description,
          category,
          type: 'expense',
          paymentMethod
        })
      }
    }
  }

  // Remove duplicates
  const unique = expenses.filter((expense, index, self) =>
    index === self.findIndex(e => 
      e.amount === expense.amount && 
      e.description === expense.description
    )
  )

  return unique
}

/**
 * Parse credit card SMS format (single or multiple transactions):
 * "Compra aprovada no LATAM PASS
 *  MC BLACK p/ ISMAIRA O
 *  VENTURELL - MINIMERCADO
 *  PAQUISTAO valor RS 8,50 em
 *  13/10/2025 as 17h50."
 */
function parseCreditCardSMS(text: string): ExpenseData[] {
  const expenses: ExpenseData[] = []
  
  // Split text by "Compra aprovada" to handle multiple transactions
  const transactions = text.split(/(?=Compra aprovada)/i).filter(part => part.trim())
  
  for (const transaction of transactions) {
    // Pattern for "valor RS X,XX" or "valor R$ X,XX"
    const valueMatch = transaction.match(/valor\s+(?:R\$?|RS)\s*([\d.,]+)/i)
    
    if (!valueMatch) {
      continue
    }

    const amount = parseFloat(valueMatch[1].replace(/[.,](?=\d{3})/g, '').replace(',', '.'))
    
    if (amount <= 0 || amount >= 1000000) {
      continue
    }

    // Extract merchant name (text before "valor")
    const beforeValor = transaction.substring(0, transaction.toLowerCase().indexOf('valor'))
    
    // Split by lines and get merchant info
    const lines = beforeValor.split('\n').filter(line => line.trim())
    
    // Merchant is usually in the last 1-2 lines before "valor"
    let merchantParts: string[] = []
    
    // Look for merchant indicators - collect up to 2 valid lines
    for (let i = lines.length - 1; i >= 0 && merchantParts.length < 2; i--) {
      const line = lines[i].trim()
      
      // Skip card type and holder name patterns
      if (line.match(/^(MC|VISA|ELO|MASTERCARD|AMEX)/i)) continue
      if (line.match(/p\/|para/i)) continue
      if (line.match(/^compra aprovada/i)) continue
      
      // This is likely part of the merchant
      if (line.length > 0) {
        merchantParts.unshift(line) // Add to beginning to maintain order
      }
    }

    // Join merchant parts and clean
    let merchantName = merchantParts.join(' ')
      .replace(/[-–]\s*$/, '') // Remove trailing dash
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()

    // Extract date if present (DD/MM/YYYY or DD/MM format)
    let date: string | undefined
    const dateMatchFull = transaction.match(/(\d{1,2}\/\d{1,2}\/\d{4})/i)
    const dateMatchShort = transaction.match(/(\d{1,2}\/\d{1,2})(?:[,\s]|$)/i)
    
    if (dateMatchFull) {
      const [day, month, year] = dateMatchFull[1].split('/')
      date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    } else if (dateMatchShort) {
      const [day, month] = dateMatchShort[1].split('/')
      const currentYear = new Date().getFullYear()
      date = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Guess category
    const category = guessCategoryFromDescription(merchantName)

    expenses.push({
      amount,
      description: merchantName || 'Compra no cartão',
      category,
      type: 'expense',
      date,
      paymentMethod: 'Credit Card' // Credit card SMS transactions are always credit card payments
    })
  }
  
  return expenses
}

function guessCategoryFromDescription(description: string): string | undefined {
  const text = description.toLowerCase()

  const categoryMappings: { [key: string]: string[] } = {
    'comida': [
      'restaurante', 'lanchonete', 'padaria', 'pizza', 'burger', 'food',
      'mercado', 'supermercado', 'minimercado', 'mercearia', 'mercadinho',
      'ifood', 'rappi', 'uber eats', 'açougue', 'acougue', 'hortifruti',
      'quitanda', 'emporio', 'empório', 'delicatessen', 'bakery'
    ],
    'transporte': [
      'uber', 'taxi', '99', 'posto', 'combustível', 'combustivel', 
      'gasolina', 'shell', 'ipiranga', 'metro', 'onibus', 'ônibus',
      'estacionamento', 'pedágio', 'pedagio'
    ],
    'compras': [
      'magazine', 'lojas', 'shopping', 'casas bahia', 'extra', 
      'ponto frio', 'americanas', 'shopee', 'mercado livre',
      'amazon', 'aliexpress', 'renner', 'c&a', 'zara'
    ],
    'entretenimento': [
      'cinema', 'teatro', 'show', 'ingresso', 'netflix', 'spotify', 
      'disney', 'prime video', 'hbo', 'globoplay', 'youtube', 'twitch'
    ],
    'saúde': [
      'farmácia', 'farmacia', 'drogaria', 'hospital', 'clínica', 'clinica', 
      'médico', 'medico', 'droga', 'drogasil', 'pacheco', 'ultrafarma',
      'laboratório', 'laboratorio', 'dentista'
    ],
    'educação': [
      'escola', 'faculdade', 'curso', 'livro', 'apostila', 'universidade',
      'colégio', 'colegio', 'livraria', 'saraiva', 'cultura'
    ],
    'contas': [
      'energia', 'água', 'agua', 'internet', 'telefone', 'celular', 
      'vivo', 'tim', 'claro', 'oi', 'copel', 'cemig', 'light',
      'cpfl', 'saneamento'
    ],
  }

  for (const [category, keywords] of Object.entries(categoryMappings)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category
    }
  }

  return undefined
}

/**
 * Parse multiple transactions from bank statements or receipts
 */
function parseMultipleTransactions(text: string): ExpenseData[] {
  const transactions: ExpenseData[] = []
  
  // Common patterns for multiple transactions
  const patterns = [
    // Pattern 1: Bank statement format
    // "15/10/2024 14:30 COMPRA CARTAO 50,00 MERCADO ABC"
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+\d{1,2}:\d{2}\s+(?:COMPRA|DEBITO|PAGAMENTO)\s+(?:CARTAO|CARTAO\s+\d+)\s+([\d.,]+)\s+([A-Za-záàâãéèêíïóôõöúçñ\s]+)/gi,
    
    // Pattern 2: Receipt format with multiple items
    // "ITEM 1: 25,00"
    // "ITEM 2: 15,50"
    /(?:item|produto|servico)\s*\d*:?\s*([\d.,]+)/gi,
    
    // Pattern 3: Multiple lines with amounts and descriptions
    // "MERCADO ABC 50,00"
    // "FARMACIA XYZ 25,50"
    /([A-Za-záàâãéèêíïóôõöúçñ\s]+?)\s+([\d.,]+)(?:\s|$)/gi,
    
    // Pattern 4: Date + Amount + Description pattern
    // "15/10 MERCADO 50,00"
    /(\d{1,2}\/\d{1,2})\s+([A-Za-záàâãéèêíïóôõöúçñ\s]+?)\s+([\d.,]+)/gi
  ]
  
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      try {
        let amount: number
        let description: string
        let date: string | undefined
        
        if (match.length === 4) {
          // Pattern with date
          date = parseDate(match[1])
          description = match[2].trim()
          amount = parseAmount(match[3])
        } else if (match.length === 3) {
          // Pattern without date
          description = match[1].trim()
          amount = parseAmount(match[2])
        } else {
          // Single amount pattern
          amount = parseAmount(match[1])
          description = 'Transação'
        }
        
        if (amount > 0 && amount < 1000000) {
          const category = guessCategoryFromDescription(description)
          
          // Detect payment method from context
          let paymentMethod: string | undefined
          const lowerText = text.toLowerCase()
          if (lowerText.includes('cartao') || lowerText.includes('cartão') || lowerText.includes('card') || lowerText.includes('crédito') || lowerText.includes('credito')) {
            paymentMethod = 'Credit Card'
          } else if (lowerText.includes('débito') || lowerText.includes('debito')) {
            paymentMethod = 'Debit Card'
          } else if (lowerText.includes('pix')) {
            paymentMethod = 'PIX'
          } else if (lowerText.includes('dinheiro') || lowerText.includes('cash')) {
            paymentMethod = 'Cash'
          }
          
          transactions.push({
            amount,
            description,
            category: category || 'outros',
            type: 'expense',
            date,
            paymentMethod
          })
        }
      } catch (error) {
        console.error('Error parsing transaction:', error)
      }
    }
  }
  
  // Remove duplicates and filter out very small amounts
  const uniqueTransactions = transactions.filter((tx, index, arr) => {
    return tx.amount >= 1 && // Minimum amount
           arr.findIndex(t => 
             t.amount === tx.amount && 
             t.description === tx.description
           ) === index
  })
  
  return uniqueTransactions
}

/**
 * Parse date from various formats
 */
function parseDate(dateStr: string): string {
  try {
    // Handle DD/MM format
    if (dateStr.includes('/') && !dateStr.includes('/20')) {
      const [day, month] = dateStr.split('/')
      const currentYear = new Date().getFullYear()
      return `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    
    // Handle DD/MM/YYYY format
    if (dateStr.includes('/20')) {
      const [day, month, year] = dateStr.split('/')
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
    
    return dateStr
  } catch (error) {
    return new Date().toISOString().split('T')[0]
  }
}

/**
 * Parse amount from string
 */
function parseAmount(amountStr: string): number {
  try {
    // Remove currency symbols and normalize
    const cleaned = amountStr.replace(/[R$\s]/g, '').replace(',', '.')
    return parseFloat(cleaned)
  } catch (error) {
    return 0
  }
}

export async function extractExpenseFromImage(
  imageBuffer: Buffer,
  userId: string
): Promise<ExpenseData[] | null> {
  try {
    const result = await processImage(imageBuffer)

    // NEW: Try AI parsing first if OCR text is available
    if (result.text && result.text.length > 10) {
      try {
        console.log('Attempting AI parsing of OCR text...')
        const userContext = await getUserContext(userId)
        const aiResult = await parseWithAI(result.text, userContext)
        
        // DEBUG: Log what AI returned
        console.log('AI parsing result:', JSON.stringify(aiResult, null, 2))
        
        if (aiResult.action === 'add_expense' && aiResult.entities.transactions) {
          // Multiple transactions from AI
          const expenses: ExpenseData[] = aiResult.entities.transactions.map((tx: any) => ({
            amount: tx.amount,
            description: tx.description || '',
            category: tx.category || 'outros',
            type: tx.type || 'expense',
            date: tx.date,
            paymentMethod: tx.paymentMethod
          }))
          console.log(`AI successfully parsed ${expenses.length} expenses from OCR text`)
          return expenses
        } else if (aiResult.action === 'add_expense' && aiResult.entities.amount) {
          // Single transaction from AI
          const expense: ExpenseData = {
            amount: aiResult.entities.amount,
            description: aiResult.entities.description || '',
            category: aiResult.entities.category || 'outros',
            type: aiResult.entities.type || 'expense',
            date: aiResult.entities.date,
            paymentMethod: aiResult.entities.paymentMethod
          }
          console.log('AI successfully parsed 1 expense from OCR text')
          return [expense]
        } else {
          // DEBUG: Log when AI result doesn't match expected format
          console.warn('AI result did not match expected format:', {
            action: aiResult.action,
            hasTransactions: !!aiResult.entities.transactions,
            hasAmount: !!aiResult.entities.amount,
            entities: aiResult.entities
          })
        }
      } catch (aiError) {
        console.warn('AI parsing failed, falling back to regex patterns:', aiError)
        // Fall through to regex patterns below
      }
    }

    // FALLBACK: Use existing regex patterns
    if (result.expenses && result.expenses.length > 0) {
      return result.expenses
    }

    return null
  } catch (error) {
    console.error('Error extracting expense from image:', error)
    return null
  }
}

