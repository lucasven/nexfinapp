/**
 * Standard RPC result structure from PostgreSQL functions
 */
export interface RpcResult {
  success?: boolean
  error_message?: string
  [key: string]: unknown
}

/**
 * Parse RPC result that may be returned as array or single object.
 * PostgreSQL RPC functions sometimes return single result wrapped in array.
 *
 * @example
 * const { data: rpcData } = await supabase.rpc('some_function', {...})
 * const result = parseRpcResult(rpcData)
 */
export function parseRpcResult<T>(rpcData: T | T[] | null): T | null {
  if (rpcData === null) return null
  return Array.isArray(rpcData) ? rpcData[0] : rpcData
}

/**
 * Result type for parseRpcResultWithError
 */
export type RpcParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Parse RPC result and extract success/error status.
 * Handles common pattern of { success: boolean, error_message?: string } results.
 *
 * @example
 * const { data: rpcData, error: rpcError } = await supabase.rpc('create_something', {...})
 *
 * if (rpcError) {
 *   return { success: false, error: rpcError.message }
 * }
 *
 * const parsed = parseRpcResultWithError(rpcData, "Failed to create something")
 * if (!parsed.success) {
 *   return { success: false, error: parsed.error }
 * }
 *
 * // parsed.data is now guaranteed to exist
 * const planId = parsed.data.plan_id
 */
export function parseRpcResultWithError<T extends RpcResult>(
  rpcData: T | T[] | null,
  fallbackError: string
): RpcParseResult<T> {
  const result = parseRpcResult(rpcData)

  if (!result || result.success === false) {
    return {
      success: false,
      error: result?.error_message || fallbackError
    }
  }

  return { success: true, data: result }
}
