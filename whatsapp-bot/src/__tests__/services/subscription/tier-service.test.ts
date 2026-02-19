import { getUserTier, tierAllowsWhatsApp, tierAllowsGroups } from '../../../services/subscription/tier-service.js'

// Mock supabase client
jest.mock('../../../services/database/supabase-client.js', () => ({
  getSupabaseClient: jest.fn()
}))

import { getSupabaseClient } from '../../../services/database/supabase-client.js'

describe('getUserTier', () => {
  it('returns free when no subscription exists', async () => {
    ;(getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: 'free', error: null })
    })
    expect(await getUserTier('user-123')).toBe('free')
  })

  it('returns whatsapp tier when user has active whatsapp subscription', async () => {
    ;(getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: 'whatsapp', error: null })
    })
    expect(await getUserTier('user-456')).toBe('whatsapp')
  })

  it('returns couples tier correctly', async () => {
    ;(getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: 'couples', error: null })
    })
    expect(await getUserTier('user-789')).toBe('couples')
  })

  it('returns openfinance tier correctly', async () => {
    ;(getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: 'openfinance', error: null })
    })
    expect(await getUserTier('user-abc')).toBe('openfinance')
  })

  it('returns free on database error', async () => {
    ;(getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    })
    expect(await getUserTier('user-err')).toBe('free')
  })

  it('returns free on unexpected exception', async () => {
    ;(getSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockRejectedValue(new Error('Network error'))
    })
    expect(await getUserTier('user-throw')).toBe('free')
  })
})

describe('tierAllowsWhatsApp', () => {
  it('blocks free tier', () => {
    expect(tierAllowsWhatsApp('free')).toBe(false)
  })

  it('allows whatsapp tier', () => {
    expect(tierAllowsWhatsApp('whatsapp')).toBe(true)
  })

  it('allows couples tier', () => {
    expect(tierAllowsWhatsApp('couples')).toBe(true)
  })

  it('allows openfinance tier', () => {
    expect(tierAllowsWhatsApp('openfinance')).toBe(true)
  })
})

describe('tierAllowsGroups', () => {
  it('blocks free tier', () => {
    expect(tierAllowsGroups('free')).toBe(false)
  })

  it('blocks whatsapp tier', () => {
    expect(tierAllowsGroups('whatsapp')).toBe(false)
  })

  it('allows couples tier', () => {
    expect(tierAllowsGroups('couples')).toBe(true)
  })

  it('allows openfinance tier', () => {
    expect(tierAllowsGroups('openfinance')).toBe(true)
  })
})
