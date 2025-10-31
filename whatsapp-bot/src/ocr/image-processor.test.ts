// Jest globals are available
import { processImage } from './image-processor'

// Mock sharp
const mockSharp = {
  greyscale: jest.fn().mockReturnThis(),
  normalize: jest.fn().mockReturnThis(),
  sharpen: jest.fn().mockReturnThis(),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image'))
}

jest.mock('sharp', () => jest.fn(() => mockSharp))

// Mock Tesseract.js
const mockWorker = {
  load: jest.fn().mockResolvedValue(undefined),
  loadLanguage: jest.fn().mockResolvedValue(undefined),
  initialize: jest.fn().mockResolvedValue(undefined),
  recognize: jest.fn().mockResolvedValue({
    data: { text: '' }
  }),
  terminate: jest.fn().mockResolvedValue(undefined)
}

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(() => mockWorker)
}))

describe('Image Processor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('processImage', () => {
    it('should parse LATAM credit card notification with amount 151,52 on October 12', async () => {
      const mockText = `Compra aprovada no seu LATAM
PASS MC BLACK final 5257 -
PANVEL FARMACIAS valor RS
151,52 em 12/10, as 18h11. Limite
Disponivel de 101.557,92.`

      // Mock the Tesseract recognition to return our test text
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText, confidence: 90 }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(1)
      
      const expense = result.expenses![0]
      expect(expense.amount).toBe(151.52)
      expect(expense.description).toContain('PANVEL FARMACIAS')
      expect(expense.type).toBe('expense')
      expect(expense.paymentMethod).toBe('Credit Card')
      
      // Check that the date is October 12 (format: YYYY-10-12)
      // The year will be current year since the text only has DD/MM format
      expect(expense.date).toMatch(/^\d{4}-10-12$/)
    })

    it('should parse simple credit card SMS with merchant name', async () => {
      const mockText = `Compra aprovada no
MERCADO CENTRAL
valor RS 45,00 em
15/10/2024 as 10h30.`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(1)
      
      const expense = result.expenses![0]
      expect(expense.amount).toBe(45.00)
      expect(expense.description).toContain('MERCADO CENTRAL')
      expect(expense.date).toBe('2024-10-15')
      expect(expense.paymentMethod).toBe('Credit Card')
    })

    it('should parse credit card notification without date', async () => {
      const mockText = `Compra aprovada no
RESTAURANTE JAPONÊS
valor R$ 89,90`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(1)
      
      const expense = result.expenses![0]
      expect(expense.amount).toBe(89.90)
      expect(expense.description).toContain('RESTAURANTE')
      expect(expense.paymentMethod).toBe('Credit Card')
    })

    it('should parse multiple credit card transactions', async () => {
      const mockText = `Compra aprovada no
PADARIA CENTRAL valor RS 12,50
em 10/10/2024

Compra aprovada no
FARMACIA POPULAR valor RS 35,00
em 10/10/2024`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(2)
      
      expect(result.expenses![0].amount).toBe(12.50)
      expect(result.expenses![0].description).toContain('PADARIA')
      
      expect(result.expenses![1].amount).toBe(35.00)
      expect(result.expenses![1].description).toContain('FARMACIA')
    })

    it('should handle credit card SMS with short date format (DD/MM)', async () => {
      const mockText = `Compra aprovada no seu CARTÃO
final 1234 - SUPERMERCADO XYZ
valor RS 78,45 em 15/11`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(1)
      
      const expense = result.expenses![0]
      expect(expense.amount).toBe(78.45)
      expect(expense.description).toContain('SUPERMERCADO')
    })

    it('should guess category from merchant name', async () => {
      const mockText = `Compra aprovada
FARMACIA CENTRAL
valor RS 25,00`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses![0].category).toBe('saúde')
    })

    it('should skip card type lines when extracting merchant name', async () => {
      const mockText = `Compra aprovada no seu
MASTERCARD final 5678
POSTO DE GASOLINA
valor RS 150,00`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses![0].description).toContain('POSTO')
      expect(result.expenses![0].description).not.toContain('MASTERCARD')
    })

    it('should handle amounts with thousands separator', async () => {
      const mockText = `Compra aprovada
LOJA DE ELETRONICOS
valor RS 1.234,56`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses![0].amount).toBe(1234.56)
    })

    it('should return empty expenses array for invalid amounts', async () => {
      const mockText = `Compra aprovada
valor RS 0,00`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(0)
    })

    it('should return empty expenses array when no expenses found', async () => {
      const mockText = `Esta é uma mensagem sem valores monetários`

      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: mockText }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(0)
    })

    it('should handle empty OCR result', async () => {
      const Tesseract = require('tesseract.js')
      const mockWorker = await Tesseract.createWorker()
      mockWorker.recognize.mockResolvedValue({
        data: { text: '' }
      })

      const imageBuffer = Buffer.from('fake-image-data')
      const result = await processImage(imageBuffer)

      expect(result.expenses).toBeDefined()
      expect(result.expenses).toHaveLength(0)
    })
  })
})

