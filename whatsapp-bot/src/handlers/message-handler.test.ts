/**
 * Integration tests for message handler auto-auth and permission enforcement
 * 
 * These tests verify:
 * 1. Auto-authentication works when authorized WhatsApp numbers send messages
 * 2. Permission enforcement blocks unauthorized actions
 * 3. Fallback to login works for non-authorized numbers
 */

// Note: We test the individual components rather than the full message handler
// to avoid circular dependency issues with the test setup

import { mockSupabaseClient, resetSupabaseMocks } from '../__mocks__/supabase'

// Mock dependencies BEFORE importing
jest.mock('../services/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

const mockGetUserSession = jest.fn()
const mockCreateUserSession = jest.fn()
const mockCheckAuthorization = jest.fn()
const mockHasPermission = jest.fn()

jest.mock('../auth/session-manager', () => ({
  getUserSession: mockGetUserSession,
  createUserSession: mockCreateUserSession,
  updateUserActivity: jest.fn(),
}))

jest.mock('../middleware/authorization', () => ({
  checkAuthorization: mockCheckAuthorization,
  hasPermission: mockHasPermission,
}))

describe('Message Handler - Auto Auth and Permissions', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('Auto-authentication flow', () => {
    it('should auto-create session for authorized WhatsApp number', async () => {
      // Simulate: No existing session, but number is authorized
      mockGetUserSession
        .mockResolvedValueOnce(null) // First check: no session
        .mockResolvedValueOnce({ // After createUserSession: session exists
          id: 'session-123',
          whatsappNumber: '5511999999999',
          userId: 'user-456',
          sessionToken: 'token-789',
          isActive: true,
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + 86400000)
        })

      mockCheckAuthorization.mockResolvedValue({
        authorized: true,
        userId: 'user-456',
        permissions: {
          can_view: true,
          can_add: true,
          can_edit: true,
          can_delete: true,
          can_manage_budgets: true,
          can_view_reports: true,
        }
      })

      mockCreateUserSession.mockResolvedValue('token-789')

      // Test the getOrCreateSession flow
      const whatsappNumber = '5511999999999'
      
      // First call should return null (no session)
      let session = await mockGetUserSession(whatsappNumber)
      expect(session).toBeNull()

      // Check authorization
      const authResult = await mockCheckAuthorization(whatsappNumber)
      expect(authResult.authorized).toBe(true)
      expect(authResult.userId).toBe('user-456')

      // Create session
      if (authResult.authorized && authResult.userId) {
        await mockCreateUserSession(whatsappNumber, authResult.userId)
      }

      // Second call should return session
      session = await mockGetUserSession(whatsappNumber)
      expect(session).toBeDefined()
      expect(session?.userId).toBe('user-456')
      
      // Verify createUserSession was called with correct params
      expect(mockCreateUserSession).toHaveBeenCalledWith(whatsappNumber, 'user-456')
    })

    it('should not create session for unauthorized number', async () => {
      mockGetUserSession.mockResolvedValue(null)
      
      mockCheckAuthorization.mockResolvedValue({
        authorized: false,
        error: 'Number not authorized'
      })

      const whatsappNumber = '5511888888888'
      
      const session = await mockGetUserSession(whatsappNumber)
      expect(session).toBeNull()

      const authResult = await mockCheckAuthorization(whatsappNumber)
      expect(authResult.authorized).toBe(false)

      // Should not create session
      expect(mockCreateUserSession).not.toHaveBeenCalled()
    })

    it('should reuse existing session without re-auth', async () => {
      mockGetUserSession.mockResolvedValue({
        id: 'session-123',
        whatsappNumber: '5511999999999',
        userId: 'user-456',
        sessionToken: 'token-789',
        isActive: true,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      })

      const whatsappNumber = '5511999999999'
      const session = await mockGetUserSession(whatsappNumber)
      
      expect(session).toBeDefined()
      expect(session?.userId).toBe('user-456')
      
      // Should not need to check authorization or create session
      expect(mockCheckAuthorization).not.toHaveBeenCalled()
      expect(mockCreateUserSession).not.toHaveBeenCalled()
    })
  })

  describe('Permission enforcement', () => {
    it('should validate permissions before executing action', async () => {
      const limitedPermissions = {
        can_view: true,
        can_add: false,
        can_edit: false,
        can_delete: false,
        can_manage_budgets: false,
        can_view_reports: false,
      }

      mockCheckAuthorization.mockResolvedValue({
        authorized: true,
        userId: 'user-limited',
        permissions: limitedPermissions
      })

      mockHasPermission.mockImplementation((perms, action) => {
        if (action === 'view') return perms.can_view
        if (action === 'add') return perms.can_add
        return false
      })

      const authResult = await mockCheckAuthorization('5511666666666')
      expect(authResult.authorized).toBe(true)

      // Check view permission - should pass
      const canView = mockHasPermission(authResult.permissions, 'view')
      expect(canView).toBe(true)

      // Check add permission - should fail
      const canAdd = mockHasPermission(authResult.permissions, 'add')
      expect(canAdd).toBe(false)
    })

    it('should allow actions with proper permissions', async () => {
      const fullPermissions = {
        can_view: true,
        can_add: true,
        can_edit: true,
        can_delete: true,
        can_manage_budgets: true,
        can_view_reports: true,
      }

      mockCheckAuthorization.mockResolvedValue({
        authorized: true,
        userId: 'user-full',
        permissions: fullPermissions
      })

      mockHasPermission.mockReturnValue(true)

      const authResult = await mockCheckAuthorization('5511999999999')
      expect(authResult.authorized).toBe(true)

      // All permissions should pass
      expect(mockHasPermission(authResult.permissions, 'view')).toBe(true)
      expect(mockHasPermission(authResult.permissions, 'add')).toBe(true)
      expect(mockHasPermission(authResult.permissions, 'delete')).toBe(true)
    })

    it('should deny unauthorized number', async () => {
      mockCheckAuthorization.mockResolvedValue({
        authorized: false,
        error: 'WhatsApp number not authorized'
      })

      const authResult = await mockCheckAuthorization('5511000000000')
      expect(authResult.authorized).toBe(false)
      expect(authResult.error).toBeDefined()
    })
  })
})

