// Jest globals are available
import { checkAuthorization, hasPermission } from './authorization'
import { mockSupabaseClient, resetSupabaseMocks, mockQuerySuccess } from '../__mocks__/supabase'

// Mock dependencies
jest.mock('../services/supabase-client', () => ({
  getSupabaseClient: () => mockSupabaseClient
}))

describe('Authorization Middleware', () => {
  beforeEach(() => {
    resetSupabaseMocks()
    jest.clearAllMocks()
  })

  describe('checkAuthorization', () => {
    it('should return authorized true for authorized WhatsApp number', async () => {
      const mockAuthorizedNumber = {
        id: 'auth-123',
        user_id: 'user-456',
        whatsapp_number: '5511999999999',
        name: 'Test User',
        is_primary: true,
        permissions: {
          can_view: true,
          can_add: true,
          can_edit: true,
          can_delete: true,
          can_manage_budgets: true,
          can_view_reports: true,
        },
        user_profiles: {
          user_id: 'user-456'
        }
      }

      mockQuerySuccess(mockAuthorizedNumber)

      const result = await checkAuthorization('5511999999999')

      expect(result.authorized).toBe(true)
      expect(result.userId).toBe('user-456')
      expect(result.permissions).toEqual({
        can_view: true,
        can_add: true,
        can_edit: true,
        can_delete: true,
        can_manage_budgets: true,
        can_view_reports: true,
      })
    })

    it('should return authorized false for unauthorized WhatsApp number', async () => {
      // First query for authorized_whatsapp_numbers returns null
      mockQuerySuccess(null)

      const result = await checkAuthorization('5511888888888')

      expect(result.authorized).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('not authorized')
    })

    it('should fall back to session-based auth for legacy users', async () => {
      // First query for authorized_whatsapp_numbers returns null
      mockSupabaseClient.from = jest.fn().mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }
        })
      }).mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { user_id: 'legacy-user-123' },
          error: null
        })
      })

      const result = await checkAuthorization('5511777777777')

      expect(result.authorized).toBe(true)
      expect(result.userId).toBe('legacy-user-123')
      // Legacy users get full permissions
      expect(result.permissions).toBeDefined()
      expect(result.permissions?.can_view).toBe(true)
      expect(result.permissions?.can_add).toBe(true)
    })

    it('should return authorized true with limited permissions', async () => {
      const mockLimitedNumber = {
        id: 'auth-789',
        user_id: 'user-012',
        whatsapp_number: '5511666666666',
        name: 'Limited User',
        is_primary: false,
        permissions: {
          can_view: true,
          can_add: false,
          can_edit: false,
          can_delete: false,
          can_manage_budgets: false,
          can_view_reports: false,
        },
        user_profiles: {
          user_id: 'user-012'
        }
      }

      mockQuerySuccess(mockLimitedNumber)

      const result = await checkAuthorization('5511666666666')

      expect(result.authorized).toBe(true)
      expect(result.permissions).toBeDefined()
      expect(result.permissions?.can_view).toBe(true)
      expect(result.permissions?.can_add).toBe(false)
      expect(result.permissions?.can_delete).toBe(false)
    })
  })

  describe('hasPermission', () => {
    const fullPermissions = {
      can_view: true,
      can_add: true,
      can_edit: true,
      can_delete: true,
      can_manage_budgets: true,
      can_view_reports: true,
    }

    const limitedPermissions = {
      can_view: true,
      can_add: false,
      can_edit: false,
      can_delete: false,
      can_manage_budgets: false,
      can_view_reports: false,
    }

    it('should return true when user has the required permission', () => {
      expect(hasPermission(fullPermissions, 'view')).toBe(true)
      expect(hasPermission(fullPermissions, 'add')).toBe(true)
      expect(hasPermission(fullPermissions, 'edit')).toBe(true)
      expect(hasPermission(fullPermissions, 'delete')).toBe(true)
      expect(hasPermission(fullPermissions, 'manage_budgets')).toBe(true)
      expect(hasPermission(fullPermissions, 'view_reports')).toBe(true)
    })

    it('should return false when user lacks the required permission', () => {
      expect(hasPermission(limitedPermissions, 'view')).toBe(true)
      expect(hasPermission(limitedPermissions, 'add')).toBe(false)
      expect(hasPermission(limitedPermissions, 'edit')).toBe(false)
      expect(hasPermission(limitedPermissions, 'delete')).toBe(false)
      expect(hasPermission(limitedPermissions, 'manage_budgets')).toBe(false)
      expect(hasPermission(limitedPermissions, 'view_reports')).toBe(false)
    })

    it('should handle edge cases', () => {
      const noPermissions = {
        can_view: false,
        can_add: false,
        can_edit: false,
        can_delete: false,
        can_manage_budgets: false,
        can_view_reports: false,
      }

      expect(hasPermission(noPermissions, 'view')).toBe(false)
      expect(hasPermission(noPermissions, 'add')).toBe(false)
    })
  })
})

