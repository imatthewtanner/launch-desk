import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { readServerEnv } from '@/lib/config/env';

export function createSupabaseAdminClient() {
  const env = readServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Supabase admin configuration is unavailable.');
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
