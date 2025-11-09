import { authenticateUser } from '../services/supabase-client.js'
import { createUserSession, logoutUser } from '../auth/session-manager.js'
import { messages } from '../localization/pt-br.js'
import { logger } from '../services/logger.js'

export async function handleLogin(whatsappNumber: string, emailAndPassword: string): Promise<string> {
  try {
    const [email, password] = emailAndPassword.split('|')
    
    if (!email || !password) {
      logger.warn('Login attempt with missing credentials', { whatsappNumber })
      return messages.loginError
    }

    // Authenticate with Supabase
    const { userId, error } = await authenticateUser(email, password)

    if (error || !userId) {
      logger.warn('Authentication failed', { whatsappNumber, email, error })
      return messages.loginError
    }

    // Create session
    const sessionToken = await createUserSession(whatsappNumber, userId)

    if (!sessionToken) {
      logger.error('Failed to create session after authentication', { whatsappNumber, userId })
      return messages.loginError
    }

    logger.info('User logged in successfully', { whatsappNumber, userId })
    return messages.loginSuccess
  } catch (error) {
    logger.error('Login error', { whatsappNumber }, error as Error)
    return messages.loginError
  }
}

export async function handleLogout(whatsappNumber: string): Promise<string> {
  try {
    await logoutUser(whatsappNumber)
    logger.info('User logged out', { whatsappNumber })
    return messages.logoutSuccess
  } catch (error) {
    logger.error('Logout error', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

