/**
 * User Preference Manager
 * Handles user settings and preferences for bot behavior
 */

import { createClient } from '@supabase/supabase-js'
import { logger } from '../monitoring/logger.js'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
)

/**
 * Get user's OCR auto-add preference
 * @param userId - The user's ID
 * @returns true if user wants auto-add, false for always confirm (default)
 */
export async function getUserOcrPreference(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('ocr_auto_add')
      .eq('user_id', userId)
      .single()

    if (error) {
      logger.error('Error fetching OCR preference', { userId }, error)
      return false // Default to always confirm on error
    }

    const preference = data?.ocr_auto_add ?? false
    logger.info('Retrieved OCR preference', { userId, autoAdd: preference })
    return preference
  } catch (error) {
    logger.error('Exception fetching OCR preference', { userId }, error as Error)
    return false // Default to always confirm on exception
  }
}

/**
 * Set user's OCR auto-add preference
 * @param userId - The user's ID
 * @param autoAdd - true for auto-add, false for always confirm
 */
export async function setUserOcrPreference(
  userId: string,
  autoAdd: boolean
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({ ocr_auto_add: autoAdd })
      .eq('user_id', userId)

    if (error) {
      logger.error('Error updating OCR preference', { userId, autoAdd }, error)
      throw new Error(`Failed to update OCR preference: ${error.message}`)
    }

    logger.info('Updated OCR preference', { userId, autoAdd })
  } catch (error) {
    logger.error('Exception updating OCR preference', { userId, autoAdd }, error as Error)
    throw error
  }
}

/**
 * Get all user preferences (extensible for future settings)
 * @param userId - The user's ID
 * @returns Object with all user preferences
 */
export async function getUserPreferences(userId: string): Promise<{
  ocrAutoAdd: boolean
}> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('ocr_auto_add')
      .eq('user_id', userId)
      .single()

    if (error) {
      logger.error('Error fetching user preferences', { userId }, error)
      return { ocrAutoAdd: false } // Return defaults
    }

    return {
      ocrAutoAdd: data?.ocr_auto_add ?? false
    }
  } catch (error) {
    logger.error('Exception fetching user preferences', { userId }, error as Error)
    return { ocrAutoAdd: false } // Return defaults
  }
}
