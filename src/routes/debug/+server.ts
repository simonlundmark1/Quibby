import { json } from '@sveltejs/kit';

export function GET() {
  return json({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseKeyExists: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
} 