import { Messages, FormatHelpers } from './types.js'

export const messages: Messages = {
  // Welcome and help messages
  welcome: `👋 Olá! Bem-vindo ao NexFinApp!

Sou seu assistente financeiro pessoal. Você pode falar comigo naturalmente!

💰 *Despesas e Receitas*
Fale comigo como você falaria com um amigo:
• "Gastei 50 reais em comida"
• "Recebi salário de 2000"
• "Comprei 30 de transporte ontem"
• "Mostra minhas despesas"

📊 *Orçamentos*
Configure limites para suas categorias:
• "Quero gastar no máximo 500 em comida por mês"
• "Meus orçamentos"
• "Como está meu orçamento?"

🔄 *Despesas Recorrentes*
Para gastos fixos mensais:
• "Todo dia 1 pago 1200 de aluguel"
• "Quais são meus pagamentos recorrentes?"

📈 *Relatórios*
Acompanhe suas finanças:
• "Relatório deste mês"
• "Quanto gastei?"
• "Resumo das minhas despesas"

📸 *Dica Especial*
Envie fotos de SMS bancários ou extratos - eu extraio os dados automaticamente!

💡 Sua sessão é automática pelo WhatsApp. Apenas converse comigo naturalmente!`,

  // Authentication messages
  loginPrompt: '🔐 Para começar, adicione o seu número de whatsapp no seu perfil"',
  loginSuccess: '✅ Login realizado com sucesso! Agora você pode gerenciar suas despesas.',
  loginError: '❌ Erro ao fazer login. Verifique suas credenciais e tente novamente.',
  logoutSuccess: '👋 Você foi desconectado com sucesso!',
  notAuthenticated: '🔒 Você precisa fazer login primeiro. Adicione seu número de whatsapp no seu perfil."',
  sessionExpired: '⏰ Sua sessão expirou. Por favor, faça login novamente.',
  unauthorizedNumber: '🚫 Este número WhatsApp não está autorizado. Entre em contato com o proprietário da conta para adicionar seu número.',
  permissionDenied: (action: string) => `🔒 Você não tem permissão para ${action}. Entre em contato com o proprietário da conta para ajustar suas permissões.`,

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
  recurringAutoPayNotification: (params) =>
    `🤖 *Pagamento Automático Executado*\n\n${params.type} ${params.typeLabel} criada automaticamente:\n\n💰 Valor: ${params.amount}\n📁 ${params.category}${params.description ? `\n📝 ${params.description}` : ''}\n📅 Data: ${params.date}\n🔖 ID: #${params.transactionId}\n\n✅ Esta despesa recorrente foi processada automaticamente.\n\n_Você pode editar ou excluir usando o ID acima._`,

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

  // OCR Confirmation Flow
  ocrPreview: (transactions: Array<{amount: number, category?: string, description?: string, date?: string}>) => {
    let message = `📸 *Transações encontradas na imagem:*\n\n`;
    transactions.forEach((t, i) => {
      const dateStr = t.date ? ` (${t.date})` : '';
      const category = t.category || 'Sem categoria';
      const description = t.description || 'Sem descrição';
      message += `${i + 1}. R$ ${t.amount.toFixed(2)} - ${category} - ${description}${dateStr}\n`;
    });
    message += `\n*Responda:*\n`;
    message += `✅ "sim" ou "confirmar" - Adicionar todas\n`;
    message += `✏️ "editar 2" - Editar transação #2\n`;
    message += `❌ "não" ou "cancelar" - Não adicionar`;
    return message;
  },
  ocrConfirmationPrompt: '💡 *Como deseja proceder?*\n\n✅ "sim" - Confirmar todas\n✏️ "editar N" - Editar transação N\n❌ "não" - Cancelar',
  ocrAllAdded: (count: number, successful: number) => {
    if (successful === count) {
      return `✅ *Sucesso!*\n\nTodas as ${count} transações foram adicionadas.`;
    } else {
      return `⚠️ *Parcialmente concluído*\n\n${successful} de ${count} transações adicionadas.\n${count - successful} falharam.`;
    }
  },
  ocrCancelled: '❌ Transações canceladas. Nenhuma despesa foi adicionada.',
  ocrEditPrompt: (index: number, transaction: {amount: number, category?: string, description?: string}) =>
    `✏️ *Editar transação #${index}*\n\n` +
    `💵 Valor: R$ ${transaction.amount.toFixed(2)}\n` +
    `📁 Categoria: ${transaction.category || 'Sem categoria'}\n` +
    `📝 Descrição: ${transaction.description || 'Sem descrição'}\n\n` +
    `*Responda com o que deseja mudar:*\n` +
    `• "categoria: Alimentação" - Alterar categoria\n` +
    `• "valor: 50" - Alterar valor\n` +
    `• "descrição: Mercado" - Alterar descrição\n` +
    `• "cancelar" - Voltar sem mudar`,
  ocrEditSuccess: (index: number) => `✅ Transação #${index} atualizada!\n\nResponda "sim" para confirmar todas ou "editar N" para editar outra.`,
  ocrTimeout: '⏰ Tempo esgotado. As transações extraídas da imagem foram descartadas. Envie a imagem novamente se desejar.',
  ocrNoPending: '❌ Não há transações pendentes de confirmação. Envie uma imagem para começar.',
  ocrInvalidTransactionNumber: (max: number) => `❌ Número de transação inválido. Use um número entre 1 e ${max}.`,

  // Settings messages
  ocrSettingUpdated: (autoAdd: boolean) =>
    autoAdd
      ? '✅ *OCR configurado para adicionar automaticamente*\n\n📸 Agora quando você enviar uma foto de recibo, as transações serão adicionadas imediatamente sem confirmação.\n\n💡 Para voltar ao modo de confirmação, use: /settings ocr confirmar'
      : '✅ *OCR configurado para sempre confirmar*\n\n📸 Agora quando você enviar uma foto de recibo, você verá uma prévia e poderá confirmar ou cancelar antes de adicionar.\n\n💡 Para adicionar automaticamente, use: /settings ocr auto',
  ocrSettingCurrent: (autoAdd: boolean) =>
    `⚙️ *Configuração atual de OCR:* ${autoAdd ? '🚀 Adicionar automaticamente' : '✋ Sempre confirmar'}\n\n` +
    `📸 Quando você envia uma foto de recibo:\n` +
    (autoAdd
      ? `✅ As transações são adicionadas imediatamente\n\n💡 Para ativar confirmação: /settings ocr confirmar`
      : `✅ Você vê uma prévia e pode confirmar/cancelar\n\n💡 Para adicionar automaticamente: /settings ocr auto`),

  // Error messages
  unknownCommand: '❓ Desculpe, não entendi. Digite "ajuda" para ver os comandos disponíveis.',
  aiLimitExceeded: '⚠️ Você atingiu o limite diário de uso de IA. Use comandos explícitos como: /add 50 comida',
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

  // NEW: Transaction Management
  transactionDeleted: (id: string) => `✅ Transação ${id} deletada com sucesso.`,
  transactionEdited: (id: string, field: string) => `✅ Transação ${id} atualizada: ${field} modificado.`,
  transactionDetails: (id: string, amount: number, category: string, date: string) => 
    `📋 Detalhes da transação ${id}:\n\n💵 Valor: R$ ${amount.toFixed(2)}\n📁 Categoria: ${category}\n📅 Data: ${date}`,
  undoSuccess: '↩️ Ação desfeita com sucesso!',
  undoNotAvailable: '❌ Não há ações recentes para desfazer.',

  // NEW: Category Management
  categoryRemoved: (name: string) => `✅ Categoria "${name}" removida com sucesso.`,
  categoryInUse: (name: string, count: number) => 
    `⚠️ A categoria "${name}" está sendo usada em ${count} transaç${count === 1 ? 'ão' : 'ões'}. Remova ou reclassifique as transações primeiro.`,
  categoryNotFound: (name: string) => `❌ Categoria "${name}" não encontrada.`,
  cannotDeleteDefaultCategory: '❌ Não é possível deletar categorias padrão do sistema.',

  // NEW: Recurring Management
  recurringEdited: (name: string) => `✅ Pagamento recorrente "${name}" atualizado com sucesso.`,
  expenseConvertedToRecurring: (id: string, day: number) => 
    `✅ Transação ${id} convertida em pagamento recorrente para todo dia ${day}.`,
  recurringNotFound: (name: string) => `❌ Pagamento recorrente "${name}" não encontrado.`,

  // NEW: Budget Management
  budgetDeleted: (category: string) => `✅ Orçamento da categoria "${category}" removido com sucesso.`,
  budgetNotFound: (category: string) => `❌ Orçamento para "${category}" não encontrado.`,

  // NEW: Analysis & Search
  analysisResult: '📊 Análise Financeira:\n\n',
  quickStatsHeader: (period: string) => `📈 Resumo - ${period}:\n\n`,
  searchNoResults: '❌ Nenhuma transação encontrada com esses critérios.',

  // Confirmation messages
  confirmYes: ['sim', 's', 'yes', 'y', 'confirmar', 'ok'],
  confirmNo: ['não', 'nao', 'n', 'no', 'cancelar'],
  
  // Date keywords
  dateKeywords: {
    today: ['hoje', 'hj'],
    yesterday: ['ontem'],
    thisMonth: ['este mês', 'esse mês', 'mês atual'],
    lastMonth: ['mês passado', 'último mês']
  },
  
  // Command help texts
  commandHelp: {
    add: `
(use linguagem natural, adicionar/gastei e outros funcionam)
Adicionar/Gastei <valor> <categoria> [data] [descrição] [método_pagamento]

Exemplos:
Adicionar (ou gastei) 50 em comida
Gastei 30 em transporte em 15/10
Gastei 100 no mercado ontem no cartão
Gastei 25,50 na farmácia em remédios no pix
    `,
    budget: `
Definir Orçamento de <valor> para <categoria> 

Exemplos:
Definir orçamento de 500 em mercado
Definir orçamento de 300 em transporte
Definir orçamento de 1000 para lazer
    `,
    recurring: `
Cadastrar gasto recorrente <nome> <valor> dia <dia> na categoria <categoria>

Exemplos:
Gasto recorrente aluguel 1200 dia 5 em moradia pago em dinheiro
Entrada recorrente salario 5000 dia 1
Gasto recorrente em academia 80 reais dia 15 
    `,
    report: `
Mostrar gastos de [periodo] para [categoria]

Exemplos:
Mostrar gastos - usa o padrão do mês atual
Mostrar gastos desse mês
Mostrar gastos de janeiro de 2024
Mostrar gastos em comida
    `,
    list: `
Listar [tipo]

Tipos: categories, recurring, budgets, transactions

Exemplos:
Listar (retorna resumo mensal)
Listar cateorias
Listar gastos recorrentes
Listar orçamentos
Listar transacoes
    `,
    categories: `
[ação] categoria [nome]

Ações: add, remove

Exemplos:
listar categorias
adicionar categoria casa e decoração
remover categoria transporte
    `,
    help: `
Comandos disponíveis:

Adicionar despesa - "Gastei 50 em comida"
Definir orçamento - "Definir orçamento de 50 para mercado"
Adicionar despesa recorrente - "Adicionar despesa recorrente de 19,9 em netflix na categoria assinaturas"
Ver relatórios - "Quanto gastei esse mês?" ou "Quanto gastei esse mês em mercado?"
Listar itens - "Listar gastos" ou "Listar Transaçoes"
Gerenciar categorias - "Listar categorias" ou "Adicionar categoria assinaturas"
Mostrar esta ajuda - "Ajuda"
    `
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

export const formatHelpers: FormatHelpers = {
  formatCurrency,
  formatDate,
  getMonthName
}

