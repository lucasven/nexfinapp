/**
 * User Identifier Synchronization
 *
 * Syncs WhatsApp user identifiers (JID, LID, phone number, etc.) to the database
 * when messages are received. This ensures we always have the latest identifier data
 * for user recognition, especially important for WhatsApp Business accounts.
 */

import { getSupabaseClient } from '../database/supabase-client.js'
import type { UserIdentifiers } from '../../utils/user-identifiers.js'

/**
 * Sync user identifiers to the database after successful authorization
 *
 * This function should be called after a user is authorized and we have their user_id.
 * It will update the authorized_whatsapp_numbers table with the latest identifier data.
 *
 * Strategy:
 * - Uses the database's upsert_whatsapp_identifiers function for atomic updates
 * - Only updates if we have a confirmed authorized user
 * - Preserves existing permissions and settings
 *
 * @param userId - The user's UUID from authorization
 * @param identifiers - Complete user identifiers from the message
 * @returns true if sync was successful, false otherwise
 */
export async function syncUserIdentifiers(
  userId: string,
  identifiers: UserIdentifiers
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()

    console.log('[Identifier Sync] Syncing identifiers for user:', userId)

    // Use the database function to upsert identifiers
    // This will update existing records or create new ones if needed
    const { data, error } = await supabase.rpc('upsert_whatsapp_identifiers', {
      p_user_id: userId,
      p_whatsapp_number: identifiers.phoneNumber || identifiers.jid, // Fallback to JID if no phone
      p_whatsapp_jid: identifiers.jid,
      p_whatsapp_lid: identifiers.lid,
      p_push_name: identifiers.pushName,
      p_account_type: identifiers.accountType,
      p_name: identifiers.pushName || 'Me', // Use push name as default display name
      p_is_primary: true, // Default to primary for first/only number
      p_permissions: {
        can_view: true,
        can_add: true,
        can_edit: true,
        can_delete: true,
        can_manage_budgets: true,
        can_view_reports: true,
      }
    })

    if (error) {
      console.error('[Identifier Sync] Error syncing identifiers:', error)
      return false
    }

    console.log('[Identifier Sync] Successfully synced identifiers:', data)
    return true
  } catch (error) {
    console.error('[Identifier Sync] Unexpected error:', error)
    return false
  }
}

/**
 * Check if identifier sync is needed for a user
 *
 * Determines if we should sync identifiers based on:
 * - Whether we have a JID stored for this user
 * - Whether the account type has changed (e.g., regular -> business)
 *
 * @param userId - The user's UUID
 * @param identifiers - Current user identifiers
 * @returns true if sync is recommended, false otherwise
 */
export async function shouldSyncIdentifiers(
  userId: string,
  identifiers: UserIdentifiers
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()

    // Check if we have this user's record with a JID
    const { data, error } = await supabase
      .from('authorized_whatsapp_numbers')
      .select('whatsapp_jid, whatsapp_lid, account_type')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[Identifier Sync] Error checking if sync needed:', error)
      return true // Sync on error to be safe
    }

    // Always sync if we don't have a record (shouldn't happen after auth, but just in case)
    if (!data) {
      return true
    }

    // Sync if JID is missing or different
    if (!data.whatsapp_jid || data.whatsapp_jid !== identifiers.jid) {
      console.log('[Identifier Sync] JID changed or missing, sync needed')
      return true
    }

    // Sync if LID changed (user might have switched to Business account)
    if (identifiers.lid && data.whatsapp_lid !== identifiers.lid) {
      console.log('[Identifier Sync] LID changed, sync needed')
      return true
    }

    // Sync if account type changed
    if (data.account_type !== identifiers.accountType) {
      console.log('[Identifier Sync] Account type changed, sync needed')
      return true
    }

    // No sync needed
    return false
  } catch (error) {
    console.error('[Identifier Sync] Unexpected error checking sync need:', error)
    return true // Sync on error to be safe
  }
}
