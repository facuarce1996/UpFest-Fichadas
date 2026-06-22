import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data } = await supabase.from('users').select('name, reference_image').limit(10);
  console.log("USERS:", JSON.stringify(data, null, 2));

  const { data: d2 } = await supabase.from('app_settings').select('*').limit(5);
  console.log("APP_SETTINGS:", JSON.stringify(d2, null, 2));
}
main();
