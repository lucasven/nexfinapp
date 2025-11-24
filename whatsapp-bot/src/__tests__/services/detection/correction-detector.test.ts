// Jest globals are available
import { 
  detectCorrectionIntent, 
  extractTransactionId, 
  isValidTransactionId 
} from '../../../services/detection/correction-detector'

describe('Correction Detector', () => {
  describe('detectCorrectionIntent', () => {
    it('should return unknown for messages without correction words', () => {
      const result = detectCorrectionIntent('gastei 50 reais em comida')
      
      expect(result.action).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('should detect delete intent with transaction ID', () => {
      // Note: Due to how transaction ID extraction works (first 6-char match),
      // we use the format "ABC123 [action]" to ensure ABC123 is matched first
      const testCases = [
        'ABC123 remover',
        'ABC123 remove',
        'ABC123 deletar',
        'ABC123 apagar',
        'ABC123 excluir'
      ]
      
      testCases.forEach(message => {
        const result = detectCorrectionIntent(message)
        
        expect(result.action).toBe('delete')
        expect(result.confidence).toBe(0.9)
        expect(result.transactionId).toBe('ABC123')
        expect(result.reason).toBe('Remover transação ABC123')
      })
    })

    it('should detect update intent with transaction ID', () => {
      const testCases = [
        'arrumar ABC123',
        'corrigir ABC123',
        'ABC123 arrumar',
        'ABC123 corrigir',
        'ABC123 mudar',
        'ABC123 alterar'
      ]
      
      testCases.forEach(message => {
        const result = detectCorrectionIntent(message)
        
        expect(result.action).toBe('update')
        expect(result.confidence).toBe(0.8)
        expect(result.transactionId).toBe('ABC123')
      })
    })

    it('should detect update intent with amount correction', () => {
      const result = detectCorrectionIntent('ABC123 era 50,00')
      
      expect(result.action).toBe('update')
      expect(result.confidence).toBe(0.9) // 0.8 base + 0.1 for amount
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
      expect(result.reason).toContain('valor para R$ 50.00')
    })

    it('should detect update intent with category correction', () => {
      const result = detectCorrectionIntent('ABC123 era transporte')
      
      expect(result.action).toBe('update')
      expect(result.confidence).toBe(0.9) // 0.8 base + 0.1 for category
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.category).toBe('transporte')
      expect(result.reason).toContain('categoria para transporte')
    })

    it('should detect update intent with payment method correction', () => {
      const testCases = [
        { input: 'ABC123 era no cartão', expected: 'Credit Card' },
        { input: 'ABC123 era com pix', expected: 'PIX' },
        { input: 'ABC123 era em dinheiro', expected: 'Cash' },
        { input: 'ABC123 era no débito', expected: 'Debit Card' }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const result = detectCorrectionIntent(input)
        
        expect(result.action).toBe('update')
        expect(result.transactionId).toBe('ABC123')
        expect(result.updates?.paymentMethod).toBe(expected)
        expect(result.reason).toContain(`método de pagamento para ${expected}`)
      })
    })

    it('should detect update intent with date correction', () => {
      const result = detectCorrectionIntent('ABC123 era em 15/01/2024')
      
      expect(result.action).toBe('update')
      expect(result.confidence).toBe(0.9) // 0.8 base + 0.1 for date
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.date).toBe('2024-01-15')
      expect(result.reason).toContain('data para 2024-01-15')
    })

    it('should handle date without year', () => {
      const result = detectCorrectionIntent('ABC123 era em 15/01')
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.date).toMatch(/^\d{4}-01-15$/)
    })

    it('should detect multiple corrections in one message', () => {
      // Payment method pattern requires "era no/em/com [method]" directly
      // Use "foi" for payment method since "era" is used for amount
      const result = detectCorrectionIntent('ABC123 era 50,00 foi no cartão')
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
      expect(result.updates?.paymentMethod).toBe('Credit Card')
      expect(result.reason).toContain('valor para R$ 50.00')
      expect(result.reason).toContain('método de pagamento para Credit Card')
    })

    it('should handle case insensitive input', () => {
      const result = detectCorrectionIntent('abc123 ERA 50,00')
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
    })

    it('should handle mixed case transaction IDs', () => {
      const result = detectCorrectionIntent('AbC123 remover')
      
      expect(result.action).toBe('delete')
      expect(result.transactionId).toBe('ABC123')
    })

    it('should assume update action when transaction ID is present but no specific action', () => {
      const result = detectCorrectionIntent('ABC123 ta errado')
      
      expect(result.action).toBe('update')
      expect(result.confidence).toBe(0.6)
      expect(result.transactionId).toBe('ABC123')
    })

    it('should handle decimal amounts', () => {
      const result = detectCorrectionIntent('ABC123 era 25,50')
      
      expect(result.action).toBe('update')
      expect(result.updates?.amount).toBe(25.50)
    })

    it('should handle amounts with dots', () => {
      const result = detectCorrectionIntent('ABC123 era 25.50')
      
      expect(result.action).toBe('update')
      expect(result.updates?.amount).toBe(25.50)
    })

    it('should not extract invalid amounts', () => {
      const result = detectCorrectionIntent('ABC123 era abc')
      
      expect(result.action).toBe('update')
      expect(result.updates?.amount).toBeUndefined()
    })

    it('should not extract very short categories', () => {
      const result = detectCorrectionIntent('ABC123 era a')
      
      expect(result.action).toBe('update')
      expect(result.updates?.category).toBeUndefined()
    })

    it('should not extract numeric categories', () => {
      const result = detectCorrectionIntent('ABC123 era 123')
      
      expect(result.action).toBe('update')
      expect(result.updates?.category).toBeUndefined()
    })

    it('should handle messages with correction words but no transaction ID', () => {
      // "errado" is 6 characters but all letters - no numbers
      // Implementation correctly rejects it as a transaction ID (requires both letters AND numbers)
      const result = detectCorrectionIntent('ta errado mesmo')

      // No valid transaction ID found, so action is unknown with low confidence
      expect(result.action).toBe('unknown')
      expect(result.confidence).toBe(0.2) // Correction words present but no valid transaction ID
      expect(result.transactionId).toBeUndefined()
    })

    it('should handle empty message', () => {
      const result = detectCorrectionIntent('')
      
      expect(result.action).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('should handle whitespace-only message', () => {
      const result = detectCorrectionIntent('   ')
      
      expect(result.action).toBe('unknown')
      expect(result.confidence).toBe(0)
    })
  })

  describe('extractTransactionId', () => {
    it('should extract valid transaction IDs', () => {
      const testCases = [
        { input: 'ABC123', expected: 'ABC123' },
        { input: '123ABC', expected: '123ABC' },
        { input: 'A1B2C3', expected: 'A1B2C3' },
        { input: 'remover ABC123', expected: 'ABC123' },
        { input: 'ABC123 era 50', expected: 'ABC123' }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const result = extractTransactionId(input)
        expect(result).toBe(expected)
      })
    })

    it('should return null for invalid transaction IDs', () => {
      const testCases = [
        'ABC12', // Too short
        'ABCD123', // Too long
        'ABC-123', // Contains hyphen
        'ABC 123', // Contains space
        'abc123', // Lowercase
        'no transaction id here'
      ]
      
      testCases.forEach(input => {
        const result = extractTransactionId(input)
        expect(result).toBeNull()
      })
    })

    it('should return null for empty input', () => {
      expect(extractTransactionId('')).toBeNull()
    })
  })

  describe('isValidTransactionId', () => {
    it('should validate correct transaction IDs', () => {
      const validIds = [
        'ABC123',
        '123ABC',
        'A1B2C3',
        '000000',
        'ZZZZZZ'
      ]
      
      validIds.forEach(id => {
        expect(isValidTransactionId(id)).toBe(true)
      })
    })

    it('should reject invalid transaction IDs', () => {
      const invalidIds = [
        'ABC12', // Too short
        'ABCD123', // Too long
        'ABC-123', // Contains hyphen
        'ABC 123', // Contains space
        'abc123', // Lowercase
        'ABC@123', // Contains special character
        '', // Empty
        'ABC', // Too short
        'ABCDEFG' // Too long
      ]
      
      invalidIds.forEach(id => {
        expect(isValidTransactionId(id)).toBe(false)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle special characters in messages', () => {
      const result = detectCorrectionIntent('ABC123 era 50,00! (corrigir)')
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
    })

    it('should handle multiple transaction IDs', () => {
      const result = detectCorrectionIntent('ABC123 e DEF456 remover')
      
      expect(result.action).toBe('delete')
      expect(result.transactionId).toBe('ABC123') // Should pick the first one
    })

    it('should handle very long messages', () => {
      // Use separate trigger words for each field to avoid pattern conflicts
      const longMessage = 'ABC123 era 50,00 foi no cartão foi em 15/01/2024 porque estava errado e preciso corrigir isso'
      
      const result = detectCorrectionIntent(longMessage)
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
      expect(result.updates?.paymentMethod).toBe('Credit Card')
      expect(result.updates?.date).toBe('2024-01-15')
      // Category not tested as it requires "era [category]" format
    })

    it('should handle Portuguese variations', () => {
      const result = detectCorrectionIntent('ABC123 deveria ser 50,00')
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
    })

    it('should handle English variations', () => {
      const result = detectCorrectionIntent('ABC123 should be 50.00')
      
      expect(result.action).toBe('update')
      expect(result.transactionId).toBe('ABC123')
      expect(result.updates?.amount).toBe(50.00)
    })
  })
})
