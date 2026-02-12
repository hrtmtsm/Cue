/**
 * Auth Helper Utilities
 * Wrapper functions for Supabase auth operations
 */

import { getSupabase } from './client'
import { getSupabaseAdminClient } from './server'

/**
 * Get Supabase client for client-side auth operations
 */
export function getSupabaseClient() {
  return getSupabase()
}

/**
 * Get Supabase admin client for server-side auth operations
 */
export function getSupabaseAdmin() {
  return getSupabaseAdminClient()
}


