// Create a simple, predictable mock query builder
const createMockQueryBuilder = (resolveValue: any = { data: [], error: null }) => {
  const builder = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    and: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    containedBy: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: jest.fn((resolve: any) => resolve(resolveValue))
  }

  return builder
}

// Mock Supabase client
export const mockSupabaseClient = {
  from: jest.fn(() => createMockQueryBuilder()),
  rpc: jest.fn().mockResolvedValue({ data: 'ABC123', error: null }),
  auth: {
    signInWithPassword: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
    signUp: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null })
  }
}

// Mock the getSupabaseClient function
export const getSupabaseClient = jest.fn(() => mockSupabaseClient)

// Helper functions for common test scenarios
export const mockQuerySuccess = (data: any) => {
  mockSupabaseClient.from.mockReturnValue(createMockQueryBuilder({ data, error: null }))
}

export const mockQueryError = (error: any) => {
  mockSupabaseClient.from.mockReturnValue(createMockQueryBuilder({ data: null, error }))
}

export const mockQuerySequence = (responses: any[]) => {
  let callCount = 0
  mockSupabaseClient.from.mockImplementation(() => {
    const response = responses[callCount] || { data: [], error: null }
    callCount++
    return createMockQueryBuilder(response)
  })
}

// Reset all mocks
export const resetSupabaseMocks = () => {
  jest.clearAllMocks()
  mockSupabaseClient.from.mockReturnValue(createMockQueryBuilder())
  mockSupabaseClient.rpc.mockResolvedValue({ data: 'ABC123', error: null })
}
