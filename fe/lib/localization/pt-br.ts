import type { Messages, FormatHelpers } from './types'

export const messages: Messages = {
  common: {
    cancel: 'Cancelar',
    save: 'Salvar',
    add: 'Adicionar',
    edit: 'Editar',
    delete: 'Excluir',
    update: 'Atualizar',
    loading: 'Carregando...',
    saving: 'Salvando...',
    select: 'Selecionar',
    optional: 'Opcional',
    required: 'Obrigatório',
  },

  nav: {
    home: 'Início',
    reports: 'Relatórios',
    budgets: 'Orçamentos',
    categories: 'Categorias',
    recurring: 'Recorrentes',
    profile: 'Perfil',
    signOut: 'Sair',
  },

  home: {
    title: 'Controle de Despesas',
    subtitle: 'Gerencie suas finanças com facilidade',
    addTransaction: 'Adicionar Transação',
  },

  balance: {
    totalBalance: 'Saldo Total',
    currentBalance: 'Saldo atual',
    income: 'Receitas',
    totalIncome: 'Total de receitas',
    expenses: 'Despesas',
    totalExpenses: 'Total de despesas',
  },

  transaction: {
    title: 'Transação',
    addTitle: 'Adicionar Transação',
    editTitle: 'Editar Transação',
    addDescription: 'Adicione uma nova transação de receita ou despesa.',
    editDescription: 'Atualize os detalhes da sua transação.',
    type: 'Tipo',
    amount: 'Valor',
    category: 'Categoria',
    date: 'Data',
    paymentMethod: 'Método de Pagamento',
    description: 'Descrição',
    selectCategory: 'Selecione uma categoria',
    selectPaymentMethod: 'Selecione o método de pagamento',
    optionalDescription: 'Descrição opcional...',
    income: 'Receita',
    expense: 'Despesa',
    noTransactions: 'Nenhuma transação encontrada',
    addFirstTransaction: 'Adicione sua primeira transação',
  },

  paymentMethods: {
    cash: 'Dinheiro',
    creditCard: 'Cartão de Crédito',
    debitCard: 'Cartão de Débito',
    bankTransfer: 'Transferência Bancária',
    pix: 'PIX',
    other: 'Outro',
  },

  budget: {
    title: 'Orçamento',
    addTitle: 'Adicionar Orçamento',
    editTitle: 'Editar Orçamento',
    addDescription: 'Defina um orçamento para uma categoria.',
    editDescription: 'Atualize seu orçamento.',
    spent: 'Gasto',
    remaining: 'Restante',
    overBudget: 'Acima do orçamento',
    nearLimit: 'Perto do limite',
    onTrack: 'No caminho certo',
    noBudgets: 'Nenhum orçamento encontrado',
    addFirstBudget: 'Adicione seu primeiro orçamento',
    month: 'Mês',
    year: 'Ano',
    amount: 'Valor',
  },

  category: {
    title: 'Categoria',
    addTitle: 'Adicionar Categoria',
    editTitle: 'Editar Categoria',
    name: 'Nome',
    type: 'Tipo',
    icon: 'Ícone',
    color: 'Cor',
    noCategories: 'Nenhuma categoria encontrada',
    addFirstCategory: 'Adicione sua primeira categoria',
  },

  categories: {
    salary: 'Salário',
    freelance: 'Freelance',
    investments: 'Investimentos',
    other: 'Outro',
    food: 'Alimentação',
    transport: 'Transporte',
    housing: 'Moradia',
    utilities: 'Contas',
    entertainment: 'Entretenimento',
    healthcare: 'Saúde',
    education: 'Educação',
    shopping: 'Compras',
  },

  recurring: {
    title: 'Recorrente',
    addTitle: 'Adicionar Recorrente',
    editTitle: 'Editar Recorrente',
    dayOfMonth: 'Dia do Mês',
    isActive: 'Ativo',
    active: 'Ativo',
    inactive: 'Inativo',
    noRecurring: 'Nenhuma transação recorrente encontrada',
    addFirstRecurring: 'Adicione sua primeira transação recorrente',
    upcomingPayments: 'Próximos Pagamentos',
    markAsPaid: 'Marcar como Pago',
    dueDate: 'Data de Vencimento',
  },

  reports: {
    title: 'Relatórios',
    subtitle: 'Visualize e analise suas finanças',
    categoryBreakdown: 'Distribuição por Categoria',
    monthlyTrend: 'Tendência Mensal',
    yearlyOverview: 'Visão Anual',
    selectMonth: 'Selecione o mês',
    selectYear: 'Selecione o ano',
  },

  profile: {
    title: 'Perfil',
    settings: 'Configurações do Perfil',
    displayName: 'Nome de Exibição',
    email: 'E-mail',
    whatsappNumbers: 'Números do WhatsApp',
    authorizedGroups: 'Grupos Autorizados',
    language: 'Idioma',
  },

  auth: {
    login: 'Entrar',
    signup: 'Criar Conta',
    email: 'E-mail',
    password: 'Senha',
    confirmPassword: 'Confirmar Senha',
    forgotPassword: 'Esqueceu a senha?',
    noAccount: 'Não tem uma conta?',
    haveAccount: 'Já tem uma conta?',
    signInWithEmail: 'Entrar com E-mail',
    signUpWithEmail: 'Criar Conta com E-mail',
  },

  months: {
    january: 'Janeiro',
    february: 'Fevereiro',
    march: 'Março',
    april: 'Abril',
    may: 'Maio',
    june: 'Junho',
    july: 'Julho',
    august: 'Agosto',
    september: 'Setembro',
    october: 'Outubro',
    november: 'Novembro',
    december: 'Dezembro',
  },

  table: {
    date: 'Data',
    description: 'Descrição',
    category: 'Categoria',
    paymentMethod: 'Método de Pagamento',
    amount: 'Valor',
    type: 'Tipo',
    actions: 'Ações',
  },
}

export const formatHelpers: FormatHelpers = {
  formatCurrency: (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  },

  formatDate: (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(dateObj)
  },

  formatNumber: (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value)
  },

  getMonthName: (month: number) => {
    const monthNames = [
      messages.months.january,
      messages.months.february,
      messages.months.march,
      messages.months.april,
      messages.months.may,
      messages.months.june,
      messages.months.july,
      messages.months.august,
      messages.months.september,
      messages.months.october,
      messages.months.november,
      messages.months.december,
    ]
    return monthNames[month - 1] || ''
  },

  getCurrencySymbol: () => 'R$',
}
