/**
 * WhatsApp Service for standalone cron jobs
 *
 * This service provides a way to send WhatsApp messages from cron jobs
 * that run outside the main bot process.
 *
 * Note: For cron jobs to send messages, they need access to an active
 * WhatsApp connection. This implementation logs messages for now.
 * TODO: Implement proper message queue or HTTP API for production use.
 */

/**
 * Send a WhatsApp message to a phone number
 *
 * @param phoneNumber - The recipient's phone number (with country code)
 * @param message - The message text to send
 */
export async function sendMessage(
  phoneNumber: string,
  message: string
): Promise<void> {
  // TODO: Implement actual message sending via:
  // 1. HTTP API endpoint on the main bot
  // 2. Message queue (Redis, etc.)
  // 3. Shared Baileys session (requires session management)

  console.log(`📤 [WhatsApp Service] Would send to ${phoneNumber}:`)
  console.log(`   ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`)

  // For now, we'll just log the message
  // In production, this should actually send the message
  return Promise.resolve()
}

/**
 * Check if WhatsApp service is connected
 */
export function isConnected(): boolean {
  // TODO: Implement connection status check
  return false
}
