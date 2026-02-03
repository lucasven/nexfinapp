/**
 * User Identifiers Utility
 *
 * Handles extraction and management of WhatsApp user identifiers.
 * Supports multiple identification methods for both regular WhatsApp and WhatsApp Business accounts.
 *
 * Identification Strategy:
 * 1. Full JID (always available) - e.g., "5511999999999@s.whatsapp.net"
 * 2. LID (for Business/anonymous accounts) - extracted from key.senderLid or key.participantLid
 * 3. Phone number (when available) - extracted from JID or key.senderPn/participantPn
 *
 * @see https://github.com/WhiskeySockets/Baileys for Baileys library documentation
 */

import type { proto } from '@whiskeysockets/baileys'

/**
 * Complete set of identifiers for a user (WhatsApp or Telegram)
 */
export interface UserIdentifiers {
  /** Full WhatsApp JID - always available for WhatsApp, most reliable */
  jid?: string

  /** Extracted phone number (digits only) - may be null for some Business accounts */
  phoneNumber: string | null

  /** Local Identifier (LID) for anonymous/Business accounts - may be null */
  lid: string | null

  /** Telegram user ID - available for Telegram messages */
  telegramId?: string

  /** User's display name from WhatsApp/Telegram - not unique but useful for display */
  pushName: string | null

  /** Account type detection */
  accountType: 'regular' | 'business' | 'unknown'

  /** Whether this message is from a group */
  isGroup: boolean

  /** Group JID if message is from a group */
  groupJid: string | null

  /** Platform identifier */
  platform?: 'whatsapp' | 'telegram'
}

/**
 * Extended message key with Baileys-specific fields
 * These fields are available in newer versions of Baileys
 */
interface ExtendedMessageKey extends proto.IMessageKey {
  senderLid?: string
  senderPn?: string
  participantLid?: string
  participantPn?: string
}

/**
 * Extended web message info with business-specific fields
 */
interface ExtendedWebMessageInfo extends proto.IWebMessageInfo {
  key: ExtendedMessageKey
  pushName?: string | null
  verifiedBizName?: string | null
}

/**
 * Extract phone number from JID
 *
 * JID formats:
 * - Regular: "5511999999999@s.whatsapp.net"
 * - With LID: "5511999999999:10@s.whatsapp.net" (Business accounts)
 *
 * @param jid - Full WhatsApp JID
 * @returns Phone number (digits only) or null if not extractable
 */
export function extractPhoneNumberFromJid(jid: string): string | null {
  if (!jid) return null

  // Split by @ to get the user part
  const userPart = jid.split('@')[0]

  // Handle LID format (e.g., "5511999999999:10")
  // Take the part before the colon
  const phoneWithoutLid = userPart.includes(':')
    ? userPart.split(':')[0]
    : userPart

  // Strip all non-digit characters first
  const phoneNumber = phoneWithoutLid.replace(/\D/g, '')

  // Check if we have a valid phone number:
  // 1. Must have at least 7 digits (minimum valid phone number length)
  // 2. The original string should start with either a digit or '+' (country code prefix)
  // This filters out anonymous LIDs like "abc123def" which don't start with digit or +
  const startsWithPhoneChars = /^[\+\d]/.test(phoneWithoutLid)

  if (!startsWithPhoneChars || phoneNumber.length < 7) {
    return null
  }

  return phoneNumber
}

/**
 * Extract all available user identifiers from a Baileys message
 *
 * This function handles both regular WhatsApp and WhatsApp Business accounts,
 * extracting all available identifiers for robust user recognition.
 *
 * @param message - Baileys WebMessageInfo object
 * @param isGroup - Whether the message is from a group
 * @returns Complete UserIdentifiers object
 */
export function extractUserIdentifiers(
  message: ExtendedWebMessageInfo,
  isGroup: boolean
): UserIdentifiers {
  const key = message.key as ExtendedMessageKey
  const remoteJid = key.remoteJid || ''

  // Get the raw JID (participant for groups, remoteJid for DMs)
  const rawJid = isGroup && key.participant
    ? key.participant
    : remoteJid

  // Extract phone number from multiple sources
  let phoneNumber: string | null = null

  // Try direct phone number fields first (most reliable for Business accounts)
  if (isGroup && key.participantPn) {
    phoneNumber = key.participantPn.replace(/\D/g, '')
  } else if (!isGroup && key.senderPn) {
    phoneNumber = key.senderPn.replace(/\D/g, '')
  }

  // Fallback to extracting from JID
  if (!phoneNumber) {
    phoneNumber = extractPhoneNumberFromJid(rawJid)
  }

  // Extract LID (Local Identifier) for Business/anonymous accounts
  const lid = isGroup
    ? (key.participantLid || null)
    : (key.senderLid || null)

  // Get push name (display name)
  const pushName = message.pushName || null

  // Detect account type
  const accountType = detectAccountType(lid, message.verifiedBizName, phoneNumber)

  // Get group JID if applicable
  const groupJid = isGroup ? remoteJid : null

  return {
    jid: rawJid,
    phoneNumber,
    lid,
    pushName,
    accountType,
    isGroup,
    groupJid
  }
}

/**
 * Detect WhatsApp account type based on available identifiers
 *
 * @param lid - Local Identifier (present for Business/anonymous accounts)
 * @param verifiedBizName - Verified business name (present for verified Business accounts)
 * @param phoneNumber - Extracted phone number
 * @returns Account type: 'regular', 'business', or 'unknown'
 */
function detectAccountType(
  lid: string | null,
  verifiedBizName: string | null | undefined,
  phoneNumber: string | null
): 'regular' | 'business' | 'unknown' {
  // Has verified business name = definitely business
  if (verifiedBizName) {
    return 'business'
  }

  // Has LID = likely business or privacy-focused account
  if (lid) {
    return 'business'
  }

  // Has phone number but no LID = likely regular WhatsApp
  if (phoneNumber) {
    return 'regular'
  }

  // Can't determine
  return 'unknown'
}

/**
 * Normalize a phone number to digits only
 * Useful for comparing phone numbers from different sources
 *
 * @param phoneNumber - Phone number in any format
 * @returns Normalized phone number (digits only) or null
 */
export function normalizePhoneNumber(phoneNumber: string | null | undefined): string | null {
  if (!phoneNumber) return null
  const normalized = phoneNumber.replace(/\D/g, '')
  return normalized.length > 0 ? normalized : null
}

/**
 * Check if two JIDs represent the same user
 * Handles different formats (with/without LID suffix)
 *
 * @param jid1 - First JID
 * @param jid2 - Second JID
 * @returns true if JIDs represent the same user
 */
export function isSameUser(jid1: string, jid2: string): boolean {
  if (!jid1 || !jid2) return false

  // Extract phone numbers from both JIDs
  const phone1 = extractPhoneNumberFromJid(jid1)
  const phone2 = extractPhoneNumberFromJid(jid2)

  // If both have phone numbers, compare them
  if (phone1 && phone2) {
    return phone1 === phone2
  }

  // Otherwise, compare full JIDs (for anonymous accounts)
  return jid1 === jid2
}

/**
 * Format user identifiers for logging (sanitizes sensitive data)
 *
 * @param identifiers - User identifiers
 * @returns Sanitized string for logging
 */
export function formatIdentifiersForLog(identifiers: UserIdentifiers): string {
  const parts: string[] = []

  if (identifiers.phoneNumber) {
    // Show only last 4 digits
    const masked = '****' + identifiers.phoneNumber.slice(-4)
    parts.push(`phone:${masked}`)
  }

  if (identifiers.lid) {
    // Show only first 8 chars of LID
    const masked = identifiers.lid.substring(0, 8) + '...'
    parts.push(`lid:${masked}`)
  }

  parts.push(`type:${identifiers.accountType}`)

  if (identifiers.pushName) {
    parts.push(`name:${identifiers.pushName}`)
  }

  if (identifiers.isGroup && identifiers.groupJid) {
    parts.push(`group:${identifiers.groupJid.split('@')[0]}`)
  }

  return parts.join(', ')
}
