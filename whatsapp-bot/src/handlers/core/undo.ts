/**
 * Undo Handler
 * 
 * Provides ability to undo recent actions (transaction add, edit, delete)
 * Uses in-memory stack with automatic cleanup after 5 minutes
 */

import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'

/**
 * Represents an action that can be undone
 */
interface UndoState {
  userId: string
  action: 'add_transaction' | 'edit_transaction' | 'delete_transaction' | 'change_category' | 
          'add_recurring' | 'edit_recurring' | 'delete_recurring' | 'add_category' | 'remove_category' |
          'set_budget' | 'delete_budget'
  data: any  // Original data before change
  timestamp: Date
}

// In-memory storage of undo states
// Key: whatsappNumber, Value: Stack of undo states (max 3)
const undoStack = new Map<string, UndoState[]>()

// Cleanup interval: Clear undo states older than 5 minutes every minute
setInterval(() => {
  const now = new Date()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

  for (const [whatsappNumber, states] of undoStack.entries()) {
    const validStates = states.filter(state => state.timestamp > fiveMinutesAgo)
    
    if (validStates.length === 0) {
      undoStack.delete(whatsappNumber)
    } else if (validStates.length < states.length) {
      undoStack.set(whatsappNumber, validStates)
    }
  }
}, 60000) // Run every minute

/**
 * Store an undo state for a user action
 * Keeps maximum of 3 states per user
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param action - Type of action performed
 * @param data - Original data before the action (for restoration)
 */
export function storeUndoState(
  whatsappNumber: string,
  action: UndoState['action'],
  data: any
): void {
  const session = getUserSession(whatsappNumber)
  
  // Get user's current undo stack
  const userStack = undoStack.get(whatsappNumber) || []

  // Create new undo state
  const newState: UndoState = {
    userId: (session as any)?.userId,
    action,
    data,
    timestamp: new Date()
  }

  // Add to front of stack
  userStack.unshift(newState)

  // Keep only last 3 actions
  if (userStack.length > 3) {
    userStack.pop()
  }

  undoStack.set(whatsappNumber, userStack)

  logger.info('Undo state stored', {
    whatsappNumber,
    action,
    stackSize: userStack.length
  })
}

/**
 * Undo the last action performed by the user
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @returns Success message or error
 */
export async function handleUndo(whatsappNumber: string): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.loginPrompt
    }

    // Get user's undo stack
    const userStack = undoStack.get(whatsappNumber)
    
    if (!userStack || userStack.length === 0) {
      return messages.undoNotAvailable
    }

    // Pop the most recent action
    const lastAction = userStack.shift()!
    undoStack.set(whatsappNumber, userStack)

    const supabase = getSupabaseClient()

    // Perform undo based on action type
    switch (lastAction.action) {
      case 'add_transaction':
        // Delete the added transaction
        await supabase
          .from('transactions')
          .delete()
          .eq('id', lastAction.data.id)
        
        logger.info('Undid add_transaction', { whatsappNumber, transactionId: lastAction.data.user_readable_id })
        break

      case 'edit_transaction':
      case 'change_category':
        // Restore original transaction data
        const { id, ...originalData } = lastAction.data
        await supabase
          .from('transactions')
          .update(originalData)
          .eq('id', id)
        
        logger.info('Undid edit/change_category', { whatsappNumber, transactionId: lastAction.data.user_readable_id })
        break

      case 'delete_transaction':
        // Restore deleted transaction
        const { id: deletedId, ...transactionData } = lastAction.data
        await supabase
          .from('transactions')
          .insert(transactionData)
        
        logger.info('Undid delete_transaction', { whatsappNumber, transactionId: lastAction.data.user_readable_id })
        break

      case 'add_recurring':
        // Delete the added recurring transaction
        await supabase
          .from('recurring_transactions')
          .delete()
          .eq('id', lastAction.data.id)
        
        logger.info('Undid add_recurring', { whatsappNumber })
        break

      case 'edit_recurring':
        // Restore original recurring transaction data
        const { id: editRecurringId, ...originalRecurringData } = lastAction.data
        await supabase
          .from('recurring_transactions')
          .update(originalRecurringData)
          .eq('id', editRecurringId)
        
        logger.info('Undid edit_recurring', { whatsappNumber })
        break

      case 'delete_recurring':
        // Restore deleted recurring transaction
        const { id: recurringId, ...recurringData } = lastAction.data
        await supabase
          .from('recurring_transactions')
          .insert(recurringData)
        
        logger.info('Undid delete_recurring', { whatsappNumber })
        break

      case 'add_category':
        // Delete the added category
        await supabase
          .from('categories')
          .delete()
          .eq('id', lastAction.data.id)
        
        logger.info('Undid add_category', { whatsappNumber, categoryName: lastAction.data.name })
        break

      case 'remove_category':
        // Restore deleted category
        const { id: categoryId, ...categoryData } = lastAction.data
        await supabase
          .from('categories')
          .insert(categoryData)
        
        logger.info('Undid remove_category', { whatsappNumber, categoryName: lastAction.data.name })
        break

      case 'set_budget':
        // Delete the set budget or restore previous value
        if (lastAction.data.previousBudget) {
          // There was a previous budget, restore it
          await supabase
            .from('budgets')
            .update(lastAction.data.previousBudget)
            .eq('id', lastAction.data.id)
        } else {
          // No previous budget, delete the new one
          await supabase
            .from('budgets')
            .delete()
            .eq('id', lastAction.data.id)
        }
        
        logger.info('Undid set_budget', { whatsappNumber })
        break

      case 'delete_budget':
        // Restore deleted budget
        const { id: budgetId, ...budgetData } = lastAction.data
        await supabase
          .from('budgets')
          .insert(budgetData)
        
        logger.info('Undid delete_budget', { whatsappNumber })
        break

      default:
        logger.warn('Unknown undo action type', { action: lastAction.action })
        return '❌ Não foi possível desfazer esta ação.'
    }

    return messages.undoSuccess
  } catch (error) {
    logger.error('Error in handleUndo', { whatsappNumber }, error as Error)
    return messages.genericError
  }
}

/**
 * Clear all undo states for a user
 * Useful when user logs out
 * 
 * @param whatsappNumber - User's WhatsApp number
 */
export function clearUndoStack(whatsappNumber: string): void {
  undoStack.delete(whatsappNumber)
  logger.info('Undo stack cleared', { whatsappNumber })
}

/**
 * Get the number of actions that can be undone for a user
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @returns Number of undoable actions
 */
export function getUndoStackSize(whatsappNumber: string): number {
  const userStack = undoStack.get(whatsappNumber)
  return userStack ? userStack.length : 0
}

