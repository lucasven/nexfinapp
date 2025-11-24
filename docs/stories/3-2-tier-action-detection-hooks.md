# Story 3.2: Tier Action Detection Hooks

**Status:** done

---

## Story

**As a** system,
**I want** existing handlers to report tier-relevant actions,
**So that** tier progress is tracked automatically.

---

## Acceptance Criteria

7. **AC-3.2.1:** Adding expense calls `recordAction(userId, 'add_expense')`
8. **AC-3.2.2:** Deleting expense calls `recordAction(userId, 'delete_expense')`
9. **AC-3.2.3:** Adding category calls `recordAction(userId, 'add_category')`
10. **AC-3.2.4:** Editing category calls `recordAction(userId, 'edit_category')`
11. **AC-3.2.5:** Setting budget calls `recordAction(userId, 'set_budget')`
12. **AC-3.2.6:** Adding recurring expense calls `recordAction(userId, 'add_recurring')`
13. **AC-3.2.7:** Listing categories calls `recordAction(userId, 'list_categories')`
14. **AC-3.2.8:** Viewing report calls `recordAction(userId, 'view_report')`
15. **AC-3.2.9:** Tier tracking does NOT block or slow down primary handler response

---

## Tasks / Subtasks

- [ ] **Task 1: Add hook to expense handler - add** (AC: 7)
  - [ ] Locate expense creation success point in handlers/transactions/expenses.ts
  - [ ] Add async recordAction call (fire-and-forget)
  - [ ] Ensure error in tracking doesn't fail expense creation

- [ ] **Task 2: Add hook to expense handler - delete** (AC: 8)
  - [ ] Locate expense deletion success point
  - [ ] Add async recordAction call

- [ ] **Task 3: Add hook to category handler - add** (AC: 9)
  - [ ] Locate category creation in handlers/categories/
  - [ ] Add async recordAction call

- [ ] **Task 4: Add hook to category handler - edit** (AC: 10)
  - [ ] Locate category edit success point
  - [ ] Add async recordAction call

- [ ] **Task 5: Add hook to budget handler** (AC: 11)
  - [ ] Locate budget set/create in handlers/budgets/
  - [ ] Add async recordAction call

- [ ] **Task 6: Add hook to recurring handler** (AC: 12)
  - [ ] Locate recurring expense creation in handlers/recurring/
  - [ ] Add async recordAction call

- [ ] **Task 7: Add hook to category list handler** (AC: 13)
  - [ ] Locate category listing response
  - [ ] Add async recordAction call

- [ ] **Task 8: Add hook to reports handler** (AC: 14)
  - [ ] Locate report generation in handlers/reports/
  - [ ] Add async recordAction call

- [ ] **Task 9: Implement non-blocking pattern** (AC: 15)
  - [ ] Create helper function for fire-and-forget tracking
  - [ ] Ensure all hooks use this pattern
  - [ ] Add error logging without throwing

- [ ] **Task 10: Write integration tests** (AC: all)
  - [ ] Test each handler calls recordAction
  - [ ] Test handler returns before tracking completes
  - [ ] Test handler succeeds even if tracking fails

---

## Dev Notes

### Architecture Alignment

Modifies existing handlers to call tier tracking service.

### Non-Blocking Pattern

```typescript
// Helper function for all hooks
function trackTierAction(userId: string, action: TierAction): void {
  recordAction(userId, action).catch(err => {
    logger.error('Tier tracking failed', { userId, action, error: err })
    // Don't throw - primary handler should still succeed
  })
}

// Usage in handler
const expense = await createExpense(...)
trackTierAction(userId, 'add_expense')  // Fire and forget
return formatExpenseResponse(expense)   // Return immediately
```

### Handler Files to Modify

| File | Actions |
|------|---------|
| `handlers/transactions/expenses.ts` | add_expense, delete_expense |
| `handlers/categories/categories.ts` | add_category, edit_category, list_categories |
| `handlers/budgets/budgets.ts` | set_budget |
| `handlers/recurring/recurring.ts` | add_recurring |
| `handlers/reports/reports.ts` | view_report |

### Risk Mitigation

- Test each handler thoroughly after modification
- Use try-catch wrapper to prevent tracking errors from breaking handlers
- Add logging for debugging

### References

- [Source: docs/stories/tech-spec-epic-3.md#Existing-Handler-Integration-Points]
- [Source: docs/architecture.md#Integration-Points]

---

## Dev Agent Record

### Context Reference

- `docs/stories/tech-spec-epic-3.md` (epic tech spec)
- `docs/stories/3-1-tier-progress-tracking-service.md` (prerequisite)

### Prerequisites

- Story 3.1 complete (tier-tracker.ts with recordAction)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-22 | BMad Master | Initial draft |
