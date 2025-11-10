import { getSupabaseClient } from '../../services/database/supabase-client.js'
import { getUserSession } from '../../auth/session-manager.js'
import { ParsedIntent } from '../../types.js'
import { messages } from '../../localization/pt-br.js'
import { logger } from '../../services/monitoring/logger.js'

export async function handleListCategories(whatsappNumber: string): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('type', { ascending: false })
      .order('name', { ascending: true })

    if (error) {
      logger.error('Error fetching categories:', error)
      return messages.genericError
    }

    if (!categories || categories.length === 0) {
      return 'Nenhuma categoria encontrada.'
    }

    let response = messages.categoryList

    // Group by type
    const incomeCategories = categories.filter(c => c.type === 'income')
    const expenseCategories = categories.filter(c => c.type === 'expense')

    if (incomeCategories.length > 0) {
      response += '\n💰 *Receitas*\n'
      for (const cat of incomeCategories) {
        response += `${cat.icon || '📁'} ${cat.name}\n`
      }
    }

    if (expenseCategories.length > 0) {
      response += '\n💸 *Despesas*\n'
      for (const cat of expenseCategories) {
        response += `${cat.icon || '📁'} ${cat.name}\n`
      }
    }

    return response
  } catch (error) {
    logger.error('Error in handleListCategories:', error as Error)
    return messages.genericError
  }
}

export async function handleAddCategory(whatsappNumber: string, intent: ParsedIntent): Promise<string> {
  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const { category } = intent.entities

    if (!category) {
      return messages.categoryError
    }

    const supabase = getSupabaseClient()

    // Create custom category
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: category,
        type: 'expense', // Default to expense
        is_custom: true,
        user_id: session.userId
      })
      .select()
      .single()

    if (error) {
      logger.error('Error creating category:', error)
      return messages.categoryError
    }

    return messages.categoryAdded(category)
  } catch (error) {
    logger.error('Error in handleAddCategory:', error as Error)
    return messages.categoryError
  }
}

/**
 * Remove a custom category
 * Checks if category is in use before allowing deletion
 * 
 * @param whatsappNumber - User's WhatsApp number
 * @param categoryName - Name of category to remove
 * @returns Success message or error
 */
export async function handleRemoveCategory(
  whatsappNumber: string,
  categoryName: string
): Promise<string> {
  if (!categoryName) {
    return '❌ Nome da categoria não fornecido.'
  }

  try {
    const session = await getUserSession(whatsappNumber)
    if (!session) {
      return messages.notAuthenticated
    }

    const supabase = getSupabaseClient()

    // Find the category
    const { data: category, error: findError } = await supabase
      .from('categories')
      .select('*')
      .ilike('name', `%${categoryName}%`)
      .single()

    if (findError || !category) {
      logger.error('Category not found', { categoryName })
      return messages.categoryNotFound(categoryName)
    }

    // Check if it's a default category (can't delete)
    if (!category.is_custom) {
      logger.warn('Attempt to delete default category', { categoryName, userId: session.userId })
      return messages.cannotDeleteDefaultCategory
    }

    // Check if category is owned by user
    if (category.user_id && category.user_id !== session.userId) {
      return messages.cannotDeleteDefaultCategory
    }

    // Check if category is in use
    const { count, error: countError } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', category.id)
      .eq('user_id', session.userId)

    if (countError) {
      logger.error('Error checking category usage', { categoryName, error: countError })
      return messages.genericError
    }

    if (count && count > 0) {
      logger.info('Category in use, cannot delete', { categoryName, transactionCount: count })
      return messages.categoryInUse(categoryName, count)
    }

    // Delete the category
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .eq('id', category.id)

    if (deleteError) {
      logger.error('Failed to delete category', { categoryName, error: deleteError })
      return messages.genericError
    }

    logger.info('Category removed', {
      whatsappNumber,
      userId: session.userId,
      categoryName
    })

    return messages.categoryRemoved(categoryName)
  } catch (error) {
    logger.error('Error in handleRemoveCategory', { whatsappNumber, categoryName }, error as Error)
    return messages.genericError
  }
}

