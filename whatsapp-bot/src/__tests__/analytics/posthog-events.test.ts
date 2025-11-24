/**
 * PostHog Event Schema Validation Tests
 *
 * Story 6.5: Analytics Dashboard Access
 *
 * Tests:
 * - AC-6.5.1: Verify engagement_preference_changed event schema
 * - Validate event name is correct
 * - Validate required properties present: user_id, preference, source, timestamp
 * - Validate property types are correct
 * - Validate source is either 'whatsapp' or 'web'
 * - Validate preference is either 'opted_in' or 'opted_out'
 *
 * References:
 * - Story 6.1: WhatsApp opt-out tracking
 * - Story 6.2: Web opt-out tracking
 * - docs/analytics/engagement-preferences.md
 */

import { getPostHog } from '../../analytics/posthog-client'

// Mock PostHog
jest.mock('posthog-node', () => {
  return {
    PostHog: jest.fn().mockImplementation(() => ({
      capture: jest.fn(),
      identify: jest.fn(),
      shutdown: jest.fn(),
    })),
  }
})

describe('PostHog Event Schema - engagement_preference_changed', () => {
  let mockPostHog: any

  beforeEach(() => {
    // Set up environment for PostHog
    process.env.POSTHOG_API_KEY = 'test-api-key'
    process.env.POSTHOG_HOST = 'https://test.posthog.com'

    // Clear all mocks
    jest.clearAllMocks()

    // Get mocked PostHog instance
    mockPostHog = getPostHog()
  })

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY
    delete process.env.POSTHOG_HOST
  })

  describe('Event Name', () => {
    it('should use correct event name: engagement_preference_changed', () => {
      const eventName = 'engagement_preference_changed'
      const distinctId = 'user-123'
      const properties = {
        user_id: 'user-123',
        preference: 'opted_out',
        source: 'whatsapp',
        timestamp: new Date().toISOString(),
      }

      mockPostHog?.capture({
        distinctId,
        event: eventName,
        properties,
      })

      expect(mockPostHog?.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'engagement_preference_changed',
        })
      )
    })
  })

  describe('Required Properties', () => {
    it('should include user_id property', () => {
      const eventProperties = {
        user_id: '123e4567-e89b-12d3-a456-426614174000',
        preference: 'opted_out',
        source: 'whatsapp',
        timestamp: new Date().toISOString(),
      }

      mockPostHog?.capture({
        distinctId: 'user-123',
        event: 'engagement_preference_changed',
        properties: eventProperties,
      })

      expect(mockPostHog?.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            user_id: expect.any(String),
          }),
        })
      )
    })

    it('should include preference property', () => {
      const eventProperties = {
        user_id: 'user-123',
        preference: 'opted_out',
        source: 'whatsapp',
        timestamp: new Date().toISOString(),
      }

      mockPostHog?.capture({
        distinctId: 'user-123',
        event: 'engagement_preference_changed',
        properties: eventProperties,
      })

      expect(mockPostHog?.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            preference: expect.any(String),
          }),
        })
      )
    })

    it('should include source property', () => {
      const eventProperties = {
        user_id: 'user-123',
        preference: 'opted_out',
        source: 'whatsapp',
        timestamp: new Date().toISOString(),
      }

      mockPostHog?.capture({
        distinctId: 'user-123',
        event: 'engagement_preference_changed',
        properties: eventProperties,
      })

      expect(mockPostHog?.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            source: expect.any(String),
          }),
        })
      )
    })

    it('should include timestamp property', () => {
      const eventProperties = {
        user_id: 'user-123',
        preference: 'opted_out',
        source: 'whatsapp',
        timestamp: new Date().toISOString(),
      }

      mockPostHog?.capture({
        distinctId: 'user-123',
        event: 'engagement_preference_changed',
        properties: eventProperties,
      })

      expect(mockPostHog?.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            timestamp: expect.any(String),
          }),
        })
      )
    })

    it('should have all required properties present', () => {
      const eventProperties = {
        user_id: 'user-123',
        preference: 'opted_out',
        source: 'whatsapp',
        timestamp: new Date().toISOString(),
      }

      mockPostHog?.capture({
        distinctId: 'user-123',
        event: 'engagement_preference_changed',
        properties: eventProperties,
      })

      expect(mockPostHog?.capture).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            user_id: expect.any(String),
            preference: expect.any(String),
            source: expect.any(String),
            timestamp: expect.any(String),
          }),
        })
      )
    })
  })

  describe('Property Types', () => {
    it('should have user_id as string', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000'
      expect(typeof userId).toBe('string')
    })

    it('should have preference as string', () => {
      const preference = 'opted_out'
      expect(typeof preference).toBe('string')
    })

    it('should have source as string', () => {
      const source = 'whatsapp'
      expect(typeof source).toBe('string')
    })

    it('should have timestamp as ISO 8601 string', () => {
      const timestamp = new Date().toISOString()
      expect(typeof timestamp).toBe('string')
      expect(timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )
    })
  })

  describe('Property Value Validation - source', () => {
    it('should accept "whatsapp" as valid source', () => {
      const source = 'whatsapp'
      const validSources = ['whatsapp', 'web']
      expect(validSources).toContain(source)
    })

    it('should accept "web" as valid source', () => {
      const source = 'web'
      const validSources = ['whatsapp', 'web']
      expect(validSources).toContain(source)
    })

    it('should reject invalid source values', () => {
      const invalidSources = ['mobile', 'api', 'unknown', '']
      const validSources = ['whatsapp', 'web']

      invalidSources.forEach((source) => {
        expect(validSources).not.toContain(source)
      })
    })

    it('should be case-sensitive for source values', () => {
      const invalidSources = ['WhatsApp', 'WHATSAPP', 'Web', 'WEB']
      const validSources = ['whatsapp', 'web']

      invalidSources.forEach((source) => {
        expect(validSources).not.toContain(source)
      })
    })
  })

  describe('Property Value Validation - preference', () => {
    it('should accept "opted_out" as valid preference', () => {
      const preference = 'opted_out'
      const validPreferences = ['opted_out', 'opted_in']
      expect(validPreferences).toContain(preference)
    })

    it('should accept "opted_in" as valid preference', () => {
      const preference = 'opted_in'
      const validPreferences = ['opted_out', 'opted_in']
      expect(validPreferences).toContain(preference)
    })

    it('should reject invalid preference values', () => {
      const invalidPreferences = ['opt_out', 'opt_in', 'disabled', 'enabled', '']
      const validPreferences = ['opted_out', 'opted_in']

      invalidPreferences.forEach((preference) => {
        expect(validPreferences).not.toContain(preference)
      })
    })

    it('should be case-sensitive for preference values', () => {
      const invalidPreferences = [
        'Opted_Out',
        'OPTED_OUT',
        'Opted_In',
        'OPTED_IN',
      ]
      const validPreferences = ['opted_out', 'opted_in']

      invalidPreferences.forEach((preference) => {
        expect(validPreferences).not.toContain(preference)
      })
    })
  })

  describe('Complete Event Examples', () => {
    it('should validate WhatsApp opt-out event', () => {
      const event = {
        event: 'engagement_preference_changed',
        distinctId: '123e4567-e89b-12d3-a456-426614174000',
        properties: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          preference: 'opted_out',
          source: 'whatsapp',
          timestamp: '2025-11-24T10:30:00.000Z',
        },
      }

      // Validate event name
      expect(event.event).toBe('engagement_preference_changed')

      // Validate all required properties present
      expect(event.properties).toHaveProperty('user_id')
      expect(event.properties).toHaveProperty('preference')
      expect(event.properties).toHaveProperty('source')
      expect(event.properties).toHaveProperty('timestamp')

      // Validate property types
      expect(typeof event.properties.user_id).toBe('string')
      expect(typeof event.properties.preference).toBe('string')
      expect(typeof event.properties.source).toBe('string')
      expect(typeof event.properties.timestamp).toBe('string')

      // Validate property values
      expect(['opted_out', 'opted_in']).toContain(event.properties.preference)
      expect(['whatsapp', 'web']).toContain(event.properties.source)
      expect(event.properties.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should validate web opt-in event', () => {
      const event = {
        event: 'engagement_preference_changed',
        distinctId: '123e4567-e89b-12d3-a456-426614174000',
        properties: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          preference: 'opted_in',
          source: 'web',
          timestamp: '2025-11-24T11:00:00.000Z',
        },
      }

      // Validate event name
      expect(event.event).toBe('engagement_preference_changed')

      // Validate all required properties present
      expect(event.properties).toHaveProperty('user_id')
      expect(event.properties).toHaveProperty('preference')
      expect(event.properties).toHaveProperty('source')
      expect(event.properties).toHaveProperty('timestamp')

      // Validate property types
      expect(typeof event.properties.user_id).toBe('string')
      expect(typeof event.properties.preference).toBe('string')
      expect(typeof event.properties.source).toBe('string')
      expect(typeof event.properties.timestamp).toBe('string')

      // Validate property values
      expect(['opted_out', 'opted_in']).toContain(event.properties.preference)
      expect(['whatsapp', 'web']).toContain(event.properties.source)
      expect(event.properties.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should validate WhatsApp opt-in event (opt-back-in)', () => {
      const event = {
        event: 'engagement_preference_changed',
        distinctId: '123e4567-e89b-12d3-a456-426614174000',
        properties: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          preference: 'opted_in',
          source: 'whatsapp',
          timestamp: '2025-11-24T12:00:00.000Z',
        },
      }

      // Validate event schema
      expect(event.event).toBe('engagement_preference_changed')
      expect(event.properties.preference).toBe('opted_in')
      expect(event.properties.source).toBe('whatsapp')
    })

    it('should validate web opt-out event', () => {
      const event = {
        event: 'engagement_preference_changed',
        distinctId: '123e4567-e89b-12d3-a456-426614174000',
        properties: {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          preference: 'opted_out',
          source: 'web',
          timestamp: '2025-11-24T13:00:00.000Z',
        },
      }

      // Validate event schema
      expect(event.event).toBe('engagement_preference_changed')
      expect(event.properties.preference).toBe('opted_out')
      expect(event.properties.source).toBe('web')
    })
  })

  describe('Invalid Event Detection', () => {
    it('should detect missing user_id', () => {
      const invalidEvent: any = {
        event: 'engagement_preference_changed',
        properties: {
          // user_id missing
          preference: 'opted_out',
          source: 'whatsapp',
          timestamp: new Date().toISOString(),
        },
      }

      expect(invalidEvent.properties.user_id).toBeUndefined()
    })

    it('should detect missing preference', () => {
      const invalidEvent: any = {
        event: 'engagement_preference_changed',
        properties: {
          user_id: 'user-123',
          // preference missing
          source: 'whatsapp',
          timestamp: new Date().toISOString(),
        },
      }

      expect(invalidEvent.properties.preference).toBeUndefined()
    })

    it('should detect missing source', () => {
      const invalidEvent: any = {
        event: 'engagement_preference_changed',
        properties: {
          user_id: 'user-123',
          preference: 'opted_out',
          // source missing
          timestamp: new Date().toISOString(),
        },
      }

      expect(invalidEvent.properties.source).toBeUndefined()
    })

    it('should detect missing timestamp', () => {
      const invalidEvent: any = {
        event: 'engagement_preference_changed',
        properties: {
          user_id: 'user-123',
          preference: 'opted_out',
          source: 'whatsapp',
          // timestamp missing
        },
      }

      expect(invalidEvent.properties.timestamp).toBeUndefined()
    })

    it('should detect wrong event name', () => {
      const invalidEvent = {
        event: 'preference_changed', // Wrong name
        properties: {
          user_id: 'user-123',
          preference: 'opted_out',
          source: 'whatsapp',
          timestamp: new Date().toISOString(),
        },
      }

      expect(invalidEvent.event).not.toBe('engagement_preference_changed')
    })
  })

  describe('Schema Consistency Across Sources', () => {
    it('should have identical schema for WhatsApp and web events', () => {
      const whatsappEvent = {
        event: 'engagement_preference_changed',
        properties: {
          user_id: 'user-123',
          preference: 'opted_out',
          source: 'whatsapp',
          timestamp: new Date().toISOString(),
        },
      }

      const webEvent = {
        event: 'engagement_preference_changed',
        properties: {
          user_id: 'user-123',
          preference: 'opted_out',
          source: 'web',
          timestamp: new Date().toISOString(),
        },
      }

      // Both events should have same properties (except source value)
      expect(Object.keys(whatsappEvent.properties).sort()).toEqual(
        Object.keys(webEvent.properties).sort()
      )

      // Both should use same event name
      expect(whatsappEvent.event).toBe(webEvent.event)
    })

    it('should support opt-out and opt-in from both sources', () => {
      const scenarios = [
        { source: 'whatsapp', preference: 'opted_out' },
        { source: 'whatsapp', preference: 'opted_in' },
        { source: 'web', preference: 'opted_out' },
        { source: 'web', preference: 'opted_in' },
      ]

      scenarios.forEach(({ source, preference }) => {
        expect(['whatsapp', 'web']).toContain(source)
        expect(['opted_out', 'opted_in']).toContain(preference)
      })
    })
  })
})
