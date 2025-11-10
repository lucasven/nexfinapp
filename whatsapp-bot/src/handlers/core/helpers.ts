/**
 * Core Helper Functions
 * Shared utility functions used across handlers
 */

import { getUserSession, createUserSession } from '../../auth/session-manager.js'
import { checkAuthorization } from '../../middleware/authorization.js'
import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { logger } from '../../services/monitoring/logger.js'

/**
 * Helper function to get category ID from category name
 * Prioritizes user's custom categories over default ones
 */
export async function getCategoryId(categoryName: string, userId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient()
    
    // First try to match user's custom categories
    const { data: customCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('is_custom', true)
      .ilike('name', `%${categoryName}%`)
      .limit(1)
      .single()
    
    if (customCategory) {
      return customCategory.id
    }
    
    // Then try default categories
    const { data: defaultCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('is_custom', false)
      .ilike('name', `%${categoryName}%`)
      .limit(1)
      .single()
    
    return defaultCategory?.id || null
  } catch (error) {
    logger.error('Error looking up category ID', { categoryName, userId }, error as Error)
    return null
  }
}

/**
 * Helper function to auto-authenticate using authorized WhatsApp numbers
 * Returns existing session or creates one if the number is authorized
 */
export async function getOrCreateSession(whatsappNumber: string): Promise<any | null> {
  // Check for existing session first
  let session = await getUserSession(whatsappNumber)
  if (session) {
    return session
  }

  // Try auto-authentication via authorized_whatsapp_numbers
  const authResult = await checkAuthorization(whatsappNumber)
  if (authResult.authorized && authResult.userId) {
    logger.info('Auto-authenticating WhatsApp number', { whatsappNumber, userId: authResult.userId })
    await createUserSession(whatsappNumber, authResult.userId)
    session = await getUserSession(whatsappNumber)
    return session
  }

  return null
}
