// Jest globals are available
import { parseCommand, executeCommand, getCommandHelp } from './command-parser'
import { expectIntentToMatch } from '../__tests__/utils/test-helpers'

describe('Command Parser', () => {
  describe('parseCommand', () => {
    it('should return null for non-command messages', () => {
      expect(parseCommand('gastei 50 reais')).toBeNull()
      expect(parseCommand('hello world')).toBeNull()
      expect(parseCommand('')).toBeNull()
    })

    it('should parse valid commands', () => {
      const result = parseCommand('/add 50 comida')
      
      expect(result).toEqual({
        type: 'add',
        args: ['50', 'comida'],
        raw: '/add 50 comida'
      })
    })

    it('should handle commands with multiple arguments', () => {
      const result = parseCommand('/add 50 comida 15/01 almoço cartão')
      
      expect(result).toEqual({
        type: 'add',
        args: ['50', 'comida', '15/01', 'almoço', 'cartão'],
        raw: '/add 50 comida 15/01 almoço cartão'
      })
    })

    it('should handle commands with no arguments', () => {
      const result = parseCommand('/help')
      
      expect(result).toEqual({
        type: 'help',
        args: [],
        raw: '/help'
      })
    })

    it('should return null for invalid commands', () => {
      expect(parseCommand('/invalid')).toBeNull()
      expect(parseCommand('/unknown')).toBeNull()
    })

    it('should handle case insensitive commands', () => {
      const result = parseCommand('/ADD 50 comida')
      
      expect(result).toEqual({
        type: 'add',
        args: ['50', 'comida'],
        raw: '/ADD 50 comida'
      })
    })

    it('should handle extra whitespace', () => {
      const result = parseCommand('  /add  50  comida  ')
      
      expect(result).toEqual({
        type: 'add',
        args: ['50', 'comida'],
        raw: '/add  50  comida  '
      })
    })
  })

  describe('executeCommand', () => {
    describe('add command', () => {
      it('should parse basic add command', () => {
        const command = { type: 'add' as const, args: ['50', 'comida'], raw: '/add 50 comida' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_expense',
          confidence: 1.0,
          entities: {
            amount: 50,
            category: 'comida',
            description: 'comida'
          }
        })
      })

      it('should parse add command with date', () => {
        const command = { type: 'add' as const, args: ['30', 'transporte', '15/01'], raw: '/add 30 transporte 15/01' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_expense',
          confidence: 1.0,
          entities: {
            amount: 30,
            category: 'transporte',
            description: 'transporte',
            date: '2025-01-15'
          }
        })
      })

      it('should parse add command with description and payment method', () => {
        const command = { type: 'add' as const, args: ['100', 'mercado', '15/01', 'compras', 'pix'], raw: '/add 100 mercado 15/01 compras pix' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_expense',
          confidence: 1.0,
          entities: {
            amount: 100,
            category: 'mercado',
            description: 'compras',
            date: '2025-01-15',
            paymentMethod: 'pix'
          }
        })
      })

      it('should handle decimal amounts', () => {
        const command = { type: 'add' as const, args: ['25.50', 'farmácia'], raw: '/add 25.50 farmácia' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_expense',
          confidence: 1.0,
          entities: {
            amount: 25.50,
            category: 'farmácia',
            description: 'farmácia'
          }
        })
      })

      it('should return null for invalid amount', () => {
        const command = { type: 'add' as const, args: ['invalid', 'comida'], raw: '/add invalid comida' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })

      it('should return null for insufficient arguments', () => {
        const command = { type: 'add' as const, args: ['50'], raw: '/add 50' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })
    })

    describe('budget command', () => {
      it('should parse basic budget command', () => {
        const command = { type: 'budget' as const, args: ['comida', '500'], raw: '/budget comida 500' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'set_budget',
          confidence: 1.0,
          entities: {
            category: 'comida',
            amount: 500,
            description: undefined
          }
        })
      })

      it('should parse budget command with period', () => {
        const command = { type: 'budget' as const, args: ['transporte', '200', 'mês'], raw: '/budget transporte 200 mês' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'set_budget',
          confidence: 1.0,
          entities: {
            category: 'transporte',
            amount: 200,
            description: 'mês'
          }
        })
      })

      it('should return null for invalid amount', () => {
        const command = { type: 'budget' as const, args: ['comida', 'invalid'], raw: '/budget comida invalid' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })

      it('should return null for insufficient arguments', () => {
        const command = { type: 'budget' as const, args: ['comida'], raw: '/budget comida' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })
    })

    describe('recurring command', () => {
      it('should parse basic recurring command', () => {
        const command = { type: 'recurring' as const, args: ['aluguel', '1200', 'dia', '5'], raw: '/recurring aluguel 1200 dia 5' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_recurring',
          confidence: 1.0,
          entities: {
            description: 'aluguel',
            amount: 1200,
            date: '5'
          }
        })
      })

      it('should parse recurring command with different day', () => {
        const command = { type: 'recurring' as const, args: ['salário', '5000', 'dia', '1'], raw: '/recurring salário 5000 dia 1' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_recurring',
          confidence: 1.0,
          entities: {
            description: 'salário',
            amount: 5000,
            date: '1'
          }
        })
      })

      it('should return null for invalid day', () => {
        const command = { type: 'recurring' as const, args: ['aluguel', '1200', 'dia', '32'], raw: '/recurring aluguel 1200 dia 32' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })

      it('should return null for missing dia keyword', () => {
        const command = { type: 'recurring' as const, args: ['aluguel', '1200', '5'], raw: '/recurring aluguel 1200 5' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })

      it('should return null for insufficient arguments', () => {
        const command = { type: 'recurring' as const, args: ['aluguel', '1200'], raw: '/recurring aluguel 1200' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })
    })

    describe('report command', () => {
      it('should parse report command without arguments', () => {
        const command = { type: 'report' as const, args: [], raw: '/report' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'show_report',
          confidence: 1.0,
          entities: {
            description: 'este mês'
          }
        })
      })

      it('should parse report command with period', () => {
        const command = { type: 'report' as const, args: ['janeiro', '2024'], raw: '/report janeiro 2024' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'show_report',
          confidence: 1.0,
          entities: {
            description: 'janeiro 2024'
          }
        })
      })

      it('should parse report command with category', () => {
        const command = { type: 'report' as const, args: ['comida'], raw: '/report comida' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'show_report',
          confidence: 1.0,
          entities: {
            description: 'este mês',
            category: 'comida'
          }
        })
      })
    })

    describe('list command', () => {
      it('should parse list command without arguments', () => {
        const command = { type: 'list' as const, args: [], raw: '/list' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'show_expenses',
          confidence: 1.0,
          entities: {}
        })
      })

      it('should parse list command with type', () => {
        const command = { type: 'list' as const, args: ['categories'], raw: '/list categories' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'list_categories',
          confidence: 1.0,
          entities: {}
        })
      })

      it('should parse list command with different types', () => {
        const testCases = [
          { args: ['recurring'], expected: 'list_recurring' },
          { args: ['budgets'], expected: 'list_budgets' },
          { args: ['transactions'], expected: 'list_transactions' }
        ]
        
        testCases.forEach(({ args, expected }) => {
          const command = { type: 'list' as const, args, raw: `/list ${args.join(' ')}` }
          const result = executeCommand(command)
          
          expectIntentToMatch(result!, {
            action: expected as any,
            confidence: 1.0,
            entities: {}
          })
        })
      })

      it('should return null for invalid list type', () => {
        const command = { type: 'list' as const, args: ['invalid'], raw: '/list invalid' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })
    })

    describe('help command', () => {
      it('should parse help command without arguments', () => {
        const command = { type: 'help' as const, args: [], raw: '/help' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'help',
          confidence: 1.0,
          entities: {
            description: undefined
          }
        })
      })

      it('should parse help command with specific command', () => {
        const command = { type: 'help' as const, args: ['add'], raw: '/help add' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'help',
          confidence: 1.0,
          entities: {
            description: 'add'
          }
        })
      })
    })

    describe('categories command', () => {
      it('should parse categories command without arguments', () => {
        const command = { type: 'categories' as const, args: [], raw: '/categories' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'list_categories',
          confidence: 1.0,
          entities: {}
        })
      })

      it('should parse categories add command', () => {
        const command = { type: 'categories' as const, args: ['add', 'casa e decoração'], raw: '/categories add casa e decoração' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_category',
          confidence: 1.0,
          entities: {
            category: 'casa e decoração'
          }
        })
      })

      it('should parse categories remove command', () => {
        const command = { type: 'categories' as const, args: ['remove', 'transporte'], raw: '/categories remove transporte' }
        const result = executeCommand(command)
        
        expectIntentToMatch(result!, {
          action: 'add_category',
          confidence: 1.0,
          entities: {
            category: 'transporte'
          }
        })
      })

      it('should return null for categories command without name', () => {
        const command = { type: 'categories' as const, args: ['add'], raw: '/categories add' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })

      it('should return null for invalid categories action', () => {
        const command = { type: 'categories' as const, args: ['invalid', 'test'], raw: '/categories invalid test' }
        const result = executeCommand(command)
        
        expect(result).toBeNull()
      })
    })
  })

  describe('getCommandHelp', () => {
    it('should return general help when no command specified', () => {
      const help = getCommandHelp()
      
      expect(help).toContain('Comandos disponíveis')
      expect(help).toContain('/add')
      expect(help).toContain('/budget')
      expect(help).toContain('/recurring')
    })

    it('should return specific help for add command', () => {
      const help = getCommandHelp('add')
      
      expect(help).toContain('/add <valor> <categoria>')
      expect(help).toContain('Exemplos:')
      expect(help).toContain('/add 50 comida')
    })

    it('should return specific help for budget command', () => {
      const help = getCommandHelp('budget')
      
      expect(help).toContain('/budget <categoria> <valor>')
      expect(help).toContain('/budget comida 500')
    })

    it('should return specific help for recurring command', () => {
      const help = getCommandHelp('recurring')
      
      expect(help).toContain('/recurring <nome> <valor> dia <dia>')
      expect(help).toContain('/recurring aluguel 1200 dia 5')
    })

    it('should return specific help for report command', () => {
      const help = getCommandHelp('report')
      
      expect(help).toContain('/report [período] [categoria]')
      expect(help).toContain('/report este mês')
    })

    it('should return specific help for list command', () => {
      const help = getCommandHelp('list')
      
      expect(help).toContain('/list [tipo]')
      expect(help).toContain('Tipos: categories, recurring, budgets, transactions')
    })

    it('should return specific help for categories command', () => {
      const help = getCommandHelp('categories')
      
      expect(help).toContain('/categories [ação] [nome]')
      expect(help).toContain('Ações: add, remove')
    })

    it('should return general help for unknown command', () => {
      const help = getCommandHelp('unknown')
      
      expect(help).toContain('Comandos disponíveis')
    })
  })
})
