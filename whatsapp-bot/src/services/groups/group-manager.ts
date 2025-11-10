/**
 * WhatsApp Group Authorization Manager
 * 
 * Manages authorized groups where all messages are processed
 * without individual user authorization checks
 */

import { getSupabaseClient } from '../database/supabase-client.js'

export interface AuthorizedGroup {
  id: string
  group_jid: string
  group_name: string | null
  user_id: string
  added_by: string | null
  auto_authorized: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  last_message_at: string | null
}

/**
 * Check if a group is authorized for bot access
 * Returns the user_id of the group owner if authorized
 */
export async function isGroupAuthorized(groupJid: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    
    console.log('[isGroupAuthorized] Checking group:', groupJid)
    
    const { data, error } = await supabase
      .from('authorized_groups')
      .select('id, is_active, user_id')
      .eq('group_jid', groupJid)
      .eq('is_active', true)
      .maybeSingle()
    
    if (error) {
      console.error('[isGroupAuthorized] Database error:', error)
      return null
    }
    
    if (data) {
      console.log('[isGroupAuthorized] Group authorized, owner:', data.user_id)
      return data.user_id
    }
    
    console.log('[isGroupAuthorized] Group not authorized')
    return null
  } catch (error) {
    console.error('[isGroupAuthorized] Exception:', error)
    return null
  }
}

/**
 * Authorize a group for bot access
 */
export async function authorizeGroup(
  groupJid: string,
  groupName: string,
  userId: string,
  addedBy?: string,
  autoAuth: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient()
    
    console.log('[authorizeGroup] Authorizing group:', {
      groupJid,
      groupName,
      userId,
      addedBy,
      autoAuth
    })
    
    // Check if group already exists
    const { data: existing } = await supabase
      .from('authorized_groups')
      .select('id, is_active')
      .eq('group_jid', groupJid)
      .maybeSingle()
    
    if (existing) {
      // Update existing group
      const { error } = await supabase
        .from('authorized_groups')
        .update({
          group_name: groupName,
          is_active: true,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('group_jid', groupJid)
      
      if (error) {
        console.error('[authorizeGroup] Update error:', error)
        return { success: false, error: error.message }
      }
      
      console.log('[authorizeGroup] Group re-activated')
      return { success: true }
    }
    
    // Create new authorization
    const { error } = await supabase
      .from('authorized_groups')
      .insert({
        group_jid: groupJid,
        group_name: groupName,
        user_id: userId,
        added_by: addedBy || null,
        auto_authorized: autoAuth,
        is_active: true,
        last_message_at: new Date().toISOString()
      })
    
    if (error) {
      console.error('[authorizeGroup] Insert error:', error)
      return { success: false, error: error.message }
    }
    
    console.log('[authorizeGroup] Group authorized successfully')
    return { success: true }
  } catch (error) {
    console.error('[authorizeGroup] Exception:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Deauthorize a group (set is_active to false)
 */
export async function deauthorizeGroup(
  groupJid: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()
    
    console.log('[deauthorizeGroup] Deauthorizing group:', groupJid, 'for user:', userId)
    
    const { error } = await supabase
      .from('authorized_groups')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('group_jid', groupJid)
      .eq('user_id', userId)
    
    if (error) {
      console.error('[deauthorizeGroup] Error:', error)
      return false
    }
    
    console.log('[deauthorizeGroup] Group deauthorized')
    return true
  } catch (error) {
    console.error('[deauthorizeGroup] Exception:', error)
    return false
  }
}

/**
 * Get all authorized groups for a user
 */
export async function getAuthorizedGroups(userId: string): Promise<AuthorizedGroup[]> {
  try {
    const supabase = getSupabaseClient()
    
    const { data, error } = await supabase
      .from('authorized_groups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('[getAuthorizedGroups] Error:', error)
      return []
    }
    
    return data || []
  } catch (error) {
    console.error('[getAuthorizedGroups] Exception:', error)
    return []
  }
}

/**
 * Update last message timestamp for a group
 */
export async function updateGroupLastMessage(groupJid: string): Promise<void> {
  try {
    const supabase = getSupabaseClient()
    
    await supabase
      .from('authorized_groups')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('group_jid', groupJid)
      .eq('is_active', true)
  } catch (error) {
    console.error('[updateGroupLastMessage] Exception:', error)
  }
}

