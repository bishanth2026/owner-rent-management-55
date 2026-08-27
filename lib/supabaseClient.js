import { createClient } from '@supabase/supabase-js';

// Supabase project configuration
// GitHub Pages is a static browser deployment.
// The publishable key is intended for browser use.
const SUPABASE_URL = 'https://yzymvjsnarsxiukkjand.supabase.co';

const SUPABASE_ANON_KEY =
  'sb_publishable_CgIALirp6pg35BKZWvGuUw_-iTQgEZD';

// Create Supabase client
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'biznexco-supabase-auth',
    },
  }
);
