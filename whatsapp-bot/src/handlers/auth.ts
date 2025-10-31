import { authenticateUser } from '../services/supabase-client'
import { createUserSession, logoutUser } from '../auth/session-manager'
import { messages } from '../localization/pt-br'

export async function handleLogin(whatsappNumber: string, emailAndPassword: string): Promise<string> {
  try {
    const [email, password] = emailAndPassword.split('|')
    
    if (!email || !password) {
      return messages.loginError
    }

    // Authenticate with Supabase
    const { userId, error } = await authenticateUser(email, password)

    if (error || !userId) {
      return messages.loginError
    }

    // Create session
    const sessionToken = await createUserSession(whatsappNumber, userId)

    if (!sessionToken) {
      return messages.loginError
    }

    return messages.loginSuccess
  } catch (error) {
    console.error('Login error:', error)
    return messages.loginError
  }
}

export async function handleLogout(whatsappNumber: string): Promise<string> {
  try {
    await logoutUser(whatsappNumber)
    return messages.logoutSuccess
  } catch (error) {
    console.error('Logout error:', error)
    return messages.genericError
  }
}

