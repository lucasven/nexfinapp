/**
 * Admin Server Actions
 *
 * This module provides administrative functionality for:
 * - User management
 * - Beta signups
 * - AI usage tracking
 * - Category analytics
 * - OCR/NLP parsing stats
 * - Intent classification analytics
 *
 * All exports require admin authorization via verifyAdmin().
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 */

// Auth utilities
export { checkIsAdmin, verifyAdmin } from "./auth"

// AI usage and system overview
export {
  getSystemOverview,
  getAIUsagePerUser,
  updateUserDailyLimit,
  setAdminOverride,
} from "./ai-usage"

// Beta signups management
export {
  getAllBetaSignups,
  approveBetaSignup,
  rejectBetaSignup,
  resendBetaInvitation,
} from "./beta-signups"

// User management
export {
  getAllUsers,
  getUserDetails,
  deleteUser,
} from "./users"

// Category analytics
export {
  getCategoryMatchingStats,
  getCorrectionsByCategory,
  getCorrectionFlows,
  getLowConfidenceMatches,
  approveCategoryMatch,
  rejectCategoryMatch,
  getMerchantMappings,
  createMerchantMapping,
  updateMerchantMapping,
  deleteMerchantMapping,
  getCategorySynonyms,
  createCategorySynonym,
  deleteCategorySynonym,
  getCorrectionRateTrend,
  getMatchTypeDistribution,
} from "./category-analytics"

// OCR and NLP stats
export {
  getOCRMatchingStats,
  getNLPStrategyPerformance,
  getCacheHitRateStats,
  getMerchantRecognitionStats,
  getPatternLearningQuality,
  getOCRProcessingTrend,
  getStrategyDistribution,
  getRecentOCRErrors,
} from "./ocr-nlp-stats"

// Intent analytics
export {
  getIntentDistribution,
  getEntityExtractionPatterns,
  getCommandCoverage,
  getMisclassifiedIntents,
  getIntentCacheEffectiveness,
  getRetryPatterns,
} from "./intent-analytics"
