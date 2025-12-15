/**
 * WhatsApp Bot Analytics Event Taxonomy
 *
 * Defines all analytics events for the WhatsApp bot.
 * These events complement the frontend events and provide visibility
 * into WhatsApp-specific user interactions.
 */

export enum WhatsAppAnalyticsEvent {
  // Message Flow Events
  WHATSAPP_MESSAGE_RECEIVED = 'whatsapp_message_received',
  WHATSAPP_MESSAGE_PROCESSED = 'whatsapp_message_processed',
  WHATSAPP_MESSAGE_FAILED = 'whatsapp_message_failed',
  WHATSAPP_GROUP_MESSAGE_RECEIVED = 'whatsapp_group_message_received',

  // OCR Events
  OCR_IMAGE_RECEIVED = 'ocr_image_received',
  OCR_EXTRACTION_STARTED = 'ocr_extraction_started',
  OCR_EXTRACTION_COMPLETED = 'ocr_extraction_completed',
  OCR_EXTRACTION_FAILED = 'ocr_extraction_failed',
  OCR_CONFIRMATION_ACCEPTED = 'ocr_confirmation_accepted',
  OCR_CONFIRMATION_REJECTED = 'ocr_confirmation_rejected',
  OCR_ITEM_CONFIRMED = 'ocr_item_confirmed',
  OCR_ITEM_SKIPPED = 'ocr_item_skipped',

  // NLP Intent Parsing Events
  NLP_LAYER_1_MATCH = 'nlp_layer_1_match', // Explicit command match
  NLP_LAYER_2_HIT = 'nlp_layer_2_hit', // Semantic cache hit
  NLP_LAYER_3_CALL = 'nlp_layer_3_call', // OpenAI LLM call
  NLP_INTENT_PARSED = 'nlp_intent_parsed',
  NLP_INTENT_FAILED = 'nlp_intent_failed',
  NLP_CATEGORY_MATCHED = 'nlp_category_matched',
  NLP_CATEGORY_MATCH_FAILED = 'nlp_category_match_failed',

  // WhatsApp Transaction Events
  WHATSAPP_TRANSACTION_CREATED = 'whatsapp_transaction_created',
  WHATSAPP_TRANSACTION_FAILED = 'whatsapp_transaction_failed',
  WHATSAPP_DUPLICATE_DETECTED = 'whatsapp_duplicate_detected',
  WHATSAPP_TRANSACTION_CORRECTED = 'whatsapp_transaction_corrected',
  TRANSACTION_TYPE_CHANGED = 'transaction_type_changed',

  // Group Management Events
  WHATSAPP_GROUP_AUTHORIZATION_REQUESTED = 'whatsapp_group_authorization_requested',
  WHATSAPP_GROUP_AUTHORIZED = 'whatsapp_group_authorized',
  WHATSAPP_GROUP_REMOVED = 'whatsapp_group_removed',
  WHATSAPP_GROUP_MESSAGE_ATTRIBUTED = 'whatsapp_group_message_attributed',

  // Budget Events (WhatsApp-specific)
  WHATSAPP_BUDGET_CREATED = 'whatsapp_budget_created',
  WHATSAPP_BUDGET_CHECKED = 'whatsapp_budget_checked',
  WHATSAPP_BUDGET_EXCEEDED_ALERT = 'whatsapp_budget_exceeded_alert',

  // Report Events (WhatsApp-specific)
  WHATSAPP_REPORT_REQUESTED = 'whatsapp_report_requested',
  WHATSAPP_REPORT_SENT = 'whatsapp_report_sent',

  // Permission Events
  WHATSAPP_PERMISSION_DENIED = 'whatsapp_permission_denied',
  WHATSAPP_UNAUTHORIZED_ACCESS_ATTEMPT = 'whatsapp_unauthorized_access_attempt',

  // AI Usage Events
  AI_TOKEN_USAGE_TRACKED = 'ai_token_usage_tracked',
  AI_DAILY_LIMIT_EXCEEDED = 'ai_daily_limit_exceeded',
  AI_DAILY_LIMIT_WARNING = 'ai_daily_limit_warning',

  // Onboarding Events (WhatsApp)
  WHATSAPP_ONBOARDING_STARTED = 'whatsapp_onboarding_started',
  WHATSAPP_TUTORIAL_MESSAGE_SENT = 'whatsapp_tutorial_message_sent',
  WHATSAPP_FIRST_TRANSACTION_CREATED = 'whatsapp_first_transaction_created',

  // Engagement Events
  ENGAGEMENT_STATE_TRANSITION = 'engagement_state_transition',
  ENGAGEMENT_STATE_CHANGED = 'engagement_state_changed',
  ENGAGEMENT_GOODBYE_RESPONSE = 'engagement_goodbye_response',
  ENGAGEMENT_UNPROMPTED_RETURN = 'engagement_unprompted_return',
  ENGAGEMENT_PREFERENCE_CHANGED = 'engagement_preference_changed', // Story 6.1

  // Installment/Credit Card Events (Epic 2)
  INSTALLMENT_CREATED = 'installment_created',
  FUTURE_COMMITMENTS_VIEWED = 'future_commitments_viewed',
  FUTURE_COMMITMENTS_EMPTY_STATE_VIEWED = 'future_commitments_empty_state_viewed',
  INSTALLMENT_PAID_OFF_EARLY = 'installment_paid_off_early',
  INSTALLMENT_PAYOFF_FAILED = 'installment_payoff_failed',
  INSTALLMENT_DELETE_DIALOG_OPENED = 'installment_delete_dialog_opened',
  INSTALLMENT_DELETED = 'installment_deleted',
  INSTALLMENT_DELETE_FAILED = 'installment_delete_failed',
  INSTALLMENT_DELETE_CANCELLED = 'installment_delete_cancelled',

  // Installment Payment Linking Events
  INSTALLMENT_PAYMENT_LINKED_AUTO = 'installment_payment_linked_auto',
  INSTALLMENT_PAYMENT_MARKED_PAID = 'installment_payment_marked_paid',

  // Installment Transaction Creation Events (Epic 2 - Auto-create transactions)
  INSTALLMENT_TRANSACTION_CREATED = 'installment_transaction_created',
  INSTALLMENT_TRANSACTION_CREATION_FAILED = 'installment_transaction_creation_failed',
  INSTALLMENT_ALL_TRANSACTIONS_CREATED = 'installment_all_transactions_created',

  // Statement Reminder Events (Epic 3 Story 3.4)
  STATEMENT_REMINDER_SENT = 'statement_reminder_sent',
  STATEMENT_REMINDER_FAILED = 'statement_reminder_failed',
  STATEMENT_REMINDER_JOB_COMPLETED = 'statement_reminder_job_completed',

  // Statement Summary Events (Epic 3 Story 3.5)
  STATEMENT_SUMMARY_VIEWED = 'statement_summary_viewed',

  // Payment Reminder Events (Epic 4 Story 4.2)
  PAYMENT_REMINDER_SENT = 'payment_reminder_sent',
  PAYMENT_REMINDER_FAILED = 'payment_reminder_failed',
  PAYMENT_REMINDER_JOB_COMPLETED = 'payment_reminder_job_completed',

  // Auto-Payment Transaction Events (Epic 4 Story 4.3)
  AUTO_PAYMENT_CREATED = 'auto_payment_created',
  AUTO_PAYMENT_CREATION_FAILED = 'auto_payment_creation_failed',
  AUTO_PAYMENT_JOB_COMPLETED = 'auto_payment_job_completed',
}

/**
 * Analytics Property Names
 *
 * Standardized property names for event tracking.
 */
export enum WhatsAppAnalyticsProperty {
  // Message properties
  MESSAGE_TYPE = 'message_type', // text, image, video, etc.
  IS_GROUP_MESSAGE = 'is_group_message',
  GROUP_JID = 'group_jid',
  GROUP_NAME = 'group_name',
  MESSAGE_LENGTH = 'message_length',

  // User properties
  USER_ID = 'user_id',
  PHONE_NUMBER_HASH = 'phone_number_hash', // Hashed for privacy
  USER_LOCALE = 'user_locale',

  // Intent parsing properties
  INTENT_LAYER = 'intent_layer', // 1 (explicit), 2 (cache), 3 (llm)
  INTENT_TYPE = 'intent_type', // add_expense, view_budget, etc.
  INTENT_CONFIDENCE = 'intent_confidence',
  CACHE_HIT = 'cache_hit',
  SIMILARITY_SCORE = 'similarity_score',

  // NLP/AI properties
  TOKENS_USED = 'tokens_used',
  OPENAI_MODEL = 'openai_model',
  API_COST = 'api_cost',
  PROCESSING_TIME_MS = 'processing_time_ms',

  // OCR properties
  OCR_ENGINE = 'ocr_engine',
  OCR_CONFIDENCE = 'ocr_confidence',
  EXTRACTION_COUNT = 'extraction_count', // Number of items extracted
  IMAGE_SIZE_KB = 'image_size_kb',

  // Transaction properties
  TRANSACTION_ID = 'transaction_id',
  TRANSACTION_AMOUNT = 'transaction_amount',
  TRANSACTION_TYPE = 'transaction_type', // expense, income
  TRANSACTION_SOURCE = 'transaction_source', // manual, ocr
  CATEGORY_ID = 'category_id',
  CATEGORY_NAME = 'category_name',
  CATEGORY_MATCHING_METHOD = 'category_matching_method', // exact, semantic, llm
  PAYMENT_METHOD_ID = 'payment_method_id',

  // Budget properties
  BUDGET_ID = 'budget_id',
  BUDGET_AMOUNT = 'budget_amount',
  CURRENT_SPENDING = 'current_spending',
  BUDGET_PERCENTAGE_USED = 'budget_percentage_used',

  // Error properties
  ERROR_TYPE = 'error_type',
  ERROR_MESSAGE = 'error_message',
  ERROR_CODE = 'error_code',

  // Permission properties
  PERMISSION_TYPE = 'permission_type', // can_add, can_view, etc.
  DENIED_ACTION = 'denied_action',
}

/**
 * Type-safe event properties
 */
export type EventProperties = Partial<Record<WhatsAppAnalyticsProperty | string, any>>
