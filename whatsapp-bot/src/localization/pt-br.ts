export const messages = {
  // Welcome and help messages
  welcome: `👋 Olá! Bem-vindo ao Rastreador de Despesas!

Sou seu assistente para gerenciar suas finanças. Aqui está o que posso fazer:

💰 *Despesas e Receitas*
• "Gastei R$50 em comida"
• "Recebi R$2000 de salário"
• "Adicionar despesa de 30 reais em transporte ontem"
• "Mostrar minhas despesas"

📊 *Orçamentos*
• "Definir orçamento de comida em R$500"
• "Mostrar meus orçamentos"
• "Status do orçamento"

🔄 *Despesas Recorrentes*
• "Adicionar aluguel mensal de R$1200 no dia 1"
• "Mostrar pagamentos recorrentes"

📈 *Relatórios*
• "Relatório deste mês"
• "Resumo de despesas"

📁 *Categorias*
• "Listar categorias"
• "Adicionar categoria Academia"

🔐 *Autenticação*
• "Login: meuemail@example.com senha123"
• "Sair"

Você também pode me enviar fotos de SMS bancários ou extratos!`,

  // Authentication messages
  loginPrompt: '🔐 Para começar, faça login com:\n"Login: seu-email@example.com sua-senha"',
  loginSuccess: '✅ Login realizado com sucesso! Agora você pode gerenciar suas despesas.',
  loginError: '❌ Erro ao fazer login. Verifique suas credenciais e tente novamente.',
  logoutSuccess: '👋 Você foi desconectado com sucesso!',
  notAuthenticated: '🔒 Você precisa fazer login primeiro. Use:\n"Login: seu-email@example.com sua-senha"',
  sessionExpired: '⏰ Sua sessão expirou. Por favor, faça login novamente.',

  // Expense messages
  expenseAdded: (amount: number, category: string, date: string) => 
    `✅ Despesa adicionada!\n💵 Valor: R$ ${amount.toFixed(2)}\n📁 Categoria: ${category}\n📅 Data: ${date}`,
  incomeAdded: (amount: number, category: string, date: string) =>
    `✅ Receita adicionada!\n💰 Valor: R$ ${amount.toFixed(2)}\n📁 Categoria: ${category}\n📅 Data: ${date}`,
  expenseError: '❌ Não consegui adicionar a despesa. Tente novamente.',
  invalidAmount: '❌ Valor inválido. Por favor, use um número válido (ex: R$50 ou 50 reais).',

  // Budget messages
  budgetSet: (category: string, amount: number, month: string) =>
    `✅ Orçamento definido!\n📁 Categoria: ${category}\n💰 Valor: R$ ${amount.toFixed(2)}\n📅 Período: ${month}`,
  budgetError: '❌ Erro ao definir orçamento. Tente novamente.',
  noBudgets: '📊 Você ainda não tem orçamentos definidos.',

  // Recurring messages
  recurringAdded: (amount: number, category: string, day: number) =>
    `✅ Despesa recorrente adicionada!\n💵 Valor: R$ ${amount.toFixed(2)}\n📁 Categoria: ${category}\n📅 Dia do mês: ${day}`,
  recurringError: '❌ Erro ao adicionar despesa recorrente.',
  noRecurring: '🔄 Você não tem despesas recorrentes cadastradas.',

  // Report messages
  reportHeader: (month: string, year: number) => 
    `📈 *Relatório - ${month}/${year}*\n${'='.repeat(30)}`,
  reportSummary: (income: number, expenses: number, balance: number) =>
    `💰 Receitas: R$ ${income.toFixed(2)}\n💸 Despesas: R$ ${expenses.toFixed(2)}\n📊 Saldo: R$ ${balance.toFixed(2)}`,
  noTransactions: '📭 Nenhuma transação encontrada para este período.',

  // Category messages
  categoryList: '📁 *Categorias Disponíveis*:\n',
  categoryAdded: (name: string) => `✅ Categoria "${name}" adicionada com sucesso!`,
  categoryError: '❌ Erro ao adicionar categoria.',

  // OCR messages
  ocrProcessing: '🔍 Analisando imagem... Por favor, aguarde.',
  ocrSuccess: (count: number) => `✅ Encontrei ${count} despesa(s) na imagem:`,
  ocrNoData: '❌ Não consegui extrair dados da imagem. Por favor, adicione a despesa manualmente.',
  ocrError: '❌ Erro ao processar imagem. Tente novamente.',
  confirmOcrExpense: (amount: number, description: string) =>
    `Encontrei:\n💵 R$ ${amount.toFixed(2)}\n📝 ${description}\n\nResponda "sim" para confirmar ou "não" para cancelar.`,

  // Error messages
  unknownCommand: '❓ Desculpe, não entendi. Digite "ajuda" para ver os comandos disponíveis.',
  genericError: '❌ Ocorreu um erro. Por favor, tente novamente.',
  invalidDate: '❌ Data inválida. Use formatos como "hoje", "ontem", "01/12/2024".',
  missingCategory: '❌ Por favor, especifique uma categoria válida.',

  // Group messages
  groupMention: '👋 Olá! Me mencione ou comece com "bot" para usar meus comandos em grupos.',

  // Duplicate Detection Messages
  duplicateBlocked: (reason: string) => `🚫 Transação bloqueada automaticamente!\n\n${reason}\n\n💡 Se não for duplicata, tente novamente com mais detalhes.`,
  duplicateWarning: (reason: string, confidence: number) => `⚠️ Possível duplicata detectada!\n\n${reason}\n\nConfiança: ${confidence}%\n\n💡 Se não for duplicata, confirme digitando "confirmar" ou "sim".`,
  duplicateConfirmed: '✅ Transação confirmada e adicionada!',
  duplicateConfirmationNotFound: '❌ Não encontrei transação pendente. Tente adicionar a despesa novamente.',
  duplicateConfirmationInvalid: '❌ Confirmação não reconhecida. Use "sim", "confirmar" ou "ok" para prosseguir.',

  // Transaction Correction Messages
  correctionTransactionNotFound: (id: string) => `❌ Transação ${id} não encontrada. Verifique o ID e tente novamente.`,
  correctionTransactionDeleted: (id: string) => `✅ Transação ${id} removida com sucesso!`,
  correctionTransactionUpdated: (id: string) => `✅ Transação ${id} atualizada com sucesso!`,
  correctionNoChanges: '❌ Nenhuma alteração especificada. Use "era R$ X" ou "era categoria Y" para especificar as mudanças.',
  correctionInvalidAction: '❌ Tipo de correção não reconhecido. Use "remover", "arrumar" ou "corrigir" seguido do ID da transação.',
  correctionMissingId: '❌ ID da transação não encontrado. Use o ID de 6 caracteres que aparece quando você adiciona uma transação.',

  // Confirmation messages
  confirmYes: ['sim', 's', 'yes', 'y', 'confirmar', 'ok'],
  confirmNo: ['não', 'nao', 'n', 'no', 'cancelar'],
  
  // Date keywords
  dateKeywords: {
    today: ['hoje', 'hj'],
    yesterday: ['ontem'],
    thisMonth: ['este mês', 'esse mês', 'mês atual'],
    lastMonth: ['mês passado', 'último mês']
  }
}

export const formatCurrency = (value: number): string => {
  return `R$ ${value.toFixed(2).replace('.', ',')}`
}

export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

export const getMonthName = (month: number): string => {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]
  return months[month - 1] || ''
}

