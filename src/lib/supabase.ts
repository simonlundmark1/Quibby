import { createClient } from '@supabase/supabase-js';

// Temporary direct configuration (ONLY FOR DEVELOPMENT)
const supabaseUrl = 'https://sewhvvediwlgoczfghpo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld2h2dmVkaXdsZ29jemZnaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1ODQyNTcsImV4cCI6MjA1NjE2MDI1N30.KWvAzzyXrM2t5oSECG3s4bRHWRg1yL8vtdC63BFOy-c';

console.log('Supabase URL:', supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseKey); 