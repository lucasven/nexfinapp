import { createSession, deleteSession, getSession, updateSessionActivity } from '../services/supabase-client.js'
import { UserSession } from '../types.js'

const sessionCache = new Map<string, UserSession>()

export async function getUserSession(whatsappNumber: string): Promise<UserSession | null> {
  // Check cache first
  const cached = sessionCache.get(whatsappNumber)
  if (cached && new Date(cached.expiresAt) > new Date()) {
    return cached
  }

  // Fetch from database
  const session = await getSession(whatsappNumber)
  if (!session) {
    sessionCache.delete(whatsappNumber)
    return null
  }

  const userSession: UserSession = {
    id: session.id,
    whatsappNumber: session.whatsapp_number,
    userId: session.user_id,
    sessionToken: session.session_token,
    isActive: session.is_active,
    lastActivity: new Date(session.last_activity),
    expiresAt: new Date(session.expires_at)
  }

  sessionCache.set(whatsappNumber, userSession)
  return userSession
}

export async function createUserSession(whatsappNumber: string, userId: string): Promise<string | null> {
  const sessionToken = await createSession(whatsappNumber, userId)
  
  if (sessionToken) {
    sessionCache.delete(whatsappNumber) // Clear cache to force refresh
  }

  return sessionToken
}

export async function updateUserActivity(whatsappNumber: string): Promise<void> {
  await updateSessionActivity(whatsappNumber)
  
  const session = sessionCache.get(whatsappNumber)
  if (session) {
    session.lastActivity = new Date()
    session.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}

export async function logoutUser(whatsappNumber: string): Promise<void> {
  await deleteSession(whatsappNumber)
  sessionCache.delete(whatsappNumber)
}

export function isAuthenticated(whatsappNumber: string): boolean {
  const session = sessionCache.get(whatsappNumber)
  return session !== undefined && session.isActive && new Date(session.expiresAt) > new Date()
}

