import posthog from "posthog-js"

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  person_profiles: 'identified_only', // Creates profiles only for identified users
  capture_pageview: false, // We'll capture pageviews manually in the provider
  capture_pageleave: true,
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  debug: process.env.NODE_ENV === "development",
});
