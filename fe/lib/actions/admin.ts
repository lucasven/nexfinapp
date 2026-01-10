/**
 * Admin Server Actions
 *
 * BACKWARD COMPATIBILITY SHIM
 *
 * This file re-exports all admin actions from the modular structure.
 * All existing imports from "@/lib/actions/admin" will continue to work.
 *
 * New code should import from "@/lib/actions/admin" (this file) or
 * directly from the specific module (e.g., "@/lib/actions/admin/users").
 *
 * NOTE: "use server" directive is NOT needed here as the actual server
 * actions are marked with "use server" in their respective module files.
 */

export * from "./admin/index"
