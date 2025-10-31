import { getSupabaseClient } from '../services/supabase-client'
import { getUserSession } from '../auth/session-manager'
import { ParsedIntent } from '../types'
import { messages } from '../localization/pt-br'

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
      console.error('Error fetching categories:', error)
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
    console.error('Error in handleListCategories:', error)
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
      console.error('Error creating category:', error)
      return messages.categoryError
    }

    return messages.categoryAdded(category)
  } catch (error) {
    console.error('Error in handleAddCategory:', error)
    return messages.categoryError
  }
}

