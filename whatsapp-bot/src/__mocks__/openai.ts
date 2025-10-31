// Mock OpenAI client
export const mockOpenAIClient = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{
          message: {
            content: 'Mocked AI response'
          }
        }]
      })
    }
  },
  images: {
    generate: jest.fn().mockResolvedValue({
      data: [{
        url: 'https://example.com/mock-image.jpg'
      }]
    })
  }
}

// Mock OpenAI constructor
export const OpenAI = jest.fn(() => mockOpenAIClient)

// Reset all mocks
export const resetOpenAIMocks = () => {
  jest.clearAllMocks()
  mockOpenAIClient.chat.completions.create.mockResolvedValue({
    choices: [{
      message: {
        content: 'Mocked AI response'
      }
    }]
  })
  mockOpenAIClient.images.generate.mockResolvedValue({
    data: [{
      url: 'https://example.com/mock-image.jpg'
    }]
  })
}
