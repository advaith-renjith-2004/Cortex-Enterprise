import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://mock-supabase-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-key-for-development';

export const isSupabaseMock = supabaseKey === 'mock-key-for-development';

if (isSupabaseMock) {
  console.warn('[Cortex Config] Warning: SUPABASE_SERVICE_ROLE_KEY is not set. Database operations will run in mock mode.');
}

// Initialize Supabase Client with service role access for elevated database querying
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
