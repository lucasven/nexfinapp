/**
 * Unit tests for User Identifiers utility
 */

import { describe, it, expect } from '@jest/globals'
import {
  extractPhoneNumberFromJid,
  extractUserIdentifiers,
  normalizePhoneNumber,
  isSameUser,
  formatIdentifiersForLog,
  isWhatsAppUser,
  isTelegramUser,
  createTelegramIdentifiers
} from '../user-identifiers'
import type { proto } from '@whiskeysockets/baileys'

describe('User Identifiers', () => {
  describe('extractPhoneNumberFromJid', () => {
    it('should extract phone number from regular JID', () => {
      const jid = '5511999999999@s.whatsapp.net'
      const result = extractPhoneNumberFromJid(jid)
      expect(result).toBe('5511999999999')
    })

    it('should extract phone number from JID with LID suffix', () => {
      const jid = '5511999999999:10@s.whatsapp.net'
      const result = extractPhoneNumberFromJid(jid)
      expect(result).toBe('5511999999999')
    })

    it('should return null for anonymous LID without phone number', () => {
      const jid = 'abc123def:45@lid'
      const result = extractPhoneNumberFromJid(jid)
      expect(result).toBeNull()
    })

    it('should return null for empty JID', () => {
      const result = extractPhoneNumberFromJid('')
      expect(result).toBeNull()
    })

    it('should strip non-digit characters', () => {
      const jid = '+55-11-99999-9999@s.whatsapp.net'
      const result = extractPhoneNumberFromJid(jid)
      expect(result).toBe('5511999999999')
    })
  })

  describe('extractUserIdentifiers', () => {
    it('should extract identifiers from regular WhatsApp message', () => {
      const message: any = {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: false,
          id: 'test-id'
        },
        pushName: 'John Doe'
      }

      const result = extractUserIdentifiers(message, false)

      expect(result.jid).toBe('5511999999999@s.whatsapp.net')
      expect(result.phoneNumber).toBe('5511999999999')
      expect(result.lid).toBeNull()
      expect(result.pushName).toBe('John Doe')
      expect(result.accountType).toBe('regular')
      expect(result.isGroup).toBe(false)
      expect(result.groupJid).toBeNull()
    })

    it('should extract identifiers from WhatsApp Business message with LID', () => {
      const message: any = {
        key: {
          remoteJid: '5511999999999:10@s.whatsapp.net',
          fromMe: false,
          id: 'test-id',
          senderLid: 'business_lid_123'
        },
        pushName: 'Business Account',
        verifiedBizName: 'My Business'
      }

      const result = extractUserIdentifiers(message, false)

      expect(result.jid).toBe('5511999999999:10@s.whatsapp.net')
      expect(result.phoneNumber).toBe('5511999999999')
      expect(result.lid).toBe('business_lid_123')
      expect(result.pushName).toBe('Business Account')
      expect(result.accountType).toBe('business')
      expect(result.isGroup).toBe(false)
    })

    it('should extract identifiers from group message', () => {
      const message: any = {
        key: {
          remoteJid: '123456789@g.us',
          participant: '5511888888888@s.whatsapp.net',
          fromMe: false,
          id: 'test-id'
        },
        pushName: 'Group Member'
      }

      const result = extractUserIdentifiers(message, true)

      expect(result.jid).toBe('5511888888888@s.whatsapp.net')
      expect(result.phoneNumber).toBe('5511888888888')
      expect(result.isGroup).toBe(true)
      expect(result.groupJid).toBe('123456789@g.us')
    })

    it('should extract identifiers from group message with Business account', () => {
      const message: any = {
        key: {
          remoteJid: '123456789@g.us',
          participant: '5511777777777:20@s.whatsapp.net',
          participantLid: 'group_business_lid',
          fromMe: false,
          id: 'test-id'
        },
        pushName: 'Business in Group'
      }

      const result = extractUserIdentifiers(message, true)

      expect(result.jid).toBe('5511777777777:20@s.whatsapp.net')
      expect(result.phoneNumber).toBe('5511777777777')
      expect(result.lid).toBe('group_business_lid')
      expect(result.accountType).toBe('business')
      expect(result.isGroup).toBe(true)
    })

    it('should use direct phone number fields when available', () => {
      const message: any = {
        key: {
          remoteJid: 'anonymous@lid',
          senderPn: '5511666666666',
          fromMe: false,
          id: 'test-id'
        },
        pushName: 'Anonymous User'
      }

      const result = extractUserIdentifiers(message, false)

      expect(result.jid).toBe('anonymous@lid')
      expect(result.phoneNumber).toBe('5511666666666') // From senderPn
      expect(result.accountType).toBe('regular')
    })
  })

  describe('normalizePhoneNumber', () => {
    it('should normalize phone number to digits only', () => {
      expect(normalizePhoneNumber('+55 11 99999-9999')).toBe('5511999999999')
      expect(normalizePhoneNumber('(55) 11 99999-9999')).toBe('5511999999999')
      expect(normalizePhoneNumber('5511999999999')).toBe('5511999999999')
    })

    it('should return null for empty/null input', () => {
      expect(normalizePhoneNumber(null)).toBeNull()
      expect(normalizePhoneNumber(undefined)).toBeNull()
      expect(normalizePhoneNumber('')).toBeNull()
    })

    it('should return null for non-numeric string', () => {
      expect(normalizePhoneNumber('abc')).toBeNull()
    })
  })

  describe('isSameUser', () => {
    it('should return true for identical JIDs', () => {
      const jid1 = '5511999999999@s.whatsapp.net'
      const jid2 = '5511999999999@s.whatsapp.net'
      expect(isSameUser(jid1, jid2)).toBe(true)
    })

    it('should return true for JIDs with same phone but different LID suffix', () => {
      const jid1 = '5511999999999@s.whatsapp.net'
      const jid2 = '5511999999999:10@s.whatsapp.net'
      expect(isSameUser(jid1, jid2)).toBe(true)
    })

    it('should return false for different phone numbers', () => {
      const jid1 = '5511999999999@s.whatsapp.net'
      const jid2 = '5511888888888@s.whatsapp.net'
      expect(isSameUser(jid1, jid2)).toBe(false)
    })

    it('should return false for empty JIDs', () => {
      expect(isSameUser('', '')).toBe(false)
      expect(isSameUser('5511999999999@s.whatsapp.net', '')).toBe(false)
    })

    it('should compare anonymous JIDs directly', () => {
      const jid1 = 'anonymous_lid_123@lid'
      const jid2 = 'anonymous_lid_123@lid'
      const jid3 = 'anonymous_lid_456@lid'

      expect(isSameUser(jid1, jid2)).toBe(true)
      expect(isSameUser(jid1, jid3)).toBe(false)
    })
  })

  describe('formatIdentifiersForLog', () => {
    it('should sanitize phone number (show only last 4 digits)', () => {
      const identifiers: any = {
        platform: 'whatsapp',
        jid: '5511999999999@s.whatsapp.net',
        phoneNumber: '5511999999999',
        lid: null,
        pushName: 'Test User',
        accountType: 'regular',
        isGroup: false,
        groupJid: null
      }

      const result = formatIdentifiersForLog(identifiers)

      expect(result).toContain('platform:whatsapp')
      expect(result).toContain('phone:****9999')
      expect(result).toContain('type:regular')
      expect(result).toContain('name:Test User')
      expect(result).not.toContain('5511999999999') // Full number should not appear
    })

    it('should sanitize LID (show only first 8 chars)', () => {
      const identifiers: any = {
        platform: 'whatsapp',
        jid: 'test@lid',
        phoneNumber: null,
        lid: 'business_lid_1234567890',
        pushName: 'Business',
        accountType: 'business',
        isGroup: false,
        groupJid: null
      }

      const result = formatIdentifiersForLog(identifiers)

      expect(result).toContain('platform:whatsapp')
      expect(result).toContain('lid:business...')
      expect(result).toContain('type:business')
      expect(result).not.toContain('business_lid_1234567890') // Full LID should not appear
    })

    it('should include group information when applicable', () => {
      const identifiers: any = {
        platform: 'whatsapp',
        jid: '5511888888888@s.whatsapp.net',
        phoneNumber: '5511888888888',
        lid: null,
        pushName: 'Group Member',
        accountType: 'regular',
        isGroup: true,
        groupJid: '123456789@g.us'
      }

      const result = formatIdentifiersForLog(identifiers)

      expect(result).toContain('platform:whatsapp')
      expect(result).toContain('group:123456789')
    })

    it('should handle minimal identifier data', () => {
      const identifiers: any = {
        platform: 'whatsapp',
        jid: 'test@s.whatsapp.net',
        phoneNumber: null,
        lid: null,
        pushName: null,
        accountType: 'unknown',
        isGroup: false,
        groupJid: null
      }

      const result = formatIdentifiersForLog(identifiers)

      expect(result).toContain('platform:whatsapp')
      expect(result).toContain('type:unknown')
      expect(result).not.toContain('phone:')
      expect(result).not.toContain('lid:')
      expect(result).not.toContain('name:')
    })

    it('should format Telegram identifiers', () => {
      const identifiers: any = {
        platform: 'telegram',
        telegramId: '123456789012',
        chatId: '123456789012',
        pushName: 'Telegram User',
        isGroup: false,
        groupId: null
      }

      const result = formatIdentifiersForLog(identifiers)

      expect(result).toContain('platform:telegram')
      expect(result).toContain('tgId:****9012')
      expect(result).toContain('name:Telegram User')
      expect(result).not.toContain('123456789012') // Full ID should not appear
    })
  })
})
