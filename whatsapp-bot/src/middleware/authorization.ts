import { getSupabaseClient } from '../services/database/supabase-client.js'
import type { WhatsAppUserIdentifiers } from '../utils/user-identifiers.js'
import { syncUserIdentifiers, shouldSyncIdentifiers } from '../services/user/identifier-sync.js'
import { queueGreetingForNewUser, shouldReceiveGreeting } from '../services/onboarding/queue-greeting.js'

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
 * Check if a WhatsApp user is authorized using multi-identifier lookup
 *
 * Lookup strategy (cascading):
 * 1. Try JID (most reliable, always available)
 * 2. Try LID (for Business/anonymous accounts)
 * 3. Try phone number (backward compatibility)
 * 4. Try legacy sessions (backward compatibility)
 */
export async function checkAuthorizationWithIdentifiers(
  identifiers: WhatsAppUserIdentifiers
): Promise<AuthorizationResult> {
  try {
    const supabase = getSupabaseClient()

    console.log('[Authorization] Checking authorization with multi-identifier lookup')

    // Use the database function for cascading lookup
    const { data: result, error } = await supabase
      .rpc('find_user_by_whatsapp_identifier', {
        p_jid: identifiers.jid,
        p_lid: identifiers.lid,
        p_phone_number: identifiers.phoneNumber
      })
      .maybeSingle<{
        user_id: string
        whatsapp_number: string
        whatsapp_jid: string
        whatsapp_lid: string | null
        name: string
        is_primary: boolean
        permissions: {
          can_view: boolean
          can_add: boolean
          can_edit: boolean
          can_delete: boolean
          can_manage_budgets: boolean
          can_view_reports: boolean
        }
        account_type: string
        push_name: string | null
      }>()

    if (error) {
      console.error('[Authorization] Database error:', error)
      // Don't return error yet, try legacy lookup
    }

    if (result) {
      console.log('[Authorization] User found! User ID:', result.user_id)

      // Sync identifiers in the background (don't block authorization)
      // This ensures we always have the latest JID, LID, and account type
      shouldSyncIdentifiers(result.user_id, identifiers)
        .then(needsSync => {
          if (needsSync) {
            console.log('[Authorization] Syncing user identifiers...')
            return syncUserIdentifiers(result.user_id, identifiers)
          }
          return false
        })
        .then(synced => {
          if (synced) {
            console.log('[Authorization] User identifiers synced successfully')
          }
        })
        .catch(syncError => {
          console.error('[Authorization] Failed to sync identifiers (non-critical):', syncError)
        })

      // Check if user should receive a greeting (first-time user)
      // This runs in the background and doesn't block authorization
      shouldReceiveGreeting(result.user_id)
        .then(shouldGreet => {
          if (shouldGreet) {
            console.log('[Authorization] New user detected, queuing greeting message...')
            return queueGreetingForNewUser(result.user_id, identifiers)
          }
          return false
        })
        .then(queued => {
          if (queued) {
            console.log('[Authorization] ✅ Greeting queued for first-time user')
          }
        })
        .catch(greetError => {
          console.error('[Authorization] Failed to queue greeting (non-critical):', greetError)
        })

      return {
        authorized: true,
        userId: result.user_id,
        permissions: result.permissions as AuthorizationResult['permissions'],
      }
    }

    // Fallback to legacy session lookup (backward compatibility)
    if (identifiers.phoneNumber) {
      console.log('[Authorization] Trying legacy session lookup...')
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('user_id')
        .eq('whatsapp_number', identifiers.phoneNumber)
        .eq('is_active', true)
        .maybeSingle()

      if (session) {
        console.log('[Authorization] Found legacy session for user:', session.user_id)
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
    }

    console.log('[Authorization] User not authorized')
    return {
      authorized: false,
      error: 'WhatsApp number not authorized. Please contact the account owner to add your number.',
    }
  } catch (error) {
    console.error('[Authorization] Error checking authorization:', error)
    return {
      authorized: false,
      error: 'Error checking authorization',
    }
  }
}

/**
 * Check if a JID is authorized by parsing it into UserIdentifiers
 *
 * This is useful for contexts where we only have a JID string (e.g., group invites)
 * and don't have access to the full WAMessage object.
 *
 * Supports:
 * - Regular JIDs: 5511999999999@s.whatsapp.net
 * - LID JIDs: 153283238822052@lid (Business accounts)
 * - JIDs with device suffix: 5511999999999:123@s.whatsapp.net
 */
export async function checkAuthorizationFromJid(
  jid: string
): Promise<AuthorizationResult> {
  const [localPart, domain] = jid.split('@')

  // Extract phone number (strip device suffix if present)
  const phoneNumber = domain === 's.whatsapp.net'
    ? localPart.split(':')[0]
    : null

  const identifiers: WhatsAppUserIdentifiers = {
    platform: 'whatsapp',
    jid: jid,
    lid: domain === 'lid' ? jid : null,
    phoneNumber: phoneNumber,
    accountType: domain === 'lid' ? 'business' : 'regular',
    pushName: null,
    isGroup: false,
    groupJid: null
  }

  console.log('[Authorization] checkAuthorizationFromJid:', {
    jid,
    parsedDomain: domain,
    isLid: domain === 'lid',
    extractedPhone: phoneNumber
  })

  return checkAuthorizationWithIdentifiers(identifiers)
}

/**
 * Check if a WhatsApp number is authorized and get its permissions
 * @deprecated Use checkAuthorizationWithIdentifiers instead for better Business account support
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

