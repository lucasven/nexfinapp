/**
 * Analytics Event Taxonomy
 * 
 * Define all analytics events in this file for consistency.
 * Use UPPERCASE_WITH_UNDERSCORE naming convention.
 */

export enum AnalyticsEvent {
  // Authentication Events
  USER_SIGNED_UP = 'user_signed_up',
  USER_LOGGED_IN = 'user_logged_in',
  USER_LOGGED_OUT = 'user_logged_out',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
  PASSWORD_RESET_FAILED = 'password_reset_failed',
  MAGIC_LINK_REQUESTED = 'magic_link_requested',
  MAGIC_LINK_LOGIN_SUCCESS = 'magic_link_login_success',
  MAGIC_LINK_LOGIN_FAILED = 'magic_link_login_failed',
  
  // Transaction Events
  TRANSACTION_CREATED = 'transaction_created',
  TRANSACTION_EDITED = 'transaction_edited',
  TRANSACTION_DELETED = 'transaction_deleted',
  TRANSACTION_DIALOG_OPENED = 'transaction_dialog_opened',
  TRANSACTION_FORM_SUBMITTED = 'transaction_form_submitted',
  
  // Budget Events
  BUDGET_CREATED = 'budget_created',
  BUDGET_UPDATED = 'budget_updated',
  BUDGET_DELETED = 'budget_deleted',
  BUDGET_EXCEEDED = 'budget_exceeded',
  
  // Report Events
  REPORT_VIEWED = 'report_viewed',
  REPORT_DATE_CHANGED = 'report_date_changed',
  REPORT_EXPORTED = 'report_exported',
  
  // Category Events
  CATEGORY_CREATED = 'category_created',
  CATEGORY_EDITED = 'category_edited',
  CATEGORY_DELETED = 'category_deleted',
  
  // Recurring Transaction Events
  RECURRING_CREATED = 'recurring_created',
  RECURRING_UPDATED = 'recurring_updated',
  RECURRING_DELETED = 'recurring_deleted',
  RECURRING_TRANSACTION_CREATED = 'recurring_transaction_created',
  RECURRING_TRANSACTION_UPDATED = 'recurring_transaction_updated',
  RECURRING_TRANSACTION_DELETED = 'recurring_transaction_deleted',
  RECURRING_PAYMENT_PAID = 'recurring_payment_paid',
  RECURRING_PAYMENT_UNPAID = 'recurring_payment_unpaid',

  // Profile Events
  PROFILE_UPDATED = 'profile_updated',
  LOCALE_CHANGED = 'locale_changed',

  // WhatsApp Integration Events
  WHATSAPP_NUMBER_ADDED = 'whatsapp_number_added',
  WHATSAPP_NUMBER_REMOVED = 'whatsapp_number_removed',
  WHATSAPP_GROUP_AUTHORIZED = 'whatsapp_group_authorized',
  WHATSAPP_GROUP_DEACTIVATED = 'whatsapp_group_deactivated',
  WHATSAPP_GROUP_REMOVED = 'whatsapp_group_removed',
  
  // Beta/Landing Events
  BETA_SIGNUP_SUBMITTED = 'beta_signup_submitted',
  LANDING_PAGE_CTA_CLICKED = 'landing_page_cta_clicked',
  
  // Admin Events
  ADMIN_DASHBOARD_VIEWED = 'admin_dashboard_viewed',
  ADMIN_USER_LIMIT_CHANGED = 'admin_user_limit_changed',
  ADMIN_ADMIN_OVERRIDE_TOGGLED = 'admin_admin_override_toggled',
  ADMIN_BETA_APPROVED = 'admin_beta_approved',
  ADMIN_BETA_REJECTED = 'admin_beta_rejected',
  ADMIN_BETA_INVITATION_SENT = 'admin_beta_invitation_sent',
  ADMIN_BETA_INVITATION_FAILED = 'admin_beta_invitation_failed',
  ADMIN_BETA_INVITATION_RESENT = 'admin_beta_invitation_resent',
  ADMIN_USER_DETAILS_VIEWED = 'admin_user_details_viewed',
  ADMIN_USER_DELETED = 'admin_user_deleted',
  
  // User Invitation Events
  USER_ACCEPTED_BETA_INVITATION = 'user_accepted_beta_invitation',

  // Onboarding Events
  ONBOARDING_STARTED = 'onboarding_started',
  ONBOARDING_STEP_COMPLETED = 'onboarding_step_completed',
  ONBOARDING_STEP_SKIPPED = 'onboarding_step_skipped',
  ONBOARDING_COMPLETED = 'onboarding_completed',
  ONBOARDING_SKIPPED = 'onboarding_skipped',
  ONBOARDING_WHATSAPP_ADDED = 'onboarding_whatsapp_added',
  WHATSAPP_GREETING_SENT = 'whatsapp_greeting_sent',
  WHATSAPP_GREETING_FAILED = 'whatsapp_greeting_failed',

  // Tutorial Events
  ONBOARDING_TUTORIAL_STARTED = 'onboarding_tutorial_started',
  ONBOARDING_TUTORIAL_ELEMENT_HIGHLIGHTED = 'onboarding_tutorial_element_highlighted',
  ONBOARDING_TOUR_RESUMED = 'onboarding_tour_resumed',

  // Engagement Preference Events
  ENGAGEMENT_PREFERENCE_CHANGED = 'engagement_preference_changed',
}

/**
 * Analytics Property Names
 * 
 * Define commonly used property names for consistency.
 * Use snake_case naming convention to match PostHog standards.
 */
export enum AnalyticsProperty {
  // Transaction properties
  TRANSACTION_AMOUNT = 'transaction_amount',
  TRANSACTION_TYPE = 'transaction_type',
  TRANSACTION_ID = 'transaction_id',
  
  // Category properties
  CATEGORY_NAME = 'category_name',
  CATEGORY_ID = 'category_id',
  CATEGORY_TYPE = 'category_type',
  
  // Budget properties
  BUDGET_AMOUNT = 'budget_amount',
  BUDGET_MONTH = 'budget_month',
  BUDGET_YEAR = 'budget_year',
  
  // Report properties
  REPORT_TYPE = 'report_type',
  REPORT_START_DATE = 'report_start_date',
  REPORT_END_DATE = 'report_end_date',
  
  // User properties
  USER_ID = 'user_id',
  USER_EMAIL = 'user_email',
  
  // WhatsApp properties
  WHATSAPP_NUMBER = 'whatsapp_number',
  WHATSAPP_NUMBER_NAME = 'whatsapp_number_name',
  GROUP_JID = 'group_jid',
  GROUP_NAME = 'group_name',
  
  // Admin properties
  ADMIN_PAGE = 'admin_page',
  TARGET_USER_ID = 'target_user_id',
  OLD_VALUE = 'old_value',
  NEW_VALUE = 'new_value',
  
  // Error properties
  ERROR_MESSAGE = 'error_message',
  ERROR_CODE = 'error_code',

  // Onboarding properties
  ONBOARDING_STEP = 'onboarding_step',
  ONBOARDING_STEP_NUMBER = 'onboarding_step_number',
  ONBOARDING_TOTAL_STEPS = 'onboarding_total_steps',
  ONBOARDING_DURATION_MS = 'onboarding_duration_ms',
  ONBOARDING_SKIP_REASON = 'onboarding_skip_reason',
  WHATSAPP_SETUP_METHOD = 'whatsapp_setup_method',
}

/**
 * Type-safe event properties
 */
export type EventProperties = Partial<Record<AnalyticsProperty | string, any>>

