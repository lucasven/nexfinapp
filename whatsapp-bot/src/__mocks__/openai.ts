// Mock OpenAI client - use plain objects, not jest.fn() at module level
export const mockOpenAIClient = {
  chat: {
    completions: {
      create: async () => ({
        choices: [{
          message: {
            content: 'Mocked AI response'
          }
        }]
      })
    }
  },
  images: {
    generate: async () => ({
      data: [{
        url: 'https://example.com/mock-image.jpg'
      }]
    })
  }
}

// Mock OpenAI constructor as default export
const OpenAI = function() {
  return mockOpenAIClient
}

export default OpenAI
export { OpenAI }
