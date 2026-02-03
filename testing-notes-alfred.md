# NexFinApp - Notas de Teste (Alfred)
**Data:** 2026-02-02
**Conta:** alfredventurella@gmail.com

## Resumo da Sessão de Testes

### ✅ Funcionalidades Testadas
1. **Cadastro via convite beta** - OK (email foi para spam do Gmail)
2. **Onboarding** - OK (skip WhatsApp funcionou)
3. **Criação de cartões de crédito** - OK
   - Nubank (fechamento dia 5, vencimento 15/fev)
   - Itaú (fechamento dia 15, vencimento 22/fev)
4. **Adicionar transação** - OK
   - Despesa R$150 em Alimentação no Nubank
5. **Dashboard** - OK (mostra transação corretamente)
6. **Página de Relatórios** - Parcialmente OK (ver bugs abaixo)

### 🐛 Bugs Encontrados

#### NOVO - P1: Relatórios mostra "Not specified" para método de pagamento
- **ID:** lv-expense-tracker-alf1
- **Descrição:** Transação feita com Nubank aparece como "Not specified" na seção "Métodos de Pagamento" dos Relatórios
- **Dashboard:** Mostra corretamente "Nubank"
- **Relatórios:** Mostra "Not specified"
- **Impacto:** Usuários não conseguem ver qual cartão estão usando mais

### 📋 P0s do Beads - Status

| ID | Título | Testável via Web? | Status |
|----|--------|-------------------|--------|
| 5np | Bot WhatsApp múltiplos cartões | ❌ Não (requer WhatsApp) | Não testado |
| qv1 | Upgrade Baileys v7 | ❌ Não (tarefa de código) | N/A |
| xx5 | Pesquisa config cartão | ❌ Não (tarefa de pesquisa) | N/A |
| pqk | Epic bugs de parcelamento | ⚠️ Parcial | Precisa testar parcelamentos |

### 📌 Próximos Testes Sugeridos
1. Testar parcelamentos (relacionado ao P0 pqk)
2. Adicionar mais transações em categorias diferentes para reproduzir P2 (labels sobrepostos)
3. Testar edição de transações
4. Testar exclusão de transações e cascade delete

### 🔐 Credenciais
Salvas em `~/.credentials/nexfinapp.txt`
