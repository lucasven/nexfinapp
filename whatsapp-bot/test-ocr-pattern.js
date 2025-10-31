// Test script for credit card OCR pattern
// Run with: node test-ocr-pattern.js

const testMessage = `Compra aprovada no LATAM PASS
MC BLACK p/ ISMAIRA O
VENTURELL - MINIMERCADO
PAQUISTAO valor RS 8,50 em
13/10/2025 as 17h50.`

function parseCreditCardSMS(text) {
  // Pattern for "valor RS X,XX" or "valor R$ X,XX"
  const valueMatch = text.match(/valor\s+(?:R\$?|RS)\s*([\d.,]+)/i)
  
  if (!valueMatch) {
    console.log('❌ No value match found')
    return null
  }

  const amount = parseFloat(valueMatch[1].replace(/[.,](?=\d{3})/g, '').replace(',', '.'))
  
  console.log('✅ Amount found:', amount)

  // Extract merchant name (text before "valor")
  const beforeValor = text.substring(0, text.toLowerCase().indexOf('valor'))
  
  console.log('\n📝 Text before "valor":')
  console.log(beforeValor)
  
  // Split by lines and get merchant info
  const lines = beforeValor.split('\n').filter(line => line.trim())
  
  console.log('\n📋 Lines found:', lines)
  
  // Merchant is usually in the last 1-2 lines before "valor"
  let merchantParts = []
  
  // Look for merchant indicators - collect up to 2 valid lines
  for (let i = lines.length - 1; i >= 0 && merchantParts.length < 2; i--) {
    const line = lines[i].trim()
    
    console.log(`\n🔍 Checking line ${i}: "${line}"`)
    
    // Skip card type and holder name patterns
    if (line.match(/^(MC|VISA|ELO|MASTERCARD|AMEX)/i)) {
      console.log('   ⏭️  Skipped: Card type')
      continue
    }
    if (line.match(/p\/|para/i)) {
      console.log('   ⏭️  Skipped: Cardholder')
      continue
    }
    if (line.match(/^compra aprovada/i)) {
      console.log('   ⏭️  Skipped: Header')
      continue
    }
    
    // This is likely part of the merchant
    if (line.length > 0) {
      merchantParts.unshift(line) // Add to beginning
      console.log('   ✅ Added to merchant parts')
    }
  }

  console.log('\n🏪 Merchant parts collected:', merchantParts)

  // Join merchant parts and clean
  let merchantName = merchantParts.join(' ')
    .replace(/[-–]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Extract date if present
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/i)
  let date
  
  if (dateMatch) {
    const [day, month, year] = dateMatch[1].split('/')
    date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    console.log('\n📅 Date extracted:', date)
  }

  return {
    amount,
    description: merchantName || 'Compra no cartão',
    category: 'comida', // Would be auto-detected
    type: 'expense',
    date
  }
}

console.log('🧪 Testing Credit Card SMS Parser\n')
console.log('=' .repeat(50))
console.log('\n📱 Input Message:')
console.log(testMessage)
console.log('\n' + '='.repeat(50))

const result = parseCreditCardSMS(testMessage)

console.log('\n' + '='.repeat(50))
console.log('\n✨ FINAL RESULT:')
console.log(JSON.stringify(result, null, 2))
console.log('\n' + '='.repeat(50))

