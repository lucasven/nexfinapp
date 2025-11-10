/**
 * Permission Mapping and Helper Functions
 * Maps intent actions to required permissions
 */

/**
 * Map intent actions to required permissions
 */
export const ACTION_PERMISSION_MAP: Record<string, 'view' | 'add' | 'edit' | 'delete' | 'manage_budgets' | 'view_reports' | null> = {
  // View permissions
  'show_expenses': 'view',
  'list_transactions': 'view',
  'show_budget': 'view',
  'list_budgets': 'view',
  'show_transaction_details': 'view',
  
  // Add permissions
  'add_expense': 'add',
  'add_income': 'add',
  'add_recurring': 'add',
  'add_category': 'add',
  
  // Edit permissions
  'edit_transaction': 'edit',
  'change_category': 'edit',
  'edit_recurring': 'edit',
  
  // Delete permissions
  'delete_transaction': 'delete',
  'delete_recurring': 'delete',
  'remove_category': 'delete',
  'delete_budget': 'manage_budgets',
  
  // Budget management
  'set_budget': 'manage_budgets',
  
  // Reports & Analysis
  'show_report': 'view_reports',
  'quick_stats': 'view',
  'analyze_spending': 'view_reports',
  'search_transactions': 'view',
  
  // Recurring management
  'make_expense_recurring': 'add',
  
  // Undo - inherits permission from last action (no specific permission check)
  'undo_last': null,
  
  // Actions that don't require special permissions
  'logout': null,
  'show_help': null,
  'help': null,
  'list_categories': null,
  'show_recurring': null,
  'list_recurring': null,
}

/**
 * Get action description in Portuguese for permission denied messages
 */
export function getActionDescription(action: string): string {
  const descriptions: Record<string, string> = {
    'show_expenses': 'visualizar despesas',
    'list_transactions': 'listar transações',
    'show_budget': 'visualizar orçamentos',
    'list_budgets': 'listar orçamentos',
    'add_expense': 'adicionar despesas',
    'add_income': 'adicionar receitas',
    'add_recurring': 'adicionar pagamentos recorrentes',
    'add_category': 'adicionar categorias',
    'delete_recurring': 'deletar pagamentos recorrentes',
    'set_budget': 'gerenciar orçamentos',
    'show_report': 'visualizar relatórios',
  }
  return descriptions[action] || 'realizar esta ação'
}
