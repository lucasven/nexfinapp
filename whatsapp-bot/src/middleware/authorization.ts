import { getSupabaseClient } from '../services/supabase-client.js'

export interface AuthorizationResult {
  authorized: boolean
  userId?: string
  permissions?: {
    can_view: boolean
    can_add: boolean
    can_edit: boolean
    can_delete: boolean
    can_manage_budgets: boolean
    can_view_reports: boolean
  }
  error?: string
}

/**
 * Check if a WhatsApp number is authorized and get its permissions
 */
export async function checkAuthorization(whatsappNumber: string): Promise<AuthorizationResult> {
  try {
    const supabase = getSupabaseClient()

    // First, try to get from authorized_whatsapp_numbers table
    console.log('[checkAuthorization] Checking authorization for WhatsApp number:', whatsappNumber)
    const { data: authorizedNumber, error: authError } = await supabase
      .from('authorized_whatsapp_numbers')
      .select('*')
      .eq('whatsapp_number', whatsappNumber)
      .maybeSingle() // Use maybeSingle() instead of single() to avoid PGRST116 error
    
    console.log('[checkAuthorization] Query result:', { 
      found: !!authorizedNumber, 
      error: authError,
      userId: authorizedNumber?.user_id 
    })
    
    // Check if there was a real error (not just "no rows")
    if (authError) {
      console.error('[checkAuthorization] Database error:', authError)
    }
    
    if (!authorizedNumber) {
      console.log('[checkAuthorization] Number not in authorized list, checking legacy sessions...')
      // If not found in authorized numbers, check if there's a session (backward compatibility)
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('user_id')
        .eq('whatsapp_number', whatsappNumber)
        .eq('is_active', true)
        .maybeSingle()

      if (session) {
        console.log('[checkAuthorization] Found legacy session for user:', session.user_id)
        // Legacy user - grant full permissions for backward compatibility
        return {
          authorized: true,
          userId: session.user_id,
          permissions: {
            can_view: true,
            can_add: true,
            can_edit: true,
            can_delete: true,
            can_manage_budgets: true,
            can_view_reports: true,
          },
        }
      }

      console.log('[checkAuthorization] Number not authorized')
      return {
        authorized: false,
        error: 'WhatsApp number not authorized. Please contact the account owner to add your number.',
      }
    }

    console.log('[checkAuthorization] Authorized! User ID:', authorizedNumber.user_id)
    return {
      authorized: true,
      userId: authorizedNumber.user_id,
      permissions: authorizedNumber.permissions as AuthorizationResult['permissions'],
    }
  } catch (error) {
    console.error('Error checking authorization:', error)
    return {
      authorized: false,
      error: 'Error checking authorization',
    }
  }
}

/**
 * Check if user has permission for a specific action
 */
export function hasPermission(
  permissions: AuthorizationResult['permissions'],
  action: 'view' | 'add' | 'edit' | 'delete' | 'manage_budgets' | 'view_reports'
): boolean {
  if (!permissions) return false

  switch (action) {
    case 'view':
      return permissions.can_view
    case 'add':
      return permissions.can_add
    case 'edit':
      return permissions.can_edit
    case 'delete':
      return permissions.can_delete
    case 'manage_budgets':
      return permissions.can_manage_budgets
    case 'view_reports':
      return permissions.can_view_reports
    default:
      return false
  }
}

/**
 * Get error message for unauthorized action
 */
export function getUnauthorizedMessage(action: string): string {
  return `Você não tem permissão para ${action}. Entre em contato com o proprietário da conta para solicitar permissões.`
}

