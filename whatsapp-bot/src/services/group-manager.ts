import type { WASocket } from '@whiskeysockets/baileys'
import { getSupabaseClient } from './supabase-client'

/**
 * Get or create a group for the user with the bot
 * Creates a 1-on-1 style group chat between user and bot
 */
export async function createUserGroup(
  sock: WASocket,
  userWhatsAppNumber: string,
  userId: string
): Promise<{ groupJid: string; inviteLink: string; inviteCode: string } | null> {
  console.log('[createUserGroup] Starting group creation process', {
    userWhatsAppNumber,
    userId,
    botJid: sock.user?.id
  })

  try {
    // Check if group already exists for this user
    const supabase = getSupabaseClient()
    console.log('[createUserGroup] Checking for existing group invite')
    
    const { data: existingInvite, error: queryError } = await supabase
      .from('whatsapp_group_invites')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (queryError) {
      console.error('[createUserGroup] Error querying existing invites:', queryError)
    }

    if (existingInvite && existingInvite.group_jid && existingInvite.invite_link) {
      console.log('[createUserGroup] Found existing invite', {
        groupJid: existingInvite.group_jid,
        inviteCode: existingInvite.invite_code
      })
      
      // Verify group still exists
      try {
        console.log('[createUserGroup] Verifying group metadata for:', existingInvite.group_jid)
        const groupMetadata = await sock.groupMetadata(existingInvite.group_jid)
        
        if (groupMetadata) {
          console.log('[createUserGroup] Group verified successfully', {
            groupName: groupMetadata.subject,
            participantsCount: groupMetadata.participants?.length
          })
          
          return {
            groupJid: existingInvite.group_jid,
            inviteLink: existingInvite.invite_link,
            inviteCode: existingInvite.invite_code || '',
          }
        }
      } catch (error) {
        // Group doesn't exist anymore, create new one
        console.log('[createUserGroup] Existing group not found or inaccessible, creating new one', error)
      }
    } else {
      console.log('[createUserGroup] No existing active invite found')
    }

    // Get bot's JID
    const botJid = sock.user?.id
    console.log('[createUserGroup] Bot JID:', botJid)
    
    if (!botJid) {
      console.error('[createUserGroup] Bot JID not available')
      throw new Error('Bot JID not available')
    }

    // Format user number as JID
    const userJid = `${userWhatsAppNumber}@s.whatsapp.net`
    console.log('[createUserGroup] Formatted user JID:', userJid)

    // Create a group (minimum 2 participants required)
    // For a 1-on-1 group, we need to add both user and bot
    const groupName = `Expense Tracker - ${userId.substring(0, 8)}`
    // TODO: Think of a way to create a group without hardcoding the participants (maybe have 2 bot numbers to add as participants)
    const participants = [userJid, `555182494291@s.whatsapp.net`, `555194434244@s.whatsapp.net`]
    
    console.log('[createUserGroup] Creating group with params:', {
      groupName,
      participants,
      participantsCount: participants.length
    })
    
    const group = await sock.groupCreate(groupName, participants)
    console.log('[createUserGroup] Group created successfully:', {
      groupId: group.id,
      participants: group.participants
    })

    const groupJid = group.id
    if (!groupJid) {
      console.error('[createUserGroup] Failed to get group JID from created group')
      throw new Error('Failed to get group JID')
    }

    // Generate invite link
    console.log('[createUserGroup] Generating invite code for group:', groupJid)
    const inviteCode = await sock.groupInviteCode(groupJid)
    
    if (!inviteCode) {
      console.error('[createUserGroup] Failed to generate invite code')
      throw new Error('Failed to generate invite code')
    }
    
    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`
    console.log('[createUserGroup] Generated invite link:', inviteLink)

    // Store in database
    console.log('[createUserGroup] Storing group info in database')
    const { error: upsertError } = await supabase
      .from('whatsapp_group_invites')
      .upsert({
        user_id: userId,
        group_jid: groupJid,
        invite_code: inviteCode,
        invite_link: inviteLink,
        is_active: true,
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })

    if (upsertError) {
      console.error('[createUserGroup] Error upserting to database:', upsertError)
      throw upsertError
    }

    console.log('[createUserGroup] Successfully created and stored group')
    return {
      groupJid,
      inviteLink,
      inviteCode,
    }
  } catch (error) {
    console.error('[createUserGroup] Error creating user group:', error)
    return null
  }
}

/**
 * Generate invite link for existing group
 */
export async function generateGroupInvite(
  sock: WASocket,
  groupJid: string
): Promise<{ inviteLink: string; inviteCode: string } | null> {
  console.log('[generateGroupInvite] Starting invite generation for group:', groupJid)
  
  try {
    console.log('[generateGroupInvite] Requesting invite code from WhatsApp')
    const inviteCode = await sock.groupInviteCode(groupJid)
    
    if (!inviteCode) {
      console.error('[generateGroupInvite] Failed to generate invite code - empty response')
      throw new Error('Failed to generate invite code')
    }
    
    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`
    console.log('[generateGroupInvite] Successfully generated invite:', {
      inviteCode,
      inviteLink
    })

    return {
      inviteLink,
      inviteCode,
    }
  } catch (error) {
    console.error('[generateGroupInvite] Error generating group invite:', error)
    return null
  }
}

/**
 * Process pending invite requests from database
 * This should be called periodically or via webhook
 */
export async function processPendingInviteRequests(sock: WASocket): Promise<void> {
  console.log('[processPendingInviteRequests] Starting to process pending invite requests')
  
  try {
    const supabase = getSupabaseClient()

    // Get pending invite requests (is_active = false, created within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    console.log('[processPendingInviteRequests] Querying requests created after:', oneHourAgo)
    
    // First get pending requests
    const { data: pendingRequests, error } = await supabase
      .from('whatsapp_group_invites')
      .select('*')
      .eq('is_active', false)
      .gte('created_at', oneHourAgo)
      .limit(10)

    if (error) {
      console.error('[processPendingInviteRequests] Error fetching pending requests:', error)
      return
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log('[processPendingInviteRequests] No pending requests found')
      return
    }

    console.log('[processPendingInviteRequests] Found pending requests:', {
      count: pendingRequests.length,
      requestIds: pendingRequests.map(r => r.id)
    })

    // For each request, get the primary number
    const requestsWithNumbers = []
    for (const request of pendingRequests) {
      console.log('[processPendingInviteRequests] Looking up primary number for user:', request.user_id)
      
      const { data: primaryNumber, error: numberError } = await supabase
        .from('authorized_whatsapp_numbers')
        .select('whatsapp_number, is_primary, user_id')
        .eq('user_id', request.user_id)
        .eq('is_primary', true)
        .maybeSingle()

      if (numberError) {
        console.error('[processPendingInviteRequests] Error fetching primary number:', numberError)
        continue
      }

      if (primaryNumber) {
        console.log('[processPendingInviteRequests] Found primary number:', {
          userId: request.user_id,
          whatsappNumber: primaryNumber.whatsapp_number
        })
        requestsWithNumbers.push({ ...request, primaryNumber })
      } else {
        console.warn('[processPendingInviteRequests] No primary number found for user:', request.user_id)
      }
    }

    console.log('[processPendingInviteRequests] Processing requests with numbers:', requestsWithNumbers.length)

    for (const requestWithNumber of requestsWithNumbers) {
      try {
        console.log('[processPendingInviteRequests] Processing request:', {
          requestId: requestWithNumber.id,
          userId: requestWithNumber.user_id,
          whatsappNumber: requestWithNumber.primaryNumber.whatsapp_number
        })
        
        const result = await createUserGroup(
          sock,
          requestWithNumber.primaryNumber.whatsapp_number,
          requestWithNumber.user_id
        )

        if (result) {
          console.log('[processPendingInviteRequests] Group created successfully, updating database')
          
          // Update request as processed
          const { error: updateError } = await supabase
            .from('whatsapp_group_invites')
            .update({
              group_jid: result.groupJid,
              invite_code: result.inviteCode,
              invite_link: result.inviteLink,
              is_active: true,
            })
            .eq('id', requestWithNumber.id)

          if (updateError) {
            console.error('[processPendingInviteRequests] Error updating request:', updateError)
          } else {
            console.log('[processPendingInviteRequests] Request marked as active:', requestWithNumber.id)
          }
        } else {
          console.warn('[processPendingInviteRequests] Failed to create group for request:', requestWithNumber.id)
        }
      } catch (error) {
        console.error(`[processPendingInviteRequests] Error processing invite request ${requestWithNumber.id}:`, error)
      }
    }

    console.log('[processPendingInviteRequests] Completed processing all pending requests')
  } catch (error) {
    console.error('[processPendingInviteRequests] Error processing pending invite requests:', error)
  }
}
