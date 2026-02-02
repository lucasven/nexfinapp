import { getSupabaseClient } from './database/supabase-client.js';

/**
 * Category matching service with fuzzy matching, normalization, and confidence scoring
 */

interface CategoryMatch {
  id: string;
  name: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'synonym' | 'ai' | 'fallback';
}

interface MatchOptions {
  userId: string;
  type?: 'income' | 'expense';
  threshold?: number; // minimum confidence (0-1)
  includeCustom?: boolean;
}

/**
 * Normalize Portuguese text for better matching
 * - Removes accents
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes special characters
 */
export function normalizePortugueseText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, '') // Remove special chars
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
function similarityRatio(str1: string, str2: string): number {
  const normalized1 = normalizePortugueseText(str1);
  const normalized2 = normalizePortugueseText(str2);

  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - distance / maxLen;
}

/**
 * Check if text contains category keywords or synonyms
 */
function containsKeyword(text: string, keywords: string[]): boolean {
  const normalizedText = normalizePortugueseText(text);
  return keywords.some(keyword => {
    const normalizedKeyword = normalizePortugueseText(keyword);
    return normalizedText.includes(normalizedKeyword);
  });
}

/**
 * Built-in category synonyms and keywords for Portuguese
 * Supports both Portuguese (primary) and English (legacy) category names
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Alimentação (Food & Dining)
  'alimentação': [
    'comida', 'restaurante', 'lanchonete', 'padaria', 'mercado', 'supermercado',
    'ifood', 'rappi', 'uber eats', 'cafe', 'cafeteria', 'bar', 'pizzaria',
    'churrascaria', 'delivery', 'lanches', 'alimentos', 'feira', 'açougue',
    'hortifruti', 'mercearia', 'refeição', 'refeicao', 'almoco', 'almoço',
    'jantar', 'café da manhã', 'cafe da manha', 'lanche', 'food', 'dining'
  ],
  'alimentacao': [
    'comida', 'restaurante', 'lanchonete', 'padaria', 'mercado', 'supermercado',
    'ifood', 'rappi', 'uber eats', 'cafe', 'cafeteria', 'bar', 'pizzaria',
    'churrascaria', 'delivery', 'lanches', 'alimentos', 'feira', 'açougue',
    'hortifruti', 'mercearia', 'refeição', 'refeicao', 'almoco', 'almoço',
    'jantar', 'café da manhã', 'cafe da manha', 'lanche', 'food', 'dining'
  ],
  // Legacy English names
  'food & dining': [
    'comida', 'restaurante', 'lanchonete', 'padaria', 'mercado', 'supermercado',
    'ifood', 'rappi', 'uber eats', 'cafe', 'cafeteria', 'bar', 'pizzaria'
  ],
  'comida': [
    'comida', 'restaurante', 'lanchonete', 'padaria', 'mercado', 'supermercado',
    'ifood', 'rappi', 'uber eats'
  ],

  // Transporte (Transportation)
  'transporte': [
    'transporte', 'uber', 'taxi', 'combustível', 'combustivel', 'gasolina',
    'posto', 'metro', 'metrô', 'ônibus', 'onibus', 'trem', 'estacionamento',
    '99', 'cabify', 'bus', 'passagem', 'pedágio', 'pedagio', 'moto',
    'carro', 'mobilidade', 'transportation'
  ],
  'transportation': [
    'transporte', 'uber', 'taxi', 'combustível', 'combustivel', 'gasolina',
    'posto', 'metro', 'metrô', 'ônibus', 'onibus'
  ],

  // Compras (Shopping)
  'compras': [
    'compras', 'shopping', 'magazine', 'lojas', 'americanas', 'mercado livre',
    'shopee', 'amazon', 'aliexpress', 'shein', 'loja', 'varejo', 'outlet',
    'mall', 'renner', 'riachuelo', 'zara', 'c&a'
  ],
  'shopping': [
    'compras', 'shopping', 'magazine', 'lojas', 'americanas', 'mercado livre',
    'shopee', 'amazon'
  ],

  // Entretenimento (Entertainment)
  'entretenimento': [
    'entretenimento', 'cinema', 'teatro', 'show', 'netflix', 'spotify',
    'disney', 'prime video', 'hbo', 'youtube', 'streaming', 'jogos', 'games',
    'diversão', 'diversao', 'lazer', 'balada', 'festa', 'parque', 'entertainment'
  ],
  'entertainment': [
    'entretenimento', 'cinema', 'teatro', 'show', 'netflix', 'spotify',
    'disney', 'prime video', 'hbo', 'youtube'
  ],

  // Contas e Utilidades (Bills & Utilities)
  'contas e utilidades': [
    'contas', 'energia', 'luz', 'água', 'agua', 'internet', 'telefone',
    'celular', 'vivo', 'tim', 'claro', 'oi', 'gás', 'gas', 'enel', 'cemig',
    'copasa', 'sabesp', 'utilidades', 'serviços', 'servicos', 'bills', 'utilities'
  ],
  'bills & utilities': [
    'contas', 'energia', 'luz', 'água', 'agua', 'internet', 'telefone',
    'celular', 'vivo', 'tim', 'claro', 'oi'
  ],
  'contas': [
    'contas', 'energia', 'luz', 'água', 'agua', 'internet', 'telefone',
    'celular', 'vivo', 'tim', 'claro', 'oi', 'gás', 'gas'
  ],

  // Saúde (Healthcare)
  'saúde': [
    'saúde', 'saude', 'farmácia', 'farmacia', 'drogaria', 'hospital',
    'clínica', 'clinica', 'médico', 'medico', 'dentista', 'exames',
    'laboratório', 'laboratorio', 'remédio', 'remedio', 'consulta',
    'droga raia', 'drogasil', 'pague menos', 'unimed', 'amil', 'healthcare'
  ],
  'saude': [
    'saúde', 'saude', 'farmácia', 'farmacia', 'drogaria', 'hospital',
    'clínica', 'clinica', 'médico', 'medico', 'dentista'
  ],
  'healthcare': [
    'saúde', 'saude', 'farmácia', 'farmacia', 'drogaria', 'hospital',
    'clínica', 'clinica'
  ],

  // Educação (Education)
  'educação': [
    'educação', 'educacao', 'escola', 'faculdade', 'universidade', 'curso',
    'livro', 'livros', 'livraria', 'material escolar', 'aula', 'professor',
    'treinamento', 'capacitação', 'capacitacao', 'udemy', 'coursera',
    'estudo', 'estudos', 'education'
  ],
  'educacao': [
    'educação', 'educacao', 'escola', 'faculdade', 'universidade', 'curso',
    'livro', 'livros', 'livraria'
  ],
  'education': [
    'educação', 'educacao', 'escola', 'faculdade', 'universidade', 'curso'
  ],

  // Aluguel (Rent)
  'aluguel': [
    'aluguel', 'moradia', 'imóvel', 'imovel', 'condomínio', 'condominio',
    'iptu', 'habitação', 'habitacao', 'casa', 'apartamento', 'rent'
  ],
  'rent': [
    'aluguel', 'moradia', 'imóvel', 'imovel', 'condomínio', 'condominio'
  ],

  // Assinaturas (Subscriptions)
  'assinaturas': [
    'assinatura', 'assinaturas', 'mensalidade', 'recorrente', 'subscription',
    'plano', 'renovação', 'renovacao'
  ],
  'subscriptions': [
    'assinatura', 'assinaturas', 'mensalidade', 'recorrente', 'subscription'
  ],

  // Outros Gastos (Other Expense)
  'outros gastos': [
    'outros', 'diversos', 'variados', 'other', 'expense'
  ],
  'other expense': [
    'outros', 'outros gastos', 'diversos'
  ],

  // Salário (Salary)
  'salário': [
    'salário', 'salario', 'ordenado', 'vencimento', 'salary', 'wage'
  ],
  'salario': [
    'salário', 'salario', 'ordenado', 'vencimento'
  ],
  'salary': [
    'salário', 'salario'
  ],

  // Investimentos (Investments)
  'investimentos': [
    'investimento', 'investimentos', 'aplicação', 'aplicacao', 'renda fixa',
    'ações', 'acoes', 'fundos', 'investments'
  ],
  'investments': [
    'investimento', 'investimentos', 'aplicação', 'aplicacao'
  ],

  // Outras Receitas (Other Income)
  'outras receitas': [
    'receita', 'receitas', 'renda', 'ganho', 'income', 'other'
  ],
  'other income': [
    'receita', 'receitas', 'renda', 'outras receitas'
  ],
};

/**
 * Find best matching category using multiple strategies
 */
export async function findBestCategoryMatch(
  categoryName: string,
  options: MatchOptions
): Promise<CategoryMatch | null> {
  const { userId, type = 'expense', threshold = 0.6 } = options;

  // Fetch visible categories for the user (respects hidden defaults)
  const supabase = getSupabaseClient();
  const { data: allCategories, error } = await supabase
    .rpc('get_visible_categories', { p_user_id: userId });

  if (error || !allCategories || allCategories.length === 0) {
    return null;
  }

  // Filter by type
  const categories = allCategories.filter((c: any) => c.type === type);

  if (categories.length === 0) {
    return null;
  }

  const normalizedInput = normalizePortugueseText(categoryName);
  const matches: CategoryMatch[] = [];

  // Strategy 1: Exact match (case-insensitive, accent-insensitive)
  for (const category of categories) {
    const normalizedCategory = normalizePortugueseText(category.name);

    if (normalizedCategory === normalizedInput) {
      matches.push({
        id: category.id,
        name: category.name,
        confidence: 1.0,
        matchType: 'exact',
      });
    }
  }

  // If exact match found, return it (prefer custom categories)
  if (matches.length > 0) {
    const customMatch = matches.find(m =>
      categories.find((c: any) => c.id === m.id)?.is_custom
    );
    return customMatch || matches[0];
  }

  // Strategy 2: Fuzzy string matching
  for (const category of categories) {
    const similarity = similarityRatio(categoryName, category.name);

    if (similarity >= threshold) {
      matches.push({
        id: category.id,
        name: category.name,
        confidence: similarity,
        matchType: 'fuzzy',
      });
    }
  }

  // Strategy 3: Keyword/synonym matching
  for (const category of categories) {
    const normalizedCategory = normalizePortugueseText(category.name);
    const keywords = CATEGORY_KEYWORDS[normalizedCategory] || CATEGORY_KEYWORDS[category.name.toLowerCase()];

    if (keywords && containsKeyword(categoryName, keywords)) {
      // Check if not already matched with better confidence
      const existingMatch = matches.find(m => m.id === category.id);
      if (!existingMatch || existingMatch.confidence < 0.85) {
        matches.push({
          id: category.id,
          name: category.name,
          confidence: 0.85,
          matchType: 'synonym',
        });
      }
    }

    // Also check if category name is contained in the input (or vice versa)
    if (normalizedInput.includes(normalizedCategory) || normalizedCategory.includes(normalizedInput)) {
      const existingMatch = matches.find(m => m.id === category.id);
      if (!existingMatch || existingMatch.confidence < 0.8) {
        matches.push({
          id: category.id,
          name: category.name,
          confidence: 0.8,
          matchType: 'fuzzy',
        });
      }
    }
  }

  // Sort by confidence (descending) and prefer custom categories
  matches.sort((a, b) => {
    const aIsCustom = categories.find((c: any) => c.id === a.id)?.is_custom || false;
    const bIsCustom = categories.find((c: any) => c.id === b.id)?.is_custom || false;

    if (aIsCustom && !bIsCustom) return -1;
    if (!aIsCustom && bIsCustom) return 1;

    return b.confidence - a.confidence;
  });

  return matches.length > 0 ? matches[0] : null;
}

/**
 * Find category match with fallback to "Other"
 */
export async function findCategoryWithFallback(
  categoryName: string | undefined,
  options: MatchOptions
): Promise<CategoryMatch> {
  const { type = 'expense' } = options;

  if (!categoryName) {
    return getFallbackCategory(options.userId, type);
  }

  const match = await findBestCategoryMatch(categoryName, options);

  if (match && match.confidence >= (options.threshold || 0.6)) {
    return match;
  }

  // No good match found, return fallback
  return getFallbackCategory(options.userId, type);
}

/**
 * Get fallback "Other" category
 */
async function getFallbackCategory(_userId: string, type: 'income' | 'expense'): Promise<CategoryMatch> {
  const fallbackName = type === 'income' ? 'Outras Receitas' : 'Outros Gastos';
  const fallbackNameEnglish = type === 'income' ? 'Other Income' : 'Other Expense';

  const supabase = getSupabaseClient();

  // Try Portuguese name first, then English for backward compatibility
  let { data: fallbackCategory } = await supabase
    .from('categories')
    .select('id, name')
    .eq('type', type)
    .or(`name.ilike.${fallbackName},name.ilike.${fallbackNameEnglish}`)
    .limit(1)
    .single();

  if (fallbackCategory) {
    return {
      id: fallbackCategory.id,
      name: fallbackCategory.name,
      confidence: 0.5,
      matchType: 'fallback',
    };
  }

  // Should not happen, but return a placeholder
  throw new Error(`Fallback category "${fallbackName}" not found`);
}

/**
 * Guess category from transaction description using keywords
 * Enhanced version of the OCR function with better matching
 */
export async function guessCategoryFromDescription(
  description: string,
  userId: string,
  type: 'income' | 'expense' = 'expense'
): Promise<CategoryMatch | null> {
  const normalizedDesc = normalizePortugueseText(description);

  // Fetch visible categories for the user (respects hidden defaults)
  const supabase = getSupabaseClient();
  const { data: allCategories } = await supabase
    .rpc('get_visible_categories', { p_user_id: userId });

  const categories = allCategories?.filter((c: any) => c.type === type);

  if (!categories || categories.length === 0) {
    return null;
  }

  const matches: CategoryMatch[] = [];

  // Check each category's keywords
  for (const category of categories) {
    const normalizedCategoryName = normalizePortugueseText(category.name);
    const keywords = CATEGORY_KEYWORDS[normalizedCategoryName] || CATEGORY_KEYWORDS[category.name.toLowerCase()];

    if (keywords) {
      for (const keyword of keywords) {
        if (normalizedDesc.includes(normalizePortugueseText(keyword))) {
          matches.push({
            id: category.id,
            name: category.name,
            confidence: 0.8,
            matchType: 'synonym',
          });
          break; // Found match for this category, move to next
        }
      }
    }
  }

  // Prefer custom categories
  matches.sort((a, b) => {
    const aIsCustom = categories.find((c: any) => c.id === a.id)?.is_custom || false;
    const bIsCustom = categories.find((c: any) => c.id === b.id)?.is_custom || false;

    if (aIsCustom && !bIsCustom) return -1;
    if (!aIsCustom && bIsCustom) return 1;

    return 0;
  });

  return matches.length > 0 ? matches[0] : null;
}

/**
 * Match multiple category names at once (for batch processing)
 */
export async function batchMatchCategories(
  categoryNames: string[],
  options: MatchOptions
): Promise<Map<string, CategoryMatch>> {
  const results = new Map<string, CategoryMatch>();

  // Process all in parallel
  await Promise.all(
    categoryNames.map(async (name) => {
      const match = await findCategoryWithFallback(name, options);
      results.set(name, match);
    })
  );

  return results;
}
