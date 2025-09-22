import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Player = {
  profile_id: string;
  current_alias: string | null;
  country: string | null;
  steam_id64: string | null;
  level: number | null;
  xp: number | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type PlayerSearchResult = {
  profile_id: string;
  current_alias: string;
  country: string | null;
  steam_id64: string | null;
  level: number | null;
  xp: number | null;
};